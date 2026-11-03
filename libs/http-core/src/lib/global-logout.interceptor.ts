import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthSessionService, SessionTerminationReason } from '@invest/auth-security';
import { catchError, throwError } from 'rxjs';
import { HttpActivityLog } from './http-activity-log.service';
import { HTTP_FEEDBACK } from './http-core.tokens';
import { describeEndpoint, isApiUrl } from './request-utils';

/**
 * @description Interceptor de logout global.
 *
 * Posicionado como o mais externo da cadeia: enxerga o erro *final* (após auth/cache/retry).
 * Em `401`/`403` oriundos da API:
 * 1. encerra a sessão via `AuthSessionService.logout`, que zera o token, executa os handlers de
 *    limpeza (Elf, cache HTTP) e remove chaves do storage — nenhum dado do cliente anterior sobrevive;
 * 2. dispara o feedback global (modal de sessão encerrada);
 * 3. re-propaga o erro para que chamadores possam interromper seus fluxos.
 *
 * Requisições concorrentes que falham ao mesmo tempo não geram múltiplos modais: o logout só
 * ocorre se ainda existir sessão ativa.
 *
 * @param req Requisição original.
 * @param next Próximo handler.
 * @returns Stream da resposta; em erro, a sessão é encerrada e o erro re-propagado.
 * @throws {HttpErrorResponse} Sempre re-propaga o erro original.
 * @example
 * provideHttpClient(withInterceptors([globalLogoutInterceptor, authInterceptor]));
 */
export const globalLogoutInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isApiUrl(req.url)) {
    return next(req);
  }
  const session = inject(AuthSessionService);
  const feedback = inject(HTTP_FEEDBACK);
  const log = inject(HttpActivityLog);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403)) {
        const reason: SessionTerminationReason = error.status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN';
        if (session.isAuthenticated()) {
          log.add('logout', 'error', `Servidor respondeu ${error.status} em "${describeEndpoint(req.url)}": sessão encerrada e dados locais limpos`);
          session.logout(reason);
          feedback.sessionTerminated(reason);
        }
      }
      return throwError(() => error);
    }),
  );
};
