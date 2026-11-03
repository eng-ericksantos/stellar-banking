import { Injectable, InjectionToken, Signal, computed, inject, signal } from '@angular/core';

/**
 * @description Feature Flags suportadas. União literal => flags inexistentes não compilam.
 * - `COMPARATIVE_SIMULATOR`: simulador comparativo CDB vs LCI/LCA.
 * - `MULTIMARKET_FUNDS`: exibição de fundos multimercado.
 * - `ORDER_EXECUTION`: envio de ordens de aplicação.
 */
export const FEATURE_FLAGS = ['COMPARATIVE_SIMULATOR', 'MULTIMARKET_FUNDS', 'ORDER_EXECUTION'] as const;

/** @description União literal das flags suportadas. */
export type FeatureFlag = (typeof FEATURE_FLAGS)[number];

/** @description Mapa completo flag → habilitada. */
export type FeatureFlagMap = Readonly<Record<FeatureFlag, boolean>>;

/**
 * @description Valores iniciais das flags (em produção viriam de um serviço de configuração remota).
 */
export const FEATURE_FLAG_DEFAULTS = new InjectionToken<FeatureFlagMap>('FEATURE_FLAG_DEFAULTS', {
  providedIn: 'root',
  factory: () => ({
    COMPARATIVE_SIMULATOR: true,
    MULTIMARKET_FUNDS: true,
    ORDER_EXECUTION: true,
  }),
});

/**
 * @description Serviço de Feature Flags reativo baseado em Signals.
 * Alterar uma flag em runtime atualiza imediatamente guards (na próxima navegação),
 * diretivas e templates que a leem — sem recarregar a página.
 */
@Injectable({ providedIn: 'root' })
export class FeatureFlagsService {
  private readonly defaults = inject(FEATURE_FLAG_DEFAULTS);
  private readonly state = signal<FeatureFlagMap>({ ...this.defaults });

  /** Snapshot reativo de todas as flags. */
  readonly flags = this.state.asReadonly();

  /**
   * @description Cria um `computed` que acompanha uma flag específica.
   * @param flag Flag a observar.
   * @returns Signal booleano.
   * @example
   * readonly showSimulator = inject(FeatureFlagsService).select('COMPARATIVE_SIMULATOR');
   */
  select(flag: FeatureFlag): Signal<boolean> {
    return computed(() => this.state()[flag]);
  }

  /**
   * @description Leitura pontual (rastreada se chamada dentro de `computed`/`effect`).
   * @param flag Flag a consultar.
   * @returns `true` se habilitada.
   * @example
   * if (flags.isEnabled('ORDER_EXECUTION')) { ... }
   */
  isEnabled(flag: FeatureFlag): boolean {
    return this.state()[flag];
  }

  /**
   * @description Define explicitamente o valor de uma flag.
   * @param flag Flag a alterar.
   * @param enabled Novo valor.
   * @example
   * flags.set('MULTIMARKET_FUNDS', false);
   */
  set(flag: FeatureFlag, enabled: boolean): void {
    this.state.update((current) => ({ ...current, [flag]: enabled }));
  }

  /**
   * @description Restaura os valores padrão.
   * @example
   * flags.reset();
   */
  reset(): void {
    this.state.set({ ...this.defaults });
  }
}
