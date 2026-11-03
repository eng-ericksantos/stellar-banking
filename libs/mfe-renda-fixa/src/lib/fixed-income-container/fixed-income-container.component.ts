import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, PendingTasks, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FeatureFlagsService, HostBridgeService, HostCommand } from '@invest/auth-security';
import {
  ComparisonParams,
  IndexadorFilter,
  InvestmentAsset,
  InvestmentFacade,
  SimulationInput,
  describeError,
  parseIsin,
} from '@invest/data-access-investments';
import { PercentPipe, SkeletonComponent, StatusChipComponent } from '@invest/ui-design-system';
import { AssetTableComponent } from '../asset-table/asset-table.component';
import { ComparativeSimulatorComponent } from '../comparative-simulator/comparative-simulator.component';
import { InvestDialogComponent } from '../invest-dialog/invest-dialog.component';
import { PortfolioSummaryCardsComponent } from '../portfolio-summary-cards/portfolio-summary-cards.component';
import { YieldSimulatorComponent } from '../yield-simulator/yield-simulator.component';

/**
 * @description **Smart Component** do MFE de Renda Fixa. É o único componente que conversa com o
 * `InvestmentFacade` (estado/regras), com o `HostBridgeService` (iframe/parceiro) e com serviços de UI
 * (dialog/snackbar). Os filhos são *presentational*: recebem Signals via `input()` e devolvem eventos via
 * `output()`/`model()`.
 *
 * Por que isso ajuda o `OnPush`? Como todo estado entra por Signals/inputs, a árvore só é revisitada
 * quando um Signal lido no template muda. Ex.: mover o slider de prazo recalcula apenas o `computed`
 * `simulationResult` e re-renderiza o simulador — a tabela (cujos inputs não mudaram) não é tocada.
 *
 * @example
 * { path: 'renda-fixa', component: FixedIncomeContainerComponent }
 */
@Component({
  selector: 'inv-fixed-income-container',
  imports: [
    DatePipe,
    MatBadgeModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatProgressBarModule,
    PercentPipe,
    SkeletonComponent,
    StatusChipComponent,
    AssetTableComponent,
    ComparativeSimulatorComponent,
    PortfolioSummaryCardsComponent,
    YieldSimulatorComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="head">
      <div>
        <h1>Renda Fixa e Fundos</h1>
        @if (facade.rates(); as rates) {
          <p class="rates" aria-label="Taxas de mercado">
            CDI {{ rates.cdi / 100 | pct }} · Selic {{ rates.selic / 100 | pct }} · IPCA {{ rates.ipca / 100 | pct }}
            <span class="ref">(ref. {{ rates.referencia | date: 'dd/MM/yyyy' }})</span>
          </p>
        }
      </div>
      <div class="head__actions">
        @if (facade.lastUpdatedAt(); as updatedAt) {
          <inv-status-chip [label]="'Atualizado às ' + (updatedAt | date: 'HH:mm:ss')" tone="info" icon="update" />
        }
        <button mat-stroked-button type="button" [disabled]="facade.loading()" (click)="reload()">
          <mat-icon>refresh</mat-icon>
          Atualizar
        </button>
      </div>
    </header>

    @if (facade.loading()) {
      <mat-progress-bar mode="indeterminate" aria-label="Carregando dados de investimentos" />
    }

    @if (facade.error(); as message) {
      <div class="error" role="alert">
        <mat-icon aria-hidden="true">cloud_off</mat-icon>
        <span>{{ message }}</span>
        <button mat-button type="button" (click)="reload()">Tentar novamente</button>
      </div>
    }

    <inv-portfolio-summary-cards [summary]="facade.portfolioSummary()" />

    <section class="section" aria-labelledby="assets-title">
      <div class="section__head">
        <h2 id="assets-title" [matBadge]="facade.filteredAssets().length" matBadgeOverlap="false" matBadgeColor="accent">
          Ativos disponíveis
        </h2>
        <mat-button-toggle-group
          aria-label="Filtrar por indexador"
          [value]="facade.indexadorFilter()"
          (change)="onFilter($event.value)"
        >
          @for (option of indexadores; track option.value) {
            <mat-button-toggle [value]="option.value">{{ option.label }}</mat-button-toggle>
          }
        </mat-button-toggle-group>
      </div>
      <inv-asset-table
        [assets]="facade.filteredAssets()"
        [selectedIsin]="facade.selectedIsin()"
        [ordersEnabled]="ordersEnabled()"
        (assetSelected)="onSelect($event)"
        (investRequested)="openInvestDialog($event)"
      />
    </section>

    <section class="section" aria-label="Simulador de rentabilidade">
      <inv-yield-simulator
        [asset]="facade.selectedAsset()"
        [result]="facade.simulationResult()"
        [maxDays]="facade.maturityDays()"
        [params]="facade.simulationParams()"
        (paramsChange)="onParams($event)"
        (registerRequested)="registerSimulation()"
      />
    </section>

    @if (comparativeEnabled()) {
      <section class="section" aria-label="Simulador comparativo">
        <!-- @defer: o chunk do comparativo só é baixado ao entrar no viewport; prefetch quando o browser está ocioso. -->
        @defer (on viewport; prefetch on idle) {
          <inv-comparative-simulator
            [comparison]="facade.comparison()"
            [params]="facade.simulationParams()"
            [taxas]="facade.comparisonParams()"
            (taxasChange)="onComparison($event)"
          />
        } @placeholder (minimum 300ms) {
          <inv-skeleton height="220px" [lines]="4" label="O comparativo será carregado ao rolar até aqui" />
        } @loading (after 100ms; minimum 500ms) {
          <mat-progress-bar mode="indeterminate" aria-label="Carregando simulador comparativo" />
        }
      </section>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--inv-space-5);
    }
    .head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--inv-space-3);
    }
    h1 {
      margin: 0;
      font-size: 1.75rem;
      font-weight: 500;
    }
    h2 {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 500;
    }
    .rates {
      margin: var(--inv-space-1) 0 0;
      color: var(--inv-text-muted);
    }
    .ref {
      font-size: 0.8125rem;
    }
    .head__actions,
    .section__head {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--inv-space-3);
    }
    .section__head {
      justify-content: space-between;
      margin-bottom: var(--inv-space-3);
    }
    .error {
      display: flex;
      align-items: center;
      gap: var(--inv-space-3);
      padding: var(--inv-space-3) var(--inv-space-4);
      border-radius: var(--inv-radius-md);
      background: var(--inv-negative-container);
      color: var(--inv-negative);
    }
    .error span {
      flex: 1;
    }
  `,
})
export class FixedIncomeContainerComponent {
  protected readonly facade = inject(InvestmentFacade);
  private readonly flags = inject(FeatureFlagsService);
  private readonly bridge = inject(HostBridgeService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly pendingTasks = inject(PendingTasks);

  /** Flag do simulador comparativo. */
  protected readonly comparativeEnabled = this.flags.select('COMPARATIVE_SIMULATOR');
  /** Flag de execução de ordens. */
  protected readonly ordersEnabled = this.flags.select('ORDER_EXECUTION');

  /** Opções do filtro de indexador. */
  protected readonly indexadores: readonly { readonly value: IndexadorFilter; readonly label: string }[] = [
    { value: 'TODOS', label: 'Todos' },
    { value: 'CDI', label: 'CDI' },
    { value: 'IPCA', label: 'IPCA+' },
    { value: 'PRE', label: 'Pré-fixado' },
  ];

  /**
   * @description Dispara o carregamento inicial e passa a ouvir comandos do Host (iframe).
   * `PendingTasks.run` informa ao SSR que há trabalho assíncrono em andamento: o servidor só serializa
   * o HTML quando o carregamento termina — por isso o HTML já chega com os dados (sem skeleton/flicker).
   */
  constructor() {
    void this.pendingTasks.run(() => this.facade.load());
    this.bridge.commands$.pipe(takeUntilDestroyed()).subscribe((command) => this.onHostCommand(command));
  }

  /**
   * @description Recarrega os dados ignorando o cache.
   * @returns Promessa resolvida ao final.
   */
  protected reload(): Promise<void> {
    return this.facade.refresh();
  }

  /**
   * @description Aplica o filtro de indexador.
   * @param filter Valor escolhido no grupo de toggles.
   */
  protected onFilter(filter: IndexadorFilter): void {
    this.facade.setIndexadorFilter(filter);
  }

  /**
   * @description Seleciona um ativo e notifica o Host embarcador (se houver).
   * @param asset Ativo escolhido.
   */
  protected onSelect(asset: InvestmentAsset): void {
    this.facade.selectAsset(asset.isin);
    this.bridge.postToHost({ type: 'MFE_ASSET_SELECTED', payload: { isin: asset.isin } });
  }

  /**
   * @description Propaga parâmetros do simulador ao facade.
   * @param params Novo valor/prazo.
   */
  protected onParams(params: SimulationInput): void {
    this.facade.setSimulationParams(params);
  }

  /**
   * @description Propaga as taxas do comparativo ao facade.
   * @param params Novas taxas.
   */
  protected onComparison(params: ComparisonParams): void {
    this.facade.setComparisonParams(params);
  }

  /**
   * @description Abre o diálogo de investimento e confirma o resultado em um snackbar.
   * @param asset Ativo a ser adquirido.
   */
  protected openInvestDialog(asset: InvestmentAsset): void {
    this.dialog
      .open(InvestDialogComponent, { data: { asset }, width: '680px', maxWidth: '95vw', autoFocus: 'dialog' })
      .afterClosed()
      .subscribe((receipt) => {
        if (receipt) {
          this.snackBar.open(`Ordem ${receipt.protocolo} registrada com sucesso.`, 'OK', {
            duration: 5000,
            panelClass: 'inv-snack-success',
          });
        }
      });
  }

  /**
   * @description Registra a simulação corrente no backend e informa o usuário.
   * @returns Promessa resolvida ao final.
   */
  protected async registerSimulation(): Promise<void> {
    try {
      const receipt = await this.facade.registerSimulation();
      this.snackBar.open(`Simulação ${receipt.id} registrada.`, 'OK', { duration: 4000, panelClass: 'inv-snack-success' });
    } catch (error) {
      this.snackBar.open(describeError(error), 'Fechar', { duration: 6000, panelClass: 'inv-snack-error' });
    }
  }

  /**
   * @description Trata comandos validados vindos do Host. Somente `HOST_SELECT_ASSET` é relevante aqui
   * (o tema é tratado pelo shell). O ISIN é revalidado (dígito verificador) antes de qualquer uso.
   * @param command Comando já validado pelo `HostBridgeService`.
   */
  private onHostCommand(command: HostCommand): void {
    if (command.type !== 'HOST_SELECT_ASSET') {
      return;
    }
    const isin = parseIsin(command.payload.isin);
    if (isin.ok && this.facade.assets().some((asset) => asset.isin === isin.value)) {
      this.facade.selectAsset(isin.value);
    }
  }
}
