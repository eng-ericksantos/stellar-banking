import { Injectable, inject, signal } from '@angular/core';
import { API_ENDPOINTS } from './api-contracts';
import { RETRY_CONFIG } from './http-core.tokens';
import { MockBackendState, createMockBackendState } from './mock-financial-api';

/** @description Falha forçada armada pelo painel de depuração. */
export interface ForcedFailure {
  readonly status: 503 | 401;
  /** Quantas requisições ainda devem falhar antes de a API "se recuperar". */
  readonly remaining: number;
  /** Prefixo do endpoint alvo da falha. */
  readonly pathPrefix: string;
  /** Rótulo descritivo para a UI. */
  readonly label: string;
}

/**
 * @description Painel de controle do backend simulado. O botão da UI "arma" uma falha; o
 * `mockFinancialApiInterceptor` a consome nas próximas requisições ao endpoint-alvo.
 * Estado em `signal` => a UI exibe imediatamente que há uma falha armada.
 */
@Injectable({ providedIn: 'root' })
export class MockControlService {
  private readonly retryConfig = inject(RETRY_CONFIG);
  private readonly state = signal<ForcedFailure | null>(null);

  /** Estado do backend simulado (carteira e protocolos), isolado por injector. */
  readonly backend: MockBackendState = createMockBackendState();

  /** Falha atualmente armada (ou `null`). */
  readonly armed = this.state.asReadonly();

  /**
   * @description Arma um 503 *transitório*: 2 falhas e, depois, a API se recupera — o retry com
   * backoff deve concluir com sucesso.
   * @example
   * mock.armTransient503();
   */
  armTransient503(): void {
    this.state.set({
      status: 503,
      remaining: Math.min(2, this.retryConfig.maxRetries),
      pathPrefix: API_ENDPOINTS.fixedIncome,
      label: 'falha temporária (se recupera após 2 tentativas)',
    });
  }

  /**
   * @description Arma um 503 *persistente*: falha em todas as tentativas, esgotando o retry.
   * @example
   * mock.armPersistent503();
   */
  armPersistent503(): void {
    this.state.set({
      status: 503,
      remaining: this.retryConfig.maxRetries + 1,
      pathPrefix: API_ENDPOINTS.fixedIncome,
      label: 'falha persistente (esgota as tentativas)',
    });
  }

  /**
   * @description Arma um 401 único — deve acionar o `globalLogoutInterceptor`.
   * @example
   * mock.armUnauthorized();
   */
  armUnauthorized(): void {
    this.state.set({
      status: 401,
      remaining: 1,
      pathPrefix: API_ENDPOINTS.fixedIncome,
      label: 'sessão expirada (401)',
    });
  }

  /**
   * @description Remove qualquer falha armada.
   * @example
   * mock.disarm();
   */
  disarm(): void {
    this.state.set(null);
  }

  /**
   * @description Consome uma falha se o caminho corresponder ao alvo armado.
   * @param path Caminho da requisição.
   * @returns Status HTTP a simular, ou `null` se a requisição deve ser atendida normalmente.
   * @example
   * const status = mock.consume('/api/v1/fixed-income'); // 503 | 401 | null
   */
  consume(path: string): 503 | 401 | null {
    const current = this.state();
    if (!current || !path.startsWith(current.pathPrefix)) {
      return null;
    }
    const remaining = current.remaining - 1;
    this.state.set(remaining > 0 ? { ...current, remaining } : null);
    return current.status;
  }
}
