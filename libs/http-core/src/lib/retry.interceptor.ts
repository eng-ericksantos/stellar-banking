import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { TimeoutError, retry, throwError, timeout, timer } from 'rxjs';
import { HttpActivityLog } from './http-activity-log.service';
import { HTTP_FEEDBACK, RETRY_CONFIG, RETRY_SAFE, RetryConfig } from './http-core.tokens';
import { describeEndpoint, isApiUrl } from './request-utils';

/** @description Status HTTP considerados falhas *transitórias* (vale a pena tentar de novo). */
const TRANSIENT_STATUS: ReadonlySet<number> = new Set([0, 408, 429, 500, 502, 503, 504]);

/**
 * @description Calcula o atraso do Exponential Backoff com *Equal Jitter*.
 *
 * `teto = min(maxDelay, base * factor^(tentativa-1))`; o atraso final é `teto/2 + random*teto/2`.
 * O jitter dessincroniza clientes: sem ele, milhares de usuários que falharam no mesmo instante
 * voltariam *juntos* (thundering herd) e derrubariam novamente o serviço que está se recuperando.
 *
 * @param attempt Número da nova tentativa (1 = primeira nova tentativa).
 * @param config Parâmetros do backoff.
 * @returns Atraso em milissegundos (inteiro).
 * @example
 * computeBackoffDelay(2, { baseDelayMs: 600, factor: 2, maxDelayMs: 8000, random: () => 0.5 } as RetryConfig); // 900
 */
export function computeBackoffDelay(
  attempt: number,
  config: Pick<RetryConfig, 'baseDelayMs' | 'factor' | 'maxDelayMs' | 'random'>,
): number {
  const ceiling = Math.min(config.maxDelayMs, config.baseDelayMs * Math.pow(config.factor, attempt - 1));
  return Math.round(ceiling / 2 + (config.random() * ceiling) / 2);
}

/**
 * @description Decide se um erro é transitório (5xx específicos, 408/429, rede indisponível ou timeout).
 * Erros 4xx de negócio/autorização NUNCA são repetidos — repetir um 401 só adiaria o logout.
 * @param error Erro emitido pela cadeia.
 * @returns `true` se vale a pena tentar novamente.
 * @example
 * isTransientError(new HttpErrorResponse({ status: 503 })); // true
 */
export function isTransientError(error: unknown): boolean {
  if (error instanceof TimeoutError) {
    return true;
  }
  return error instanceof HttpErrorResponse && TRANSIENT_STATUS.has(error.status);
}

/**
 * @description Só repetimos métodos idempotentes (GET/HEAD/OPTIONS) ou requisições explicitamente
 * marcadas com `RETRY_SAFE`. Repetir um `POST` de ordem poderia duplicar uma aplicação financeira.
 * @param req Requisição.
 * @returns `true` se o retry é seguro.
 */
function isRetrySafe(req: HttpRequest<unknown>): boolean {
  return ['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.context.get(RETRY_SAFE);
}

/**
 * @description Interceptor de retry com Exponential Backoff + Jitter.
 *
 * Cada tentativa tem timeout próprio; falhas transitórias disparam nova tentativa após um atraso
 * crescente e o usuário é informado via `HTTP_FEEDBACK` (Snackbar/Toast) a cada tentativa.
 * Ao esgotar as tentativas, o último erro é propagado ao chamador.
 *
 * @param req Requisição original.
 * @param next Próximo handler.
 * @returns Stream da resposta, com retries aplicados.
 * @throws {HttpErrorResponse} O último erro, após esgotar as tentativas ou em erro não transitório.
 * @example
 * provideHttpClient(withInterceptors([retryInterceptor]));
 */
export const retryInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isApiUrl(req.url) || !isRetrySafe(req)) {
    return next(req);
  }
  const config = inject(RETRY_CONFIG);
  const feedback = inject(HTTP_FEEDBACK);
  const log = inject(HttpActivityLog);

  return next(req).pipe(
    timeout(config.requestTimeoutMs),
    retry({
      count: config.maxRetries,
      delay: (error: unknown, retryCount: number) => {
        if (!isTransientError(error)) {
          return throwError(() => error);
        }
        const delayMs = computeBackoffDelay(retryCount, config);
        const status = error instanceof HttpErrorResponse ? error.status : 'timeout';
        feedback.retryAttempt({
          url: describeEndpoint(req.url),
          attempt: retryCount,
          maxAttempts: config.maxRetries,
          delayMs,
          status,
        });
        log.add(
          'retry',
          'warn',
          `Falha ${status} em "${describeEndpoint(req.url)}": nova tentativa ${retryCount}/${config.maxRetries} em ${delayMs}ms`,
        );
        return timer(delayMs);
      },
    }),
  );
};
