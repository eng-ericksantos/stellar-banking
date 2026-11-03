import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import {
  AuthSessionService,
  JourneyScope,
  JourneyScopeError,
  JourneyScopeValidator,
  SCOPE_LABEL,
} from '@invest/auth-security';
import { throwError } from 'rxjs';
import { HttpActivityLog } from './http-activity-log.service';
import {
  API_SCOPE_POLICY,
  ApiScopeRule,
  HTTP_FEEDBACK,
  PUBLIC_ENDPOINT,
  REQUIRED_JOURNEY_SCOPE,
} from './http-core.tokens';
import { describeEndpoint, isApiUrl, pathOf } from './request-utils';

/**
 * @description Resolve o escopo exigido por um caminho usando a regra de *maior prefixo*.
 * @param path Caminho da requisição.
 * @param policy Regras endpoint → escopo.
 * @returns Escopo exigido ou `null` quando nenhuma regra se aplica.
 * @example
 * resolveRequiredScope('/api/v1/funds', rules); // 'PRIVATE_BANKING'
 */
export function resolveRequiredScope(path: string, policy: readonly ApiScopeRule[]): JourneyScope | null {
  let best: ApiScopeRule | null = null;
  for (const rule of policy) {
    if (path.startsWith(rule.pathPrefix) && (!best || rule.pathPrefix.length > best.pathPrefix.length)) {
      best = rule;
    }
  }
  return best?.scope ?? null;
}

/**
 * @description Interceptor de autenticação.
 *
 * 1. Só atua em URLs da API financeira (não vaza o JWT para terceiros).
 * 2. Valida **localmente, antes do disparo**, se o token existe, está vigente e possui o
 *    `journeyScope` exigido pelo endpoint — economiza um round-trip que terminaria em 401/403 e
 *    evita ruído nos logs do backend.
 * 3. Token ausente/expirado => `401` sintético (o `globalLogoutInterceptor` encerra a sessão).
 *    Escopo insuficiente => {@link JourneyScopeError} (falha local que NÃO derruba a sessão).
 * 4. Injeta `Authorization: Bearer <jwt>` num clone imutável da requisição.
 *
 * @param req Requisição original (imutável).
 * @param next Próximo handler da cadeia.
 * @returns Stream da resposta ou erro de validação local.
 * @throws {JourneyScopeError} Quando o token não possui o escopo exigido pelo endpoint.
 * @example
 * provideHttpClient(withInterceptors([authInterceptor]));
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isApiUrl(req.url) || req.context.get(PUBLIC_ENDPOINT)) {
    return next(req);
  }
  const session = inject(AuthSessionService);
  const validator = inject(JourneyScopeValidator);
  const policy = inject(API_SCOPE_POLICY);
  const feedback = inject(HTTP_FEEDBACK);
  const log = inject(HttpActivityLog);

  const token = session.getValidToken();
  if (!token) {
    log.add('auth', 'error', `Sessão ausente ou expirada: "${describeEndpoint(req.url)}" bloqueado antes do envio (401)`);
    return throwError(
      () =>
        new HttpErrorResponse({
          status: 401,
          statusText: 'Unauthorized',
          url: req.url,
          error: { codigo: 'TOKEN_AUSENTE', mensagem: 'Token ausente ou expirado.' },
        }),
    );
  }

  const requiredScope = req.context.get(REQUIRED_JOURNEY_SCOPE) ?? resolveRequiredScope(pathOf(req.url), policy);
  if (requiredScope) {
    const result = validator.validate(token, requiredScope);
    if (!result.valid) {
      const error = new JourneyScopeError(requiredScope, session.journeyScopes());
      log.add('auth', 'warn', `Jornada ${SCOPE_LABEL[requiredScope]} não liberada: "${describeEndpoint(req.url)}" bloqueado antes do envio`);
      feedback.warn(`Esta operação exige a jornada ${SCOPE_LABEL[requiredScope]}, que não está disponível no seu perfil.`);
      return throwError(() => error);
    }
  }

  return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};
