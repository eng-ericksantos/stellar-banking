import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSortModule, Sort } from '@angular/material/sort';
import { HasPermissionDirective } from '@invest/auth-security';
import {
  ASSET_KIND_LABEL,
  ISIN,
  InvestmentAsset,
  LIQUIDEZ_LABEL,
  RISCO_LABEL,
  Risco,
  describeRate,
} from '@invest/data-access-investments';
import { BrlPipe, StatusChipComponent, StatusTone } from '@invest/ui-design-system';

/** @description Ordem numérica de risco (para ordenação). */
const RISK_ORDER: Readonly<Record<Risco, number>> = { BAIXO: 1, MEDIO: 2, ALTO: 3 };

/** @description Tom do chip por nível de risco. */
const RISK_TONE: Readonly<Record<Risco, StatusTone>> = { BAIXO: 'success', MEDIO: 'warning', ALTO: 'danger' };

/**
 * @description Valor de ordenação de um ativo para uma coluna.
 * @param asset Ativo.
 * @param column Chave da coluna.
 * @returns Valor comparável (texto ou número).
 * @example
 * sortValue(asset, 'taxa'); // 110
 */
export function sortValue(asset: InvestmentAsset, column: string): string | number {
  switch (column) {
    case 'nome':
      return asset.nome.toLowerCase();
    case 'kind':
      return ASSET_KIND_LABEL[asset.kind];
    case 'taxa':
      return asset.taxa;
    case 'vencimento':
      return asset.vencimento ?? '9999-12-31';
    case 'risco':
      return RISK_ORDER[asset.risco];
    case 'aplicacaoMinima':
      return asset.aplicacaoMinima;
    default:
      return 0;
  }
}

/**
 * @description Tabela rica de ativos (componente *presentational*): busca textual, ordenação por
 * coluna (`MatSort`), chips de risco/liquidez/garantias e ações por linha.
 *
 * Performance: a lista é renderizada com `@for (… track asset.isin)` — ao reordenar/filtrar, o Angular
 * reaproveita (move) os nós DOM das linhas existentes em vez de recriá-los, pois a identidade da
 * linha é o ISIN. Ordenação/filtro vivem em `computed`, memoizados enquanto as entradas não mudam.
 *
 * @example
 * <inv-asset-table [assets]="facade.filteredAssets()" [selectedIsin]="facade.selectedIsin()"
 *   (assetSelected)="onSelect($event)" (investRequested)="onInvest($event)" />
 */
@Component({
  selector: 'inv-asset-table',
  imports: [
    DatePipe,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSortModule,
    HasPermissionDirective,
    BrlPipe,
    StatusChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="search">
        <mat-label>Buscar por nome, emissor ou código</mat-label>
        <mat-icon matPrefix aria-hidden="true">search</mat-icon>
        <input matInput type="search" [value]="search()" (input)="onSearch($event)" />
      </mat-form-field>
      <span class="count" aria-live="polite">{{ visibleAssets().length }} de {{ assets().length }} ativos</span>
    </div>

    <div class="table-wrap" role="region" aria-label="Tabela de ativos" tabindex="0">
      <table
        class="inv-table"
        matSort
        [matSortActive]="sort().active"
        [matSortDirection]="sort().direction"
        (matSortChange)="onSort($event)"
      >
        <caption class="inv-sr-only">
          Ativos de renda fixa e fundos disponíveis para aplicação
        </caption>
        <thead>
          <tr>
            <th scope="col" mat-sort-header="nome">Ativo</th>
            <th scope="col" mat-sort-header="kind">Tipo</th>
            <th scope="col" mat-sort-header="taxa">Rentabilidade</th>
            <th scope="col" mat-sort-header="vencimento">Vencimento</th>
            <th scope="col" mat-sort-header="risco">Risco</th>
            <th scope="col">Liquidez e garantias</th>
            <th scope="col" mat-sort-header="aplicacaoMinima" class="num">Aplicação mínima</th>
            <th scope="col" class="actions">Ações</th>
          </tr>
        </thead>
        <tbody>
          @for (asset of visibleAssets(); track asset.isin) {
            <tr [class.selected]="asset.isin === selectedIsin()">
              <td>
                <button
                  mat-button
                  type="button"
                  class="name-btn"
                  [attr.aria-pressed]="asset.isin === selectedIsin()"
                  (click)="assetSelected.emit(asset)"
                >
                  <span class="name">{{ asset.nome }}</span>
                </button>
                <div class="meta">{{ asset.emissor }} · ISIN {{ asset.isin }}</div>
              </td>
              <td>{{ kindLabel(asset) }}</td>
              <td class="rate">{{ rate(asset) }}</td>
              <td>{{ asset.vencimento ? (asset.vencimento | date: 'dd/MM/yyyy') : 'Sem vencimento' }}</td>
              <td>
                <inv-status-chip [label]="riskLabel(asset)" [tone]="riskTone(asset)" />
              </td>
              <td>
                <div class="chips">
                  <inv-status-chip [label]="liquidityLabel(asset)" tone="info" icon="schedule" />
                  @if (asset.garantiaFgc) {
                    <inv-status-chip label="Garantia FGC" ariaLabel="Protegido pelo Fundo Garantidor de Créditos" tone="success" icon="verified_user" />
                  }
                  @if (asset.isentoIR) {
                    <inv-status-chip label="Isento de IR" ariaLabel="Isento de imposto de renda para pessoa física" tone="accent" icon="percent" />
                  }
                </div>
              </td>
              <td class="num">{{ asset.aplicacaoMinima | brl }}</td>
              <td class="actions">
                <button mat-stroked-button type="button" (click)="assetSelected.emit(asset)">Simular</button>
                @if (ordersEnabled()) {
                  <button
                    *hasPermission="'INVESTMENT_EXECUTE'; scope: 'PRIVATE_BANKING'"
                    mat-flat-button
                    type="button"
                    (click)="investRequested.emit(asset)"
                  >
                    Investir Agora
                  </button>
                }
              </td>
            </tr>
          } @empty {
            <tr>
              <td colspan="8" class="empty">Nenhum ativo encontrado para os filtros atuais.</td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--inv-space-4);
      flex-wrap: wrap;
      margin-bottom: var(--inv-space-3);
    }
    .search {
      min-width: 320px;
      flex: 1 1 320px;
    }
    .count {
      color: var(--inv-text-muted);
      font-size: 0.875rem;
    }
    .table-wrap {
      overflow-x: auto;
      border: 1px solid var(--inv-border);
      border-radius: var(--inv-radius-md);
      background: var(--inv-surface-raised);
    }
    .inv-table {
      width: 100%;
      border-collapse: collapse;
      min-width: 980px;
    }
    th {
      padding: var(--inv-space-3) var(--inv-space-4);
      text-align: left;
      font-size: 0.75rem;
      font-weight: 500;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--inv-text-muted);
      background: var(--inv-surface-sunken);
      white-space: nowrap;
    }
    td {
      padding: var(--inv-space-3) var(--inv-space-4);
      border-top: 1px solid var(--inv-border);
      vertical-align: middle;
      font-size: 0.875rem;
    }
    tr.selected td {
      background: var(--inv-primary-container);
    }
    .name-btn {
      padding: 0;
      min-width: 0;
      height: auto;
      text-align: left;
      color: var(--inv-primary);
    }
    .name {
      font-weight: 500;
      white-space: normal;
    }
    .meta {
      color: var(--inv-text-muted);
      font-size: 0.75rem;
    }
    .rate {
      font-weight: 500;
      color: var(--inv-accent);
      white-space: nowrap;
    }
    .num {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: var(--inv-space-1);
    }
    .actions {
      white-space: nowrap;
      text-align: right;
    }
    .actions button + button {
      margin-left: var(--inv-space-2);
    }
    .empty {
      text-align: center;
      padding: var(--inv-space-6);
      color: var(--inv-text-muted);
    }
  `,
})
export class AssetTableComponent {
  /** Ativos a exibir (já filtrados por indexador pelo container). */
  readonly assets = input.required<readonly InvestmentAsset[]>();
  /** ISIN do ativo selecionado. */
  readonly selectedIsin = input<ISIN | null>(null);
  /** Feature flag de execução de ordens (controla a existência do botão no DOM). */
  readonly ordersEnabled = input<boolean>(true);

  /** Emitido ao selecionar um ativo para simulação. */
  readonly assetSelected = output<InvestmentAsset>();
  /** Emitido ao clicar em "Investir Agora". */
  readonly investRequested = output<InvestmentAsset>();

  /** Texto da busca. */
  protected readonly search = signal('');
  /** Ordenação corrente. */
  protected readonly sort = signal<Sort>({ active: '', direction: '' });

  /** Ativos após busca textual e ordenação (memoizado). */
  protected readonly visibleAssets = computed<readonly InvestmentAsset[]>(() => {
    const term = this.search().trim().toLowerCase();
    const { active, direction } = this.sort();
    const filtered = term
      ? this.assets().filter((asset) =>
          [asset.nome, asset.emissor, asset.isin, 'ticker' in asset ? asset.ticker : '', ASSET_KIND_LABEL[asset.kind]]
            .join(' ')
            .toLowerCase()
            .includes(term),
        )
      : this.assets();
    if (!active || !direction) {
      return filtered;
    }
    const factor = direction === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const left = sortValue(a, active);
      const right = sortValue(b, active);
      return (left < right ? -1 : left > right ? 1 : 0) * factor;
    });
  });

  /**
   * @description Atualiza o texto de busca.
   * @param event Evento `input` do campo de busca.
   */
  protected onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  /**
   * @description Atualiza a ordenação (evento do `MatSort`).
   * @param sort Estado de ordenação.
   */
  protected onSort(sort: Sort): void {
    this.sort.set(sort);
  }

  /**
   * @description Descreve a taxa do ativo.
   * @param asset Ativo.
   * @returns Texto como `110% do CDI`.
   */
  protected rate(asset: InvestmentAsset): string {
    return describeRate(asset);
  }

  /**
   * @description Rótulo da família do ativo.
   * @param asset Ativo.
   * @returns Rótulo amigável.
   */
  protected kindLabel(asset: InvestmentAsset): string {
    return ASSET_KIND_LABEL[asset.kind];
  }

  /**
   * @description Rótulo de risco.
   * @param asset Ativo.
   * @returns Texto como `Risco baixo`.
   */
  protected riskLabel(asset: InvestmentAsset): string {
    return `Risco ${RISCO_LABEL[asset.risco].toLowerCase()}`;
  }

  /**
   * @description Tom do chip de risco.
   * @param asset Ativo.
   * @returns Tom semântico.
   */
  protected riskTone(asset: InvestmentAsset): StatusTone {
    return RISK_TONE[asset.risco];
  }

  /**
   * @description Rótulo de liquidez.
   * @param asset Ativo.
   * @returns Texto como `Liquidez diária`.
   */
  protected liquidityLabel(asset: InvestmentAsset): string {
    return LIQUIDEZ_LABEL[asset.liquidez];
  }
}
