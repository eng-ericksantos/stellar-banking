import { HttpContext, HttpContextToken } from '@angular/common/http';
import { InjectionToken } from '@angular/core';
import { JourneyScope, SessionTerminationReason } from '@invest/auth-security';
import { API_BASE_PATH, API_ENDPOINTS } from './api-contracts';

/**
 * @description Escopo de jornada exigido pela requisição. Quando `null`, o `authInterceptor`
 * consulta {@link API_SCOPE_POLICY}. Usar `HttpContext` (e não headers customizados) evita que
 * metadados internos vazem para a rede.
 */
export const REQUIRED_JOURNEY_SCOPE = new HttpContextToken<JourneyScope | null>(() => null);

/** @description TTL (ms) de cache em memória; `0` desativa o cache para a requisição. */
export const CACHE_TTL_MS = new HttpContextToken<number>(() => 0);

/** @description Quando `true`, ignora a leitura do cache (mas grava a resposta fresca). */
export const SKIP_CACHE = new HttpContextToken<boolean>(() => false);

/** @description Marca requisições não-GET como seguras para retry (idempotentes). */
export const RETRY_SAFE = new HttpContextToken<boolean>(() => false);

/** @description Marca endpoints públicos que dispensam JWT. */
export const PUBLIC_ENDPOINT = new HttpContextToken<boolean>(() => false);

/**
 * @description Opções para montar um `HttpContext` tipado.
 */
export interface ApiContextOptions {
  readonly scope?: JourneyScope;
  readonly cacheTtlMs?: number;
  readonly skipCache?: boolean;
  readonly retrySafe?: boolean;
  readonly publicEndpoint?: boolean;
}

/**
 * @description Constrói um `HttpContext` a partir de opções tipadas.
 * @param options Opções de escopo, cache e retry.
 * @returns `HttpContext` pronto para uso em `HttpClient`.
 * @example
 * http.get(url, { context: apiContext({ scope: 'RETAIL', cacheTtlMs: 300_000 }) });
 */
export function apiContext(options: ApiContextOptions = {}): HttpContext {
  let context = new HttpContext();
  if (options.scope) {
    context = context.set(REQUIRED_JOURNEY_SCOPE, options.scope);
  }
  if (options.cacheTtlMs !== undefined) {
    context = context.set(CACHE_TTL_MS, options.cacheTtlMs);
  }
  if (options.skipCache) {
    context = context.set(SKIP_CACHE, true);
  }
  if (options.retrySafe) {
    context = context.set(RETRY_SAFE, true);
  }
  if (options.publicEndpoint) {
    context = context.set(PUBLIC_ENDPOINT, true);
  }
  return context;
}

/** @description Regra que associa um prefixo de endpoint ao escopo de jornada exigido. */
export interface ApiScopeRule {
  readonly pathPrefix: string;
  readonly scope: JourneyScope;
}

/**
 * @description Política padrão endpoint → escopo. A regra de maior prefixo vence (ver `authInterceptor`).
 */
export const API_SCOPE_POLICY = new InjectionToken<readonly ApiScopeRule[]>('API_SCOPE_POLICY', {
  providedIn: 'root',
  factory: () => [
    { pathPrefix: API_BASE_PATH, scope: 'RETAIL' },
    { pathPrefix: API_ENDPOINTS.funds, scope: 'PRIVATE_BANKING' },
    { pathPrefix: API_ENDPOINTS.orders, scope: 'PRIVATE_BANKING' },
  ],
});

/**
 * @description Configuração da estratégia de Exponential Backoff com Jitter.
 */
export interface RetryConfig {
  /** Número máximo de novas tentativas após a primeira falha. */
  readonly maxRetries: number;
  /** Atraso base (ms) da primeira nova tentativa. */
  readonly baseDelayMs: number;
  /** Fator multiplicativo do backoff (normalmente 2). */
  readonly factor: number;
  /** Teto do atraso (ms) — evita esperas absurdas. */
  readonly maxDelayMs: number;
  /** Timeout (ms) de cada tentativa. */
  readonly requestTimeoutMs: number;
  /** Fonte de aleatoriedade em [0,1) — injetável para testes determinísticos. */
  readonly random: () => number;
}

/** @description Configuração padrão do retry. */
export const RETRY_CONFIG = new InjectionToken<RetryConfig>('RETRY_CONFIG', {
  providedIn: 'root',
  factory: () => ({
    maxRetries: 3,
    baseDelayMs: 600,
    factor: 2,
    maxDelayMs: 8000,
    requestTimeoutMs: 10_000,
    random: () => Math.random(),
  }),
});

/** @description Informações de uma nova tentativa (exibidas no feedback visual). */
export interface RetryAttemptInfo {
  readonly url: string;
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly delayMs: number;
  readonly status: number | 'timeout';
}

/**
 * @description Porta (hexagonal) de feedback visual. A lib `http-core` não conhece Material:
 * a aplicação host fornece a implementação (MatSnackBar/MatDialog), o que mantém a lib
 * independente de UI e trivial de testar com um mock.
 */
export interface HttpFeedbackPort {
  /** Mensagem informativa (ex.: "Cache hit"). */
  info(message: string): void;
  /** Aviso (ex.: escopo insuficiente). */
  warn(message: string): void;
  /** Erro definitivo. */
  error(message: string): void;
  /** Nova tentativa agendada pelo retry. */
  retryAttempt(info: RetryAttemptInfo): void;
  /** Sessão encerrada globalmente (modal). */
  sessionTerminated(reason: SessionTerminationReason): void;
}

/** @description Implementação padrão: apenas `console`, para uso sem UI. */
export const HTTP_FEEDBACK = new InjectionToken<HttpFeedbackPort>('HTTP_FEEDBACK', {
  providedIn: 'root',
  factory: () => ({
    info: (message) => console.info(`[http-core] ${message}`),
    warn: (message) => console.warn(`[http-core] ${message}`),
    error: (message) => console.error(`[http-core] ${message}`),
    retryAttempt: (info) =>
      console.warn(`[http-core] retry ${info.attempt}/${info.maxAttempts} em ${info.delayMs}ms (${info.url})`),
    sessionTerminated: (reason) => console.warn(`[http-core] sessão encerrada: ${reason}`),
  }),
});

/** @description Configuração do backend simulado. */
export interface MockApiConfig {
  /** Latência mínima simulada (ms). */
  readonly minLatencyMs: number;
  /** Latência máxima simulada (ms). */
  readonly maxLatencyMs: number;
}

/** @description Configuração padrão do mock (latência realista de 150–450 ms). */
export const MOCK_API_CONFIG = new InjectionToken<MockApiConfig>('MOCK_API_CONFIG', {
  providedIn: 'root',
  factory: () => ({ minLatencyMs: 150, maxLatencyMs: 450 }),
});
