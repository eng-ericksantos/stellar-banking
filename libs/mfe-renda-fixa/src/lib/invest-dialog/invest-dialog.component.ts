import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatStepperModule } from '@angular/material/stepper';
import {
  InvestmentAsset,
  InvestmentFacade,
  daysBetween,
  describeError,
  describeRate,
  simulateYield,
} from '@invest/data-access-investments';
import { OrderReceiptDto } from '@invest/http-core';
import { BrlPipe, CurrencyInputComponent, DurationPipe, PercentPipe } from '@invest/ui-design-system';

/** @description Dados injetados no diálogo de investimento. */
export interface InvestDialogData {
  readonly asset: InvestmentAsset;
}

/** @description Horizonte padrão (dias) da projeção para ativos sem vencimento (fundos). */
const DEFAULT_HORIZON_DAYS = 360;

/**
 * @description Diálogo de aplicação em 3 etapas (`MatStepper`): valor → revisão → comprovante.
 * Fechado com o comprovante (`OrderReceiptDto`) em caso de sucesso, ou `undefined` se cancelado.
 * O envio da ordem passa pelo `InvestmentFacade`, que muta o estado no Elf em caso de sucesso.
 * @example
 * dialog.open(InvestDialogComponent, { data: { asset }, width: '640px' });
 */
@Component({
  selector: 'inv-invest-dialog',
  imports: [
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    MatProgressBarModule,
    MatStepperModule,
    BrlPipe,
    DurationPipe,
    PercentPipe,
    CurrencyInputComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Investir em {{ data.asset.nome }}</h2>
    <mat-dialog-content>
      <mat-stepper [selectedIndex]="step()" (selectionChange)="step.set($event.selectedIndex)" labelPosition="bottom">
        <mat-step label="Valor" [completed]="validAmount()">
          <p class="muted">{{ rate }} · aplicação mínima {{ data.asset.aplicacaoMinima | brl }}</p>
          <inv-currency-input
            label="Quanto deseja investir?"
            [min]="data.asset.aplicacaoMinima"
            [(value)]="valor"
          />
          <div class="actions">
            <button mat-button type="button" mat-dialog-close>Cancelar</button>
            <button mat-flat-button type="button" [disabled]="!validAmount()" (click)="step.set(1)">Continuar</button>
          </div>
        </mat-step>

        <mat-step label="Revisão" [completed]="receipt() !== null">
          @if (projection(); as p) {
            <dl class="review">
              <dt>Valor da aplicação</dt>
              <dd>{{ valor() | brl }}</dd>
              <dt>Projeção em {{ horizonDays() | duration }} (líquida de IR)</dt>
              <dd>{{ p.valorLiquido | brl }}</dd>
              <dt>Rentabilidade líquida projetada</dt>
              <dd>{{ p.rentabilidadeLiquidaPeriodo | pct }}</dd>
            </dl>
          }
          @if (errorMessage(); as message) {
            <p class="error" role="alert">
              <mat-icon aria-hidden="true">error</mat-icon>
              {{ message }}
            </p>
          }
          @if (submitting()) {
            <mat-progress-bar mode="indeterminate" aria-label="Enviando ordem" />
          }
          <div class="actions">
            <button mat-button type="button" [disabled]="submitting()" (click)="step.set(0)">Voltar</button>
            <button mat-flat-button type="button" [disabled]="submitting() || !validAmount()" (click)="confirm()">
              Confirmar aplicação
            </button>
          </div>
        </mat-step>

        <mat-step label="Comprovante">
          @if (receipt(); as r) {
            <div class="success" role="status">
              <mat-icon aria-hidden="true">check_circle</mat-icon>
              <div>
                <strong>Ordem {{ r.status.toLowerCase() }}!</strong>
                <div>Protocolo {{ r.protocolo }} · {{ r.valor | brl }}</div>
              </div>
            </div>
            <div class="actions">
              <button mat-flat-button type="button" [mat-dialog-close]="r">Concluir</button>
            </div>
          } @else {
            <p class="muted">Confirme a aplicação na etapa anterior para gerar o comprovante.</p>
          }
        </mat-step>
      </mat-stepper>
    </mat-dialog-content>
  `,
  styles: `
    .muted {
      color: var(--inv-text-muted);
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--inv-space-2);
      margin-top: var(--inv-space-3);
    }
    .review {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: var(--inv-space-2) var(--inv-space-4);
      margin: var(--inv-space-3) 0;
    }
    .review dd {
      margin: 0;
      text-align: right;
      font-variant-numeric: tabular-nums;
      font-weight: 500;
    }
    .error {
      display: flex;
      align-items: center;
      gap: var(--inv-space-2);
      color: var(--inv-negative);
    }
    .success {
      display: flex;
      align-items: center;
      gap: var(--inv-space-3);
      padding: var(--inv-space-4);
      border-radius: var(--inv-radius-md);
      background: var(--inv-positive-container);
      color: var(--inv-positive);
    }
  `,
})
export class InvestDialogComponent {
  protected readonly data = inject<InvestDialogData>(MAT_DIALOG_DATA);
  private readonly facade = inject(InvestmentFacade);

  /** Valor a investir (two-way com o campo monetário). */
  protected readonly valor = signal(this.data.asset.aplicacaoMinima);
  /** Etapa corrente do stepper. */
  protected readonly step = signal(0);
  /** Indica envio em andamento. */
  protected readonly submitting = signal(false);
  /** Mensagem de erro da última tentativa. */
  protected readonly errorMessage = signal<string | null>(null);
  /** Comprovante após sucesso. */
  protected readonly receipt = signal<OrderReceiptDto | null>(null);

  /** Descrição da taxa do ativo. */
  protected readonly rate = describeRate(this.data.asset);

  /** `true` quando o valor atende à aplicação mínima. */
  protected readonly validAmount = computed(() => this.valor() >= this.data.asset.aplicacaoMinima);

  /** Horizonte da projeção: até o vencimento (mín. 30 dias) ou 360 dias para fundos. */
  protected readonly horizonDays = computed(() => {
    const rates = this.facade.rates();
    const maturity = this.data.asset.vencimento;
    if (!rates || !maturity) {
      return DEFAULT_HORIZON_DAYS;
    }
    return Math.max(30, daysBetween(rates.referencia, maturity));
  });

  /** Projeção de rendimento líquido no horizonte. */
  protected readonly projection = computed(() => {
    const rates = this.facade.rates();
    return rates && this.validAmount()
      ? simulateYield(this.data.asset, rates, { valor: this.valor(), prazoDias: this.horizonDays() })
      : null;
  });

  /**
   * @description Envia a ordem; em sucesso avança para o comprovante, em falha exibe o erro.
   * @returns Promessa resolvida ao concluir o envio.
   */
  protected async confirm(): Promise<void> {
    this.submitting.set(true);
    this.errorMessage.set(null);
    try {
      this.receipt.set(await this.facade.invest(this.data.asset.isin, this.valor()));
      this.step.set(2);
    } catch (error) {
      this.errorMessage.set(describeError(error));
    } finally {
      this.submitting.set(false);
    }
  }
}
