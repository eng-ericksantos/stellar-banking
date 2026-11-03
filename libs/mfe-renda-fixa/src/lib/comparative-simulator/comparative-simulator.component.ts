import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatSliderModule } from '@angular/material/slider';
import {
  ComparisonParams,
  ComparisonResult,
  SimulationInput,
} from '@invest/data-access-investments';
import { BrlPipe, DurationPipe, PercentPipe, StatusChipComponent } from '@invest/ui-design-system';

/**
 * @description Simulador Comparativo de Rentabilidade: **CDB (tributado)** × **LCI/LCA (isenta)**.
 * Carregado sob demanda por `@defer (on viewport; prefetch on idle)` no container — o JavaScript deste
 * componente só é baixado quando o usuário rola até ele (ou em ociosidade do navegador, via prefetch),
 * reduzindo o bundle inicial.
 *
 * Componente *presentational*: o cálculo (IR regressivo de 22,5% a 15% e gross-up) é feito no domínio
 * e chega pronto via `comparison`.
 * @example
 * <inv-comparative-simulator [comparison]="facade.comparison()" [params]="facade.simulationParams()"
 *   [(taxas)]="taxasModel" />
 */
@Component({
  selector: 'inv-comparative-simulator',
  imports: [MatCardModule, MatSliderModule, BrlPipe, DurationPipe, PercentPipe, StatusChipComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-card appearance="outlined" class="card">
      <mat-card-header>
        <mat-card-title>Comparativo: CDB × LCI/LCA isenta</mat-card-title>
        <mat-card-subtitle>
          Mesmo valor e prazo do simulador: {{ params().valor | brl }} por {{ params().prazoDias | duration }}
        </mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        <div class="controls">
          <div>
            <span id="cdb-label" class="label">CDB: {{ taxas().cdbPercentCdi }}% do CDI</span>
            <mat-slider min="80" max="140" step="1" discrete>
              <input
                matSliderThumb
                aria-labelledby="cdb-label"
                [value]="taxas().cdbPercentCdi"
                (valueChange)="onCdb($event)"
              />
            </mat-slider>
          </div>
          <div>
            <span id="isento-label" class="label">LCI/LCA: {{ taxas().isentoPercentCdi }}% do CDI</span>
            <mat-slider min="70" max="110" step="1" discrete>
              <input
                matSliderThumb
                aria-labelledby="isento-label"
                [value]="taxas().isentoPercentCdi"
                (valueChange)="onIsento($event)"
              />
            </mat-slider>
          </div>
        </div>

        @if (comparison(); as c) {
          <div class="columns" aria-live="polite">
            <section class="column" [class.winner]="c.vencedor === 'CDB'">
              <h3>CDB ({{ c.cdb.aliquotaIR | pct: 1 }} de IR)</h3>
              <dl>
                <dt>Rendimento bruto</dt>
                <dd>{{ c.cdb.rendimentoBruto | brl }}</dd>
                <dt>IR retido</dt>
                <dd class="neg">− {{ c.cdb.valorIR | brl }}</dd>
                <dt>Valor líquido</dt>
                <dd class="total">{{ c.cdb.valorLiquido | brl }}</dd>
              </dl>
            </section>
            <section class="column" [class.winner]="c.vencedor === 'ISENTO'">
              <h3>LCI/LCA (isenta)</h3>
              <dl>
                <dt>Rendimento bruto</dt>
                <dd>{{ c.isento.rendimentoBruto | brl }}</dd>
                <dt>IR retido</dt>
                <dd>{{ c.isento.valorIR | brl }}</dd>
                <dt>Valor líquido</dt>
                <dd class="total">{{ c.isento.valorLiquido | brl }}</dd>
              </dl>
            </section>
          </div>
          <div class="verdict">
            @switch (c.vencedor) {
              @case ('EMPATE') {
                <inv-status-chip label="Empate técnico" tone="neutral" icon="balance" />
              }
              @case ('CDB') {
                <inv-status-chip [label]="'CDB rende ' + (c.diferencaLiquida | brl) + ' a mais'" tone="success" icon="emoji_events" />
              }
              @case ('ISENTO') {
                <inv-status-chip [label]="'LCI/LCA rende ' + (c.diferencaLiquida | brl) + ' a mais'" tone="success" icon="emoji_events" />
              }
            }
            <span class="equiv">
              A LCI/LCA equivale a um CDB de <strong>{{ c.cdbEquivalentePercentCdi / 100 | pct: 1 }} do CDI</strong>
              neste prazo.
            </span>
          </div>
        } @else {
          <p class="hint">Defina valor e prazo no simulador para comparar.</p>
        }
      </mat-card-content>
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
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: var(--inv-space-4);
      margin-top: var(--inv-space-3);
    }
    .label {
      display: block;
      color: var(--inv-text-muted);
      font-size: 0.8125rem;
    }
    .columns {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: var(--inv-space-4);
      margin-top: var(--inv-space-3);
    }
    .column {
      padding: var(--inv-space-4);
      border: 1px solid var(--inv-border);
      border-radius: var(--inv-radius-md);
    }
    .column.winner {
      border-color: var(--inv-positive);
      background: var(--inv-positive-container);
    }
    h3 {
      margin: 0 0 var(--inv-space-2);
      font-size: 1rem;
      font-weight: 500;
    }
    dl {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: var(--inv-space-1) var(--inv-space-3);
      margin: 0;
    }
    dt {
      color: var(--inv-text-muted);
    }
    dd {
      margin: 0;
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    dd.total {
      font-weight: 500;
      font-size: 1.125rem;
    }
    .neg {
      color: var(--inv-negative);
    }
    .verdict {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--inv-space-3);
      margin-top: var(--inv-space-4);
    }
    .equiv,
    .hint {
      color: var(--inv-text-muted);
    }
  `,
})
export class ComparativeSimulatorComponent {
  /** Resultado do comparativo calculado no domínio. */
  readonly comparison = input<ComparisonResult | null>(null);
  /** Valor e prazo (somente leitura; vêm do simulador principal). */
  readonly params = input.required<SimulationInput>();
  /** Taxas em % do CDI (two-way binding). */
  readonly taxas = model.required<ComparisonParams>();

  /**
   * @description Atualiza a taxa do CDB.
   * @param cdbPercentCdi Novo percentual do CDI.
   */
  protected onCdb(cdbPercentCdi: number): void {
    this.taxas.update((current) => ({ ...current, cdbPercentCdi }));
  }

  /**
   * @description Atualiza a taxa da LCI/LCA.
   * @param isentoPercentCdi Novo percentual do CDI.
   */
  protected onIsento(isentoPercentCdi: number): void {
    this.taxas.update((current) => ({ ...current, isentoPercentCdi }));
  }
}
