import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatSliderModule } from '@angular/material/slider';
import {
  InvestmentAsset,
  SimulationInput,
  SimulationResult,
  aliquotaIR,
  describeRate,
} from '@invest/data-access-investments';
import {
  BrlPipe,
  CurrencyInputComponent,
  DurationPipe,
  PercentPipe,
  StatusChipComponent,
} from '@invest/ui-design-system';

/** @description Faixas da tabela regressiva (para a legenda visual). */
const IR_BRACKETS: readonly { readonly label: string; readonly sampleDays: number }[] = [
  { label: 'Até 180 dias', sampleDays: 180 },
  { label: '181 a 360 dias', sampleDays: 360 },
  { label: '361 a 720 dias', sampleDays: 720 },
  { label: 'Acima de 720 dias', sampleDays: 721 },
];

/**
 * @description Simulador de rentabilidade (componente *presentational*). Recebe o ativo e o resultado
 * já calculados pelo facade; apenas coleta `valor`/`prazo` (two-way via `model()`) e emite o pedido
 * de registro. Nenhuma regra de IR vive aqui.
 * @example
 * <inv-yield-simulator [asset]="facade.selectedAsset()" [result]="facade.simulationResult()"
 *   [(params)]="paramsModel" (registerRequested)="register()" />
 */
@Component({
  selector: 'inv-yield-simulator',
  imports: [
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatSliderModule,
    BrlPipe,
    DurationPipe,
    PercentPipe,
    CurrencyInputComponent,
    StatusChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-card appearance="outlined" class="card">
      <mat-card-header>
        <mat-card-title>Simulador de rentabilidade</mat-card-title>
        <mat-card-subtitle>
          @if (asset(); as selected) {
            {{ selected.nome }} · {{ rate(selected) }}
          } @else {
            Selecione um ativo na tabela para simular
          }
        </mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        @if (asset(); as selected) {
          <div class="controls">
            <inv-currency-input
              label="Valor a investir"
              [min]="selected.aplicacaoMinima"
              [hint]="'Mínimo do ativo: ' + (selected.aplicacaoMinima | brl)"
              [value]="params().valor"
              (valueChange)="onValor($event)"
            />
            <div class="slider">
              <span id="valor-label" class="slider__label">Ajuste rápido do valor</span>
              <mat-slider min="1000" max="500000" step="500" discrete [displayWith]="formatK">
                <input matSliderThumb aria-labelledby="valor-label" [value]="params().valor" (valueChange)="onValor($event)" />
              </mat-slider>
            </div>
            <div class="slider">
              <span id="prazo-label" class="slider__label">Prazo: {{ params().prazoDias | duration }}</span>
              <mat-slider min="30" [max]="sliderMax()" step="1" discrete>
                <input matSliderThumb aria-labelledby="prazo-label" [value]="params().prazoDias" (valueChange)="onPrazo($event)" />
              </mat-slider>
            </div>
          </div>

          @if (result(); as r) {
            <dl class="results" aria-live="polite">
              <div>
                <dt>Valor bruto</dt>
                <dd>{{ r.valorBruto | brl }}</dd>
              </div>
              <div>
                <dt>Rendimento bruto</dt>
                <dd>{{ r.rendimentoBruto | brl }}</dd>
              </div>
              <div>
                <dt>Imposto de renda ({{ r.aliquotaIR | pct: 1 }})</dt>
                <dd class="neg">− {{ r.valorIR | brl }}</dd>
              </div>
              <div class="highlight">
                <dt>Valor líquido no resgate</dt>
                <dd>{{ r.valorLiquido | brl }}</dd>
              </div>
              <div>
                <dt>Rentabilidade líquida no período</dt>
                <dd>{{ r.rentabilidadeLiquidaPeriodo | pct }}</dd>
              </div>
              <div>
                <dt>Taxa efetiva ao ano (bruta)</dt>
                <dd>{{ r.taxaAnualBruta | pct }}</dd>
              </div>
            </dl>

            @if (selected.vencimento && maxDays() !== null) {
              <p class="hint">
                <mat-icon aria-hidden="true">event</mat-icon>
                O prazo máximo é o vencimento do título ({{ selected.vencimento | date: 'dd/MM/yyyy' }}), em
                {{ maxDays() | duration }}.
              </p>
            }

            <div class="brackets" aria-label="Tabela regressiva de IR">
              <span class="brackets__title">Tabela regressiva de IR:</span>
              @for (bracket of brackets; track bracket.label) {
                <inv-status-chip
                  [label]="bracket.label + ' — ' + (bracket.rate | pct: 1)"
                  [tone]="r.isento ? 'neutral' : bracket.rate === r.aliquotaIR ? 'accent' : 'neutral'"
                />
              }
              @if (r.isento) {
                <inv-status-chip label="Este ativo é isento de IR (PF)" tone="success" icon="verified" />
              }
            </div>
          } @else {
            <p class="hint">Informe um valor e um prazo maiores que zero.</p>
          }
        } @else {
          <p class="hint">
            <mat-icon aria-hidden="true">touch_app</mat-icon>
            Clique em <strong>Simular</strong> em qualquer linha da tabela.
          </p>
        }
      </mat-card-content>
      @if (asset() && result()) {
        <mat-card-actions align="end">
          <button mat-stroked-button type="button" (click)="registerRequested.emit()">
            <mat-icon>bookmark_add</mat-icon>
            Registrar simulação
          </button>
        </mat-card-actions>
      }
    </mat-card>
  `,
  styles: `
    :host {
      display: block;
    }
    .card {
      background: var(--inv-surface-raised);
      border-color: var(--inv-border);
      border-radius: var(--inv-radius-md);
    }
    .controls {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: var(--inv-space-4);
      align-items: start;
      margin-top: var(--inv-space-3);
    }
    .slider__label {
      display: block;
      color: var(--inv-text-muted);
      font-size: 0.8125rem;
    }
    .results {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
      gap: var(--inv-space-3);
      margin: var(--inv-space-4) 0 0;
    }
    .results div {
      padding: var(--inv-space-3);
      border: 1px solid var(--inv-border);
      border-radius: var(--inv-radius-sm);
    }
    .results .highlight {
      background: var(--inv-positive-container);
      border-color: var(--inv-positive);
    }
    dt {
      color: var(--inv-text-muted);
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    dd {
      margin: var(--inv-space-1) 0 0;
      font-size: 1.25rem;
      font-weight: 500;
      font-variant-numeric: tabular-nums;
    }
    .neg {
      color: var(--inv-negative);
    }
    .brackets {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--inv-space-2);
      margin-top: var(--inv-space-4);
    }
    .brackets__title {
      color: var(--inv-text-muted);
      font-size: 0.8125rem;
    }
    .hint {
      display: flex;
      align-items: center;
      gap: var(--inv-space-2);
      color: var(--inv-text-muted);
    }
  `,
})
export class YieldSimulatorComponent {
  /** Ativo selecionado (ou `null`). */
  readonly asset = input<InvestmentAsset | null>(null);
  /** Resultado calculado pelo facade (ou `null`). */
  readonly result = input<SimulationResult | null>(null);
  /** Dias até o vencimento do ativo (limita o slider de prazo); `null` quando o ativo não vence. */
  readonly maxDays = input<number | null>(null);
  /** Valor e prazo (two-way binding). */
  readonly params = model.required<SimulationInput>();
  /** Emitido ao clicar em "Registrar simulação". */
  readonly registerRequested = output<void>();

  /** Limite superior do slider de prazo: o vencimento do título ou 1800 dias (≈ 5 anos). */
  protected readonly sliderMax = computed(() => Math.max(30, Math.min(1800, this.maxDays() ?? 1800)));

  /** Faixas da tabela regressiva com as alíquotas calculadas pela regra de domínio. */
  protected readonly brackets = IR_BRACKETS.map((bracket) => ({
    label: bracket.label,
    rate: aliquotaIR(bracket.sampleDays),
  }));

  /**
   * @description Formata o rótulo do slider de valor (ex.: `R$ 50k`).
   * @param value Valor em reais.
   * @returns Texto curto.
   */
  protected formatK(value: number): string {
    return value >= 1000 ? `${Math.round(value / 1000)}k` : String(value);
  }

  /**
   * @description Atualiza o valor mantendo o prazo.
   * @param valor Novo valor.
   */
  protected onValor(valor: number): void {
    this.params.update((current) => ({ ...current, valor }));
  }

  /**
   * @description Atualiza o prazo mantendo o valor.
   * @param prazoDias Novo prazo em dias.
   */
  protected onPrazo(prazoDias: number): void {
    this.params.update((current) => ({ ...current, prazoDias }));
  }

  /**
   * @description Descreve a taxa do ativo.
   * @param asset Ativo.
   * @returns Texto formatado.
   */
  protected rate(asset: InvestmentAsset): string {
    return describeRate(asset);
  }
}
