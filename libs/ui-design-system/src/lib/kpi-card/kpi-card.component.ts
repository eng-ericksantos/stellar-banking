import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

/** @description Tom semântico do cartão de KPI. */
export type KpiTone = 'neutral' | 'positive' | 'negative' | 'accent';

/**
 * @description Cartão de KPI financeiro (patrimônio, rendimento, IR etc.) — componente
 * *presentational*: só recebe dados via `input()` e não conhece serviços. Com `OnPush`, ele
 * só é reavaliado quando algum input (Signal) muda.
 * @example
 * <inv-kpi-card label="Patrimônio" value="R$ 50.000,00" icon="account_balance" tone="accent" />
 */
@Component({
  selector: 'inv-kpi-card',
  imports: [MatCardModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-card class="kpi" [class]="'kpi kpi--' + tone()" appearance="outlined">
      <mat-card-content>
        <div class="kpi__head">
          <span class="kpi__label">{{ label() }}</span>
          @if (icon()) {
            <mat-icon class="kpi__icon" aria-hidden="true">{{ icon() }}</mat-icon>
          }
        </div>
        <div class="kpi__value" [attr.aria-label]="label() + ': ' + value()">{{ value() }}</div>
        @if (hint()) {
          <div class="kpi__hint">{{ hint() }}</div>
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    :host {
      display: block;
    }
    .kpi {
      height: 100%;
      background: var(--inv-surface-raised);
      border-color: var(--inv-border);
      border-radius: var(--inv-radius-md);
      border-top: 4px solid var(--inv-border);
    }
    .kpi--accent {
      border-top-color: var(--inv-accent-solid);
    }
    .kpi--positive {
      border-top-color: var(--inv-positive);
    }
    .kpi--negative {
      border-top-color: var(--inv-negative);
    }
    .kpi__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      color: var(--inv-text-muted);
      font-size: 0.8125rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .kpi__value {
      margin-top: var(--inv-space-2);
      font-size: 1.75rem;
      font-weight: 500;
      color: var(--inv-text);
      font-variant-numeric: tabular-nums;
    }
    .kpi--positive .kpi__value {
      color: var(--inv-positive);
    }
    .kpi--negative .kpi__value {
      color: var(--inv-negative);
    }
    .kpi__hint {
      margin-top: var(--inv-space-1);
      color: var(--inv-text-muted);
      font-size: 0.8125rem;
    }
  `,
})
export class KpiCardComponent {
  /** Rótulo do indicador. */
  readonly label = input.required<string>();
  /** Valor já formatado. */
  readonly value = input.required<string>();
  /** Texto de apoio opcional. */
  readonly hint = input<string>('');
  /** Ícone Material Symbols opcional. */
  readonly icon = input<string>('');
  /** Tom semântico (cor do destaque). */
  readonly tone = input<KpiTone>('neutral');
}
