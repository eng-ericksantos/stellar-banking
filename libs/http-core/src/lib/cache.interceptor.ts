import { isPlatformBrowser, isPlatformServer } from '@angular/common';
import { HttpEvent, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { PLATFORM_ID, TransferState, inject, makeStateKey } from '@angular/core';
import { Observable, of, tap } from 'rxjs';
import { HttpActivityLog } from './http-activity-log.service';
import { HttpCacheStore } from './http-cache.store';
import { CACHE_TTL_MS, SKIP_CACHE } from './http-core.tokens';
import { describeEndpoint, isApiUrl, pathOf } from './request-utils';

/** @description Formato serializado no `TransferState` (servidor → browser). */
interface TransferredResponse {
  readonly body: unknown;
  readonly status: number;
  readonly statusText: string;
}

/**
 * @description Monta uma `HttpResponse` a partir de um corpo em cache. `structuredClone` garante que
 * consumidores não mutem o objeto armazenado (o cache permaneceria "envenenado").
 * @param url URL original.
 * @param entry Corpo/status armazenados.
 * @returns Evento de resposta sintético.
 */
function toResponse(url: string, entry: TransferredResponse): HttpResponse<unknown> {
  return new HttpResponse({
    body: structuredClone(entry.body),
    status: entry.status,
    statusText: entry.statusText,
    url,
  });
}

/**
 * @description Interceptor de cache inteligente (TTL em memória + `TransferState`).
 *
 * - **Quem usa cache**: apenas `GET` cujo `HttpContext` define `CACHE_TTL_MS > 0` (ex.: taxas
 *   CDI/Selic/IPCA, que mudam no máximo 1x/dia). Dados transacionais nunca são cacheados.
 * - **SSR + Hydration**: no servidor, a resposta é gravada no `TransferState`, que viaja serializada
 *   no HTML. No browser, a *primeira* requisição igual é atendida a partir dele — sem segundo request
 *   e sem flickering (a tela hidrata com os mesmos dados que o servidor renderizou).
 * - **Invalidação**: mutações (`POST/PUT/PATCH/DELETE`) bem-sucedidas invalidam entradas do mesmo
 *   recurso; `SKIP_CACHE` força revalidação e atualiza o cache com o dado fresco.
 *
 * @param req Requisição original.
 * @param next Próximo handler.
 * @returns Resposta do cache ou da rede.
 * @example
 * http.get('/api/v1/rates', { context: apiContext({ cacheTtlMs: 300_000 }) });
 */
export const cacheInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isApiUrl(req.url)) {
    return next(req);
  }
  const store = inject(HttpCacheStore);
  const log = inject(HttpActivityLog);

  if (req.method !== 'GET') {
    return next(req).pipe(
      tap((event: HttpEvent<unknown>) => {
        if (event instanceof HttpResponse && event.ok) {
          const removed = store.invalidate(pathOf(req.url));
          if (removed > 0) {
            log.add('cache', 'info', `Cache de "${describeEndpoint(req.url)}" invalidado após alteração`);
          }
        }
      }),
    );
  }

  const ttlMs = req.context.get(CACHE_TTL_MS);
  if (ttlMs <= 0) {
    return next(req);
  }

  const platformId = inject(PLATFORM_ID);
  const transferState = inject(TransferState);
  const key = req.urlWithParams;
  const stateKey = makeStateKey<TransferredResponse>(`inv-http:${key}`);
  const now = Date.now();

  if (!req.context.get(SKIP_CACHE)) {
    const hit = store.get(key, now);
    if (hit) {
      log.add('cache', 'success', `Servido do cache (${Math.round((hit.expiresAt - now) / 1000)}s restantes): ${describeEndpoint(key)}`);
      return of(toResponse(req.url, hit));
    }
    if (isPlatformBrowser(platformId) && transferState.hasKey(stateKey)) {
      const transferred = transferState.get(stateKey, null);
      transferState.remove(stateKey);
      if (transferred) {
        store.set(key, { ...transferred, expiresAt: now + ttlMs });
        log.add('cache', 'success', `Servido do HTML do servidor (SSR), sem nova requisição: ${describeEndpoint(key)}`);
        return of(toResponse(req.url, transferred));
      }
    }
  }

  const network$: Observable<HttpEvent<unknown>> = next(req);
  return network$.pipe(
    tap((event) => {
      if (event instanceof HttpResponse && event.status === 200) {
        const snapshot: TransferredResponse = {
          body: event.body,
          status: event.status,
          statusText: event.statusText,
        };
        store.set(key, { ...snapshot, expiresAt: Date.now() + ttlMs });
        if (isPlatformServer(platformId)) {
          transferState.set(stateKey, snapshot);
        }
        log.add('cache', 'info', `Consultado na rede e guardado em cache por ${Math.round(ttlMs / 1000)}s: ${describeEndpoint(key)}`);
      }
    }),
  );
};
