import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AuthSessionService,
  FeatureFlagsService,
  JourneyScopeError,
  SCOPE_LABEL,
  SESSION_CLEANUP_HANDLERS,
} from '@invest/auth-security';
import { OrderReceiptDto, SimulationReceiptDto } from '@invest/http-core';
import { firstValueFrom } from 'rxjs';
import { InvestmentApi } from '../api/investment.api';
import { ISIN } from '../domain/branded';
import {
  IndexadorFilter,
  InvestmentAsset,
  SimulationInput,
} from '../domain/models';
import {
  EMPTY_PORTFOLIO_SUMMARY,
  PortfolioSummary,
  buildPortfolioSummary,
  daysBetween,
} from '../domain/portfolio';
import {
  ComparisonInput,
  ComparisonResult,
  SimulationResult,
  compareCdbVsIsento,
  simulateYield,
} from '../domain/yield-calculator';
import { InvestmentElfRepository } from '../state/investment.repository';

/** @description Tempo (ms) em que o estado em memória é considerado fresco. */
export const STATE_FRESHNESS_MS = 60_000;

/** @description Parâmetros editáveis do simulador comparativo. */
export interface ComparisonParams {
  readonly cdbPercentCdi: number;
  readonly isentoPercentCdi: number;
}

/**
 * @description Extrai a mensagem de negócio (`ApiErrorDto.mensagem`) de um erro HTTP, quando existir.
 * @param error Erro HTTP.
 * @returns Mensagem legível ou `undefined`.
 */
function apiMessage(error: HttpErrorResponse): string | undefined {
  const body: unknown = error.error;
  if (typeof body === 'object' && body !== null && 'mensagem' in body) {
    const message = (body as { mensagem: unknown }).mensagem;
    return typeof message === 'string' ? message : undefined;
  }
  return undefined;
}

/**
 * @description Traduz erros técnicos em mensagens amigáveis para a UI.
 * @param error Erro capturado.
 * @returns Mensagem em português.
 * @example
 * describeError(new HttpErrorResponse({ status: 503 })); // 'Serviço indisponível...'
 */
export function describeError(error: unknown): string {
  if (error instanceof JourneyScopeError) {
    return `Esta operação exige a jornada ${SCOPE_LABEL[error.requiredScope]}, que não está disponível no seu perfil.`;
  }
  if (error instanceof HttpErrorResponse) {
    switch (error.status) {
      case 401:
        return 'Sessão inválida ou expirada.';
      case 403:
        return 'Acesso negado para este recurso.';
      case 503:
        return 'Serviço indisponível no momento. Tente novamente em instantes.';
      default:
        return apiMessage(error) ?? `Falha na comunicação com o servidor (HTTP ${error.status}).`;
    }
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Ocorreu um erro inesperado.';
}

/**
 * @description **Facade** da feature de investimentos: única porta de entrada do MFE para dados e
 * regras de negócio. Componentes *não* conhecem HTTP nem Elf — apenas leem Signals e chamam métodos.
 *
 * Fluxo reativo: `Elf (BehaviorSubject) → toSignal → computed (derivações) → templates OnPush`.
 * Alterar o filtro, o ativo selecionado ou os parâmetros recalcula apenas o necessário (memoização
 * dos `computed`) e o Angular re-renderiza somente os componentes que leram os Signals afetados.
 */
@Injectable({ providedIn: 'root' })
export class InvestmentFacade {
  private readonly repository = inject(InvestmentElfRepository);
  private readonly api = inject(InvestmentApi);
  private readonly session = inject(AuthSessionService);
  private readonly flags = inject(FeatureFlagsService);

  // ───────────────────────────── estado vindo do Elf ─────────────────────────────

  /** Todos os ativos do store. */
  readonly assets = toSignal(this.repository.assets$, { requireSync: true });
  /** Taxas de mercado (CDI/Selic/IPCA). */
  readonly rates = toSignal(this.repository.rates$, { requireSync: true });
  /** Posições da carteira. */
  readonly positions = toSignal(this.repository.positions$, { requireSync: true });
  /** Status de carregamento. */
  readonly status = toSignal(this.repository.status$, { requireSync: true });
  /** Mensagem de erro. */
  readonly error = toSignal(this.repository.error$, { requireSync: true });
  /** Instante da última atualização. */
  readonly lastUpdatedAt = toSignal(this.repository.lastUpdatedAt$, { requireSync: true });

  // ───────────────────────────── estado de UI/simulação ─────────────────────────────

  private readonly indexadorState = signal<IndexadorFilter>('TODOS');
  private readonly selectedIsinState = signal<ISIN | null>(null);
  private readonly simulationParamsState = signal<SimulationInput>({ valor: 10_000, prazoDias: 720 });
  private readonly comparisonParamsState = signal<ComparisonParams>({ cdbPercentCdi: 110, isentoPercentCdi: 92 });

  /** Filtro de indexador ativo. */
  readonly indexadorFilter = this.indexadorState.asReadonly();
  /** ISIN selecionado. */
  readonly selectedIsin = this.selectedIsinState.asReadonly();
  /** Parâmetros do simulador de rendimento. */
  readonly simulationParams = this.simulationParamsState.asReadonly();
  /** Parâmetros do simulador comparativo. */
  readonly comparisonParams = this.comparisonParamsState.asReadonly();

  // ───────────────────────────── derivações (computed) ─────────────────────────────

  /** `true` durante o carregamento. */
  readonly loading = computed(() => this.status() === 'loading');

  /** Ativos visíveis conforme o filtro de indexador e as flags (fundos podem ser desligados). */
  readonly filteredAssets = computed<readonly InvestmentAsset[]>(() => {
    const filter = this.indexadorState();
    const fundsEnabled = this.flags.isEnabled('MULTIMARKET_FUNDS');
    return this.assets().filter(
      (asset) =>
        (filter === 'TODOS' || asset.indexador === filter) && (fundsEnabled || asset.kind !== 'FUNDO_MULTIMERCADO'),
    );
  });

  /** Ativo selecionado (ou `null`). */
  readonly selectedAsset = computed<InvestmentAsset | null>(() => {
    const isin = this.selectedIsinState();
    return isin ? (this.assets().find((asset) => asset.isin === isin) ?? null) : null;
  });

  /** Dias até o vencimento do ativo selecionado (`null` para fundos abertos ou sem seleção). */
  readonly maturityDays = computed<number | null>(() => {
    const asset = this.selectedAsset();
    const rates = this.rates();
    if (!asset?.vencimento || !rates) {
      return null;
    }
    return Math.max(1, daysBetween(rates.referencia, asset.vencimento));
  });

  /** Resultado da simulação do ativo selecionado (ou `null`). */
  readonly simulationResult = computed<SimulationResult | null>(() => {
    const asset = this.selectedAsset();
    const rates = this.rates();
    const params = this.simulationParamsState();
    if (!asset || !rates || params.valor <= 0 || params.prazoDias <= 0) {
      return null;
    }
    return simulateYield(asset, rates, params);
  });

  /** Comparativo CDB × LCI/LCA com o valor/prazo do simulador principal. */
  readonly comparison = computed<ComparisonResult | null>(() => {
    const rates = this.rates();
    const params = this.simulationParamsState();
    if (!rates || params.valor <= 0 || params.prazoDias <= 0) {
      return null;
    }
    const input: ComparisonInput = { ...params, ...this.comparisonParamsState() };
    return compareCdbVsIsento(input, rates);
  });

  /** Resumo patrimonial para os cards de KPI. */
  readonly portfolioSummary = computed<PortfolioSummary>(() =>
    this.rates() ? buildPortfolioSummary(this.positions(), this.assets(), this.rates()) : EMPTY_PORTFOLIO_SUMMARY,
  );

  private inFlight: Promise<void> | null = null;

  /**
   * @description Registra (i) a limpeza do store no logout e (ii) o efeito que carrega/remove os
   * fundos conforme o escopo de jornada do token — alternar RETAIL ↔ PRIVATE_BANKING reflete na lista.
   */
  constructor() {
    effect(() => {
      const privateScope = this.session.journeyScopes().includes('PRIVATE_BANKING');
      const fundsEnabled = this.flags.isEnabled('MULTIMARKET_FUNDS');
      untracked(() => {
        if (privateScope && fundsEnabled) {
          if (this.status() === 'success') {
            void this.loadFunds();
          }
        } else {
          this.repository.removeAssetsByKind('FUNDO_MULTIMERCADO');
        }
      });
    });
  }

  /**
   * @description Carrega taxas, catálogo e carteira (e fundos, se o escopo permitir).
   * Chamadas concorrentes compartilham a mesma promessa (evita requisições duplicadas).
   * @param options `forceRefresh` ignora o cache de taxas.
   * @returns Promessa resolvida ao final (nunca rejeita: erros vão para o signal `error`).
   * @example
   * await facade.load();
   */
  load(options: { readonly forceRefresh?: boolean } = {}): Promise<void> {
    if (this.inFlight) {
      return this.inFlight;
    }
    if (!options.forceRefresh && this.isFresh()) {
      return Promise.resolve();
    }
    this.inFlight = this.doLoad(options).finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  /**
   * @description Recarrega tudo ignorando o cache de taxas.
   * @returns Promessa resolvida ao final.
   * @example
   * await facade.refresh();
   */
  refresh(): Promise<void> {
    return this.load({ forceRefresh: true });
  }

  /**
   * @description Seleciona (ou limpa) o ativo para simulação.
   * @param isin ISIN do ativo ou `null`.
   * @example
   * facade.selectAsset(asset.isin);
   */
  selectAsset(isin: ISIN | null): void {
    this.selectedIsinState.set(isin);
    this.clampTermToMaturity();
  }

  /**
   * @description Define o filtro de indexador.
   * @param filter `'TODOS'`, `'CDI'`, `'IPCA'` ou `'PRE'`.
   * @example
   * facade.setIndexadorFilter('IPCA');
   */
  setIndexadorFilter(filter: IndexadorFilter): void {
    this.indexadorState.set(filter);
  }

  /**
   * @description Atualiza o valor/prazo do simulador (valores inválidos são saneados).
   * @param params Parâmetros parciais.
   * @example
   * facade.setSimulationParams({ valor: 25_000 });
   */
  setSimulationParams(params: Partial<SimulationInput>): void {
    this.simulationParamsState.update((current) => ({
      valor: Math.max(0, params.valor ?? current.valor),
      prazoDias: Math.max(1, Math.round(params.prazoDias ?? current.prazoDias)),
    }));
    this.clampTermToMaturity();
  }

  /**
   * @description Impede simular um prazo maior que o vencimento do título selecionado (o investimento
   * deixaria de existir): se exceder, o prazo é reduzido ao número de dias até o vencimento.
   */
  private clampTermToMaturity(): void {
    const max = this.maturityDays();
    if (max !== null && this.simulationParamsState().prazoDias > max) {
      this.simulationParamsState.update((current) => ({ ...current, prazoDias: max }));
    }
  }

  /**
   * @description Atualiza as taxas do comparativo.
   * @param params Parâmetros parciais.
   * @example
   * facade.setComparisonParams({ isentoPercentCdi: 95 });
   */
  setComparisonParams(params: Partial<ComparisonParams>): void {
    this.comparisonParamsState.update((current) => ({ ...current, ...params }));
  }

  /**
   * @description Registra a simulação corrente no backend.
   * @returns Comprovante da simulação.
   * @throws {Error} Se não houver ativo selecionado.
   * @example
   * const receipt = await facade.registerSimulation();
   */
  async registerSimulation(): Promise<SimulationReceiptDto> {
    const asset = this.selectedAsset();
    if (!asset) {
      throw new Error('Selecione um ativo antes de registrar a simulação.');
    }
    const { valor, prazoDias } = this.simulationParamsState();
    return firstValueFrom(this.api.registerSimulation({ isin: asset.isin, valor, prazoDias }));
  }

  /**
   * @description Envia uma ordem de aplicação e, em caso de sucesso, **muta o estado no Elf**
   * (adiciona/soma a posição) — a UI reage via Signals sem novo request.
   * @param isin ISIN do ativo.
   * @param valor Valor a aplicar.
   * @returns Comprovante da ordem.
   * @throws {Error} Se o ativo não existir no catálogo.
   * @throws {JourneyScopeError} Se o token não tiver a jornada PRIVATE_BANKING.
   * @example
   * const receipt = await facade.invest(asset.isin, 5000);
   */
  async invest(isin: ISIN, valor: number): Promise<OrderReceiptDto> {
    const asset = this.assets().find((candidate) => candidate.isin === isin);
    if (!asset) {
      throw new Error(`Ativo ${isin} não encontrado no catálogo.`);
    }
    const receipt = await firstValueFrom(this.api.placeOrder({ isin, valor }));
    this.repository.addPosition({ isin, valorAplicado: valor, dataAplicacao: this.rates()?.referencia ?? '' });
    return receipt;
  }

  /**
   * @description Limpa todo o estado de investimentos (logout).
   * @example
   * facade.clear();
   */
  clear(): void {
    this.repository.reset();
    this.selectedIsinState.set(null);
    this.indexadorState.set('TODOS');
  }

  /**
   * @description Indica se os dados em memória (Elf) ainda são recentes. É o que impede nova
   * requisição ao reentrar na rota e após a hidratação SSR (o estado já chegou pronto).
   * @returns `true` se carregado com sucesso há menos de {@link STATE_FRESHNESS_MS}.
   */
  private isFresh(): boolean {
    const updatedAt = this.lastUpdatedAt();
    return this.status() === 'success' && updatedAt !== null && Date.now() - updatedAt < STATE_FRESHNESS_MS;
  }

  /**
   * @description Implementação do carregamento principal.
   * @param options Opções de carregamento.
   */
  private async doLoad(options: { readonly forceRefresh?: boolean }): Promise<void> {
    this.repository.setStatus('loading');
    try {
      const [rates, fixedIncome, positions] = await Promise.all([
        firstValueFrom(this.api.getRates({ forceRefresh: options.forceRefresh })),
        firstValueFrom(this.api.getFixedIncome()),
        firstValueFrom(this.api.getPortfolio()),
      ]);
      fixedIncome.rejected.forEach((rejection) => console.warn('[data-access] ativo rejeitado:', rejection.message));
      this.repository.setRates(rates);
      this.repository.upsertAssets(fixedIncome.assets);
      this.repository.setPositions(positions);
      this.repository.setStatus('success');
      if (this.session.journeyScopes().includes('PRIVATE_BANKING') && this.flags.isEnabled('MULTIMARKET_FUNDS')) {
        await this.loadFunds();
      }
    } catch (error) {
      this.repository.setStatus('error', describeError(error));
    }
  }

  /**
   * @description Carrega fundos (somente Private). Falhas ficam registradas sem derrubar o catálogo.
   */
  private async loadFunds(): Promise<void> {
    try {
      const funds = await firstValueFrom(this.api.getFunds());
      this.repository.upsertAssets(funds.assets);
    } catch (error) {
      console.warn('[data-access] falha ao carregar fundos:', describeError(error));
    }
  }
}

/**
 * @description Provider multi que registra a limpeza do store Elf no logout. Depende do *repositório*
 * (e não do facade) para não criar dependência circular com `AuthSessionService`, que injeta os handlers
 * de limpeza em sua construção. Incluído por {@link provideInvestmentsDataAccess}.
 */
export const INVESTMENT_CLEANUP_PROVIDER = {
  provide: SESSION_CLEANUP_HANDLERS,
  multi: true,
  useFactory: () => {
    const repository = inject(InvestmentElfRepository);
    return () => repository.reset();
  },
};
