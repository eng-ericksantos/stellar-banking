import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';

/** @description Tom semântico do chip de status. */
export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent';

/**
 * @description Chip de status (risco, liquidez, FGC, isenção de IR). Encapsula o `MatChip` com as
 * cores semânticas do Design System — consumidores escolhem apenas o *tom*, nunca cores literais.
 * @example
 * <inv-status-chip label="Risco baixo" tone="success" icon="shield" />
 */
@Component({
  selector: 'inv-status-chip',
  imports: [MatChipsModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-chip-set [attr.aria-label]="ariaLabel() || label()">
      <mat-chip [class]="'chip chip--' + tone()" disableRipple>
        @if (icon()) {
          <mat-icon matChipAvatar aria-hidden="true">{{ icon() }}</mat-icon>
        }
        {{ label() }}
      </mat-chip>
    </mat-chip-set>
  `,
  styles: `
    :host {
      display: inline-block;
    }
    .chip {
      --mat-chip-container-height: 26px;
      --mat-chip-label-text-size: 0.75rem;
      --mat-chip-label-text-weight: 500;
      --mat-chip-container-shape-radius: 13px;
      --mat-chip-elevated-container-color: var(--inv-surface-sunken);
      --mat-chip-label-text-color: var(--inv-text);
      --mat-chip-with-avatar-avatar-size: 16px;
    }
    .chip--success {
      --mat-chip-elevated-container-color: var(--inv-positive-container);
      --mat-chip-label-text-color: var(--inv-positive);
    }
    .chip--warning {
      --mat-chip-elevated-container-color: var(--inv-warning-container);
      --mat-chip-label-text-color: var(--inv-warning);
    }
    .chip--danger {
      --mat-chip-elevated-container-color: var(--inv-negative-container);
      --mat-chip-label-text-color: var(--inv-negative);
    }
    .chip--info {
      --mat-chip-elevated-container-color: var(--inv-primary-container);
      --mat-chip-label-text-color: var(--inv-on-primary-container);
    }
    .chip--accent {
      --mat-chip-elevated-container-color: var(--inv-accent-container);
      --mat-chip-label-text-color: var(--inv-accent);
    }
  `,
})
export class StatusChipComponent {
  /** Texto exibido. */
  readonly label = input.required<string>();
  /** Tom semântico. */
  readonly tone = input<StatusTone>('neutral');
  /** Ícone Material Symbols opcional. */
  readonly icon = input<string>('');
  /** Texto alternativo para leitores de tela (padrão: o próprio rótulo). */
  readonly ariaLabel = input<string>('');
}
