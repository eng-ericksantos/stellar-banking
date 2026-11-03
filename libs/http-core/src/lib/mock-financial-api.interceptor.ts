import { HttpErrorResponse, HttpEvent, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { JwtClaims, decodeJwt, isExpired } from '@invest/auth-security';
import { Observable, mergeMap, of, throwError, timer } from 'rxjs';
import { HttpActivityLog } from './http-activity-log.service';
import { MOCK_API_CONFIG } from './http-core.tokens';
import { MockControlService } from './mock-control.service';
import { handleMockRequest } from './mock-financial-api';
import { describeEndpoint, isApiUrl, pathOf } from './request-utils';

/**
 * @description Extrai e valida as claims do header `Authorization: Bearer`, como o servidor faria.
 * @param header Valor do header (ou `null`).
 * @returns Claims válidas e vigentes, ou `null`.
 */
function claimsFromHeader(header: string | null): JwtClaims | null {
  if (!header?.startsWith('Bearer ')) {
    return null;
  }
  try {
    const claims = decodeJwt(header.slice('Bearer '.length));
    return isExpired(claims, Date.now()) ? null : claims;
  } catch {
    return null;
  }
}

/**
 * @description Interceptor que *substitui o backend*: responde às rotas `/api/v1/*` com dados do
 * mercado financeiro brasileiro, simulando latência de rede e falhas forçadas (503/401) pelo painel.
 *
 * Deve ser o ÚLTIMO da cadeia: o tráfego já passou por auth, cache e retry, exatamente como
 * passaria em produção — logo, o comportamento dos demais interceptors é demonstrado com fidelidade.
 * Para usar um backend real, basta remover este interceptor de `provideHttpCore`.
 *
 * @param req Requisição original.
 * @param next Próximo handler (não utilizado para rotas da API simulada).
 * @returns Resposta simulada ou erro HTTP simulado.
 * @throws {HttpErrorResponse} Para status >= 400 simulados.
 * @example
 * provideHttpClient(withInterceptors([..., mockFinancialApiInterceptor]));
 */
export const mockFinancialApiInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isApiUrl(req.url)) {
    return next(req);
  }
  const control = inject(MockControlService);
  const config = inject(MOCK_API_CONFIG);
  const log = inject(HttpActivityLog);
  const path = pathOf(req.url);

  const latency =
    config.minLatencyMs + Math.round(Math.random() * Math.max(0, config.maxLatencyMs - config.minLatencyMs));

  return timer(latency).pipe(
    mergeMap((): Observable<HttpEvent<unknown>> => {
      const forced = control.consume(path);
      if (forced !== null) {
        log.add('mock', 'error', `Falha ${forced} simulada em "${describeEndpoint(req.url)}"`);
        return throwError(
          () =>
            new HttpErrorResponse({
              status: forced,
              statusText: forced === 503 ? 'Service Unavailable' : 'Unauthorized',
              url: req.url,
              error: { codigo: `FORCADO_${forced}`, mensagem: `Falha ${forced} simulada pelo painel.` },
            }),
        );
      }
      const result = handleMockRequest(
        {
          method: req.method,
          path,
          body: req.body,
          claims: claimsFromHeader(req.headers.get('Authorization')),
        },
        control.backend,
      );
      if (result.status >= 400) {
        log.add('mock', 'warn', `"${describeEndpoint(req.url)}" respondeu ${result.status}`);
        return throwError(
          () =>
            new HttpErrorResponse({
              status: result.status,
              statusText: 'Error',
              url: req.url,
              error: result.body,
            }),
        );
      }
      log.add('mock', 'success', `"${describeEndpoint(req.url)}" respondeu ${result.status} em ${latency}ms`);
      return of(new HttpResponse({ status: result.status, body: result.body, url: req.url }));
    }),
  );
};
