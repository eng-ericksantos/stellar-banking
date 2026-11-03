import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * @description Placeholder animado (shimmer) usado em `@placeholder`/`@loading` de blocos `@defer`.
 * Reserva o espaço do conteúdo final, evitando *layout shift* (CLS) quando o bloco é carregado.
 * Respeita `prefers-reduced-motion`.
 * @example
 * <inv-skeleton height="180px" [lines]="3" />
 */
@Component({
  selector: 'inv-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="skeleton" role="status" aria-live="polite" [style.min-height]="height()">
      <span class="inv-sr-only">{{ label() }}</span>
      @for (line of lineIndexes(); track line) {
        <div class="skeleton__line" [style.width]="line === lastIndex() ? '60%' : '100%'"></div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .skeleton {
      display: flex;
      flex-direction: column;
      gap: var(--inv-space-3);
      padding: var(--inv-space-4);
      border: 1px dashed var(--inv-border);
      border-radius: var(--inv-radius-md);
      background: var(--inv-surface-raised);
    }
    .skeleton__line {
      height: 16px;
      border-radius: var(--inv-radius-sm);
      background: linear-gradient(90deg, var(--inv-surface-sunken) 25%, var(--inv-border) 50%, var(--inv-surface-sunken) 75%);
      background-size: 200% 100%;
      animation: shimmer 1.4s infinite linear;
    }
    @keyframes shimmer {
      from {
        background-position: 200% 0;
      }
      to {
        background-position: -200% 0;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .skeleton__line {
        animation: none;
      }
    }
  `,
})
export class SkeletonComponent {
  /** Altura mínima do bloco (qualquer unidade CSS). */
  readonly height = input<string>('120px');
  /** Quantidade de linhas. */
  readonly lines = input<number>(3);
  /** Texto para leitores de tela. */
  readonly label = input<string>('Carregando conteúdo');

  /** Índices das linhas para o `@for`. */
  protected readonly lineIndexes = computed(() => Array.from({ length: Math.max(1, this.lines()) }, (_, index) => index));
  /** Índice da última linha (renderizada mais curta). */
  protected readonly lastIndex = computed(() => Math.max(1, this.lines()) - 1);
}
