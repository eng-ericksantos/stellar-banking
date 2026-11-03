import { HttpFeature, HttpFeatureKind, provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { EnvironmentProviders, inject, makeEnvironmentProviders } from '@angular/core';
import { SESSION_CLEANUP_HANDLERS } from '@invest/auth-security';
import { authInterceptor } from './auth.interceptor';
import { cacheInterceptor } from './cache.interceptor';
import { globalLogoutInterceptor } from './global-logout.interceptor';
import { HttpCacheStore } from './http-cache.store';
import { mockFinancialApiInterceptor } from './mock-financial-api.interceptor';
import { retryInterceptor } from './retry.interceptor';

/** @description Opções de {@link provideHttpCore}. */
export interface HttpCoreOptions {
  /** Quando `true` (padrão), responde `/api/v1/*` com o backend simulado e funciona 100% offline. */
  readonly useMockApi?: boolean;
  /** Features adicionais do `provideHttpClient` (ex.: `withInterceptorsFromDi`). */
  readonly extraFeatures?: readonly HttpFeature<HttpFeatureKind>[];
}

/**
 * @description Registra o `HttpClient` com a cadeia de interceptors funcionais na ordem correta:
 *
 * ```
 * request  → globalLogout → auth → cache → retry → mock/rede
 * response ← globalLogout ← auth ← cache ← retry ← mock/rede
 * ```
 *
 * - `globalLogout` fica por fora para observar o erro final (após retries).
 * - `auth` precede `cache`: o escopo é validado mesmo para respostas que seriam servidas do cache.
 * - `cache` precede `retry`: um cache hit nunca dispara tentativas.
 * - `retry` é o mais interno: repete apenas a chamada de rede.
 * - `withFetch()` usa a Fetch API (recomendada para SSR).
 *
 * Também registra a limpeza do cache HTTP no encerramento de sessão.
 *
 * @param options Opções (mock, features extras).
 * @returns Providers de ambiente.
 * @example
 * bootstrapApplication(App, { providers: [provideHttpCore({ useMockApi: true })] });
 */
export function provideHttpCore(options: HttpCoreOptions = {}): EnvironmentProviders {
  const useMock = options.useMockApi ?? true;
  const interceptors = [
    globalLogoutInterceptor,
    authInterceptor,
    cacheInterceptor,
    retryInterceptor,
    ...(useMock ? [mockFinancialApiInterceptor] : []),
  ];
  return makeEnvironmentProviders([
    provideHttpClient(withFetch(), withInterceptors(interceptors), ...(options.extraFeatures ?? [])),
    {
      provide: SESSION_CLEANUP_HANDLERS,
      multi: true,
      useFactory: () => {
        const cache = inject(HttpCacheStore);
        return () => cache.clear();
      },
    },
  ]);
}
