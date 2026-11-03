import { isPlatformServer } from '@angular/common';
import { Injectable, OnDestroy, PLATFORM_ID, TransferState, inject, makeStateKey } from '@angular/core';
import { createStore, select, setProps, withProps } from '@ngneat/elf';
import {
  deleteEntitiesByPredicate,
  getAllEntities,
  getEntity,
  selectAllEntities,
  upsertEntities,
  withEntities,
} from '@ngneat/elf-entities';
import { Observable } from 'rxjs';
import { ISIN } from '../domain/branded';
import { AssetKind, InvestmentAsset, MarketRates, Position } from '../domain/models';

/** @description Estados do ciclo de carregamento. */
export type LoadStatus = 'idle' | 'loading' | 'success' | 'error';

/** @description Propriedades "não-entidade" do store. */
export interface InvestmentProps {
  readonly rates: MarketRates | null;
  readonly positions: readonly Position[];
  readonly status: LoadStatus;
  readonly error: string | null;
  readonly lastUpdatedAt: number | null;
}

const INITIAL_PROPS: InvestmentProps = {
  rates: null,
  positions: [],
  status: 'idle',
  error: null,
  lastUpdatedAt: null,
};

/** @description Fotografia serializável do store, transferida do servidor (SSR) para o browser. */
export interface InvestmentSnapshot {
  readonly assets: readonly InvestmentAsset[];
  readonly rates: MarketRates | null;
  readonly positions: readonly Position[];
  readonly lastUpdatedAt: number | null;
}

/** @description Chave do `TransferState` que carrega o estado do Elf no HTML renderizado. */
export const INVESTMENT_STATE_KEY = makeStateKey<InvestmentSnapshot | null>('inv-investments-state');

/**
 * @description Repositório **Elf** dos ativos financeiros.
 *
 * - `withEntities` mantém os ativos normalizados por `isin` (O(1) em busca/atualização) e permite
 *   `upsert` incremental — ideal para cache: recarregar o catálogo não recria o que não mudou.
 * - `withProps` guarda taxas, carteira e status de carregamento.
 * - As mutações são os ÚNICOS pontos que escrevem no store; leitura é exposta como Observables
 *   que o `InvestmentFacade` converte em Signals.
 */
@Injectable({ providedIn: 'root' })
export class InvestmentElfRepository implements OnDestroy {
  private readonly store = createStore(
    { name: 'investments' },
    withEntities<InvestmentAsset, 'isin'>({ idKey: 'isin' }),
    withProps<InvestmentProps>(INITIAL_PROPS),
  );

  /** Todos os ativos (emite sincronamente o valor atual — requisito do `toSignal({ requireSync })`). */
  readonly assets$: Observable<InvestmentAsset[]> = this.store.pipe(selectAllEntities());

  /** Taxas de mercado. */
  readonly rates$: Observable<MarketRates | null> = this.store.pipe(select((state) => state.rates));

  /** Posições da carteira. */
  readonly positions$: Observable<readonly Position[]> = this.store.pipe(select((state) => state.positions));

  /** Status do carregamento. */
  readonly status$: Observable<LoadStatus> = this.store.pipe(select((state) => state.status));

  /** Mensagem de erro corrente. */
  readonly error$: Observable<string | null> = this.store.pipe(select((state) => state.error));

  /** Instante da última atualização bem-sucedida. */
  readonly lastUpdatedAt$: Observable<number | null> = this.store.pipe(select((state) => state.lastUpdatedAt));

  /**
   * @description Hidratação do estado entre servidor e browser:
   * - **Servidor**: registra `onSerialize`, que grava no `TransferState` o snapshot FINAL do store
   *   quando o HTML termina de ser renderizado.
   * - **Browser**: se existir snapshot, restaura o store *antes do primeiro render*. Assim o DOM
   *   hidratado coincide com o HTML do servidor (sem mismatch, sem flickering) e nenhuma requisição
   *   duplicada é disparada.
   */
  constructor() {
    const transferState = inject(TransferState);
    if (isPlatformServer(inject(PLATFORM_ID))) {
      transferState.onSerialize(INVESTMENT_STATE_KEY, () => this.snapshot());
      return;
    }
    const snapshot = transferState.get(INVESTMENT_STATE_KEY, null);
    if (snapshot) {
      transferState.remove(INVESTMENT_STATE_KEY);
      this.hydrate(snapshot);
    }
  }

  /**
   * @description Gera o snapshot serializável (somente quando há dados carregados com sucesso).
   * @returns Snapshot ou `null`.
   * @example
   * const snapshot = repository.snapshot();
   */
  snapshot(): InvestmentSnapshot | null {
    const state = this.store.getValue();
    if (state.status !== 'success') {
      return null;
    }
    return {
      assets: this.getAssets(),
      rates: state.rates,
      positions: state.positions,
      lastUpdatedAt: state.lastUpdatedAt,
    };
  }

  /**
   * @description Restaura o store a partir de um snapshot.
   * @param snapshot Snapshot produzido por {@link InvestmentElfRepository.snapshot}.
   * @example
   * repository.hydrate(snapshot);
   */
  hydrate(snapshot: InvestmentSnapshot): void {
    this.store.update(
      upsertEntities([...snapshot.assets]),
      setProps({
        rates: snapshot.rates,
        positions: snapshot.positions,
        status: 'success',
        error: null,
        lastUpdatedAt: snapshot.lastUpdatedAt,
      }),
    );
  }

  /**
   * @description Insere ou atualiza ativos por ISIN (`upsert`).
   * @param assets Ativos validados.
   * @example
   * repository.upsertAssets(assets);
   */
  upsertAssets(assets: readonly InvestmentAsset[]): void {
    this.store.update(upsertEntities([...assets]));
  }

  /**
   * @description Remove do store todos os ativos de uma família (ex.: fundos ao perder o escopo Private).
   * @param kind Família a remover.
   * @example
   * repository.removeAssetsByKind('FUNDO_MULTIMERCADO');
   */
  removeAssetsByKind(kind: AssetKind): void {
    this.store.update(deleteEntitiesByPredicate((asset) => asset.kind === kind));
  }

  /**
   * @description Define as taxas de mercado.
   * @param rates Taxas validadas.
   * @example
   * repository.setRates(rates);
   */
  setRates(rates: MarketRates): void {
    this.store.update(setProps({ rates }));
  }

  /**
   * @description Substitui a carteira.
   * @param positions Posições do cliente.
   * @example
   * repository.setPositions(positions);
   */
  setPositions(positions: readonly Position[]): void {
    this.store.update(setProps({ positions }));
  }

  /**
   * @description Adiciona uma posição (soma ao valor se o ativo já existir na carteira).
   * @param position Nova posição.
   * @example
   * repository.addPosition({ isin, valorAplicado: 5000, dataAplicacao: '2026-11-03' });
   */
  addPosition(position: Position): void {
    this.store.update(
      setProps((state) => {
        const existing = state.positions.find((candidate) => candidate.isin === position.isin);
        const positions = existing
          ? state.positions.map((candidate) =>
              candidate.isin === position.isin
                ? { ...candidate, valorAplicado: candidate.valorAplicado + position.valorAplicado }
                : candidate,
            )
          : [...state.positions, position];
        return { positions };
      }),
    );
  }

  /**
   * @description Atualiza o status do carregamento.
   * @param status Novo status.
   * @param error Mensagem de erro (apenas em `error`).
   * @example
   * repository.setStatus('error', 'Falha ao carregar');
   */
  setStatus(status: LoadStatus, error: string | null = null): void {
    this.store.update(
      setProps({
        status,
        error: status === 'error' ? error : null,
        ...(status === 'success' ? { lastUpdatedAt: Date.now() } : {}),
      }),
    );
  }

  /**
   * @description Busca um ativo por ISIN.
   * @param isin ISIN do ativo.
   * @returns Ativo ou `undefined`.
   * @example
   * const asset = repository.getAsset(isin);
   */
  getAsset(isin: ISIN): InvestmentAsset | undefined {
    return this.store.query(getEntity(isin));
  }

  /**
   * @description Snapshot de todos os ativos.
   * @returns Lista atual de ativos.
   * @example
   * const all = repository.getAssets();
   */
  getAssets(): InvestmentAsset[] {
    return this.store.query(getAllEntities());
  }

  /**
   * @description Retorna o store ao estado inicial — usado no logout para que nenhum dado do cliente
   * anterior permaneça em memória.
   * @example
   * repository.reset();
   */
  reset(): void {
    this.store.reset();
  }

  /**
   * @description Descarta o store (libera o registro global do Elf) ao destruir o injector.
   */
  ngOnDestroy(): void {
    this.store.destroy();
  }
}
