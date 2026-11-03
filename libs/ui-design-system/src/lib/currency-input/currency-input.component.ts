import { ChangeDetectionStrategy, Component, computed, input, model, signal } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { formatBrl } from '../pipes/format.pipes';

/**
 * @description Converte texto digitado em pt-BR (`1.234,56`) para número.
 * @param text Texto digitado (aceita prefixo `R$` e espaços).
 * @returns Número, ou `null` se o texto não representar um valor válido (ou estiver vazio).
 * @example
 * parseBrNumber('R$ 1.234,56'); // 1234.56
 */
export function parseBrNumber(text: string): number | null {
  const cleaned = text.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
  if (cleaned === '' || !/^-?\d*\.?\d*$/.test(cleaned)) {
    return null;
  }
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/**
 * @description Campo monetário formatado (R$) com **two-way binding via `model()`**:
 * `<inv-currency-input [(value)]="valor" />`. Enquanto o usuário digita, exibe o texto cru (sem
 * "pular" o cursor); ao sair do campo, exibe o valor formatado em reais.
 * @example
 * <inv-currency-input label="Valor a investir" [min]="1000" [(value)]="amount" />
 */
@Component({
  selector: 'inv-currency-input',
  imports: [MatFormFieldModule, MatInputModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-form-field appearance="outline" class="field">
      <mat-label>{{ label() }}</mat-label>
      <input
        matInput
        type="text"
        inputmode="decimal"
        autocomplete="off"
        [value]="display()"
        [attr.aria-invalid]="belowMin()"
        (focus)="onFocus()"
        (input)="onInput($event)"
        (blur)="onBlur()"
      />
      <mat-hint [class.hint--invalid]="belowMin()">
        {{ belowMin() ? 'Valor mínimo: ' + minFormatted() : hint() }}
      </mat-hint>
    </mat-form-field>
  `,
  styles: `
    :host {
      display: block;
    }
    .field {
      width: 100%;
    }
    .hint--invalid {
      color: var(--inv-negative);
    }
  `,
})
export class CurrencyInputComponent {
  /** Valor numérico (two-way binding). */
  readonly value = model<number>(0);
  /** Rótulo do campo. */
  readonly label = input<string>('Valor');
  /** Texto de apoio. */
  readonly hint = input<string>('');
  /** Valor mínimo aceito (valores menores são sinalizados). */
  readonly min = input<number>(0);
  /** Valor máximo aceito (valores maiores são limitados). */
  readonly max = input<number>(Number.MAX_SAFE_INTEGER);

  private readonly editing = signal(false);
  private readonly raw = signal('');

  /** Texto exibido no input. */
  protected readonly display = computed(() => (this.editing() ? this.raw() : formatBrl(this.value())));
  /** `true` quando o valor atual é menor que o mínimo. */
  protected readonly belowMin = computed(() => this.value() < this.min());
  /** Mínimo formatado. */
  protected readonly minFormatted = computed(() => formatBrl(this.min()));

  /**
   * @description Ao focar, passa a exibir o texto editável (sem máscara).
   */
  protected onFocus(): void {
    this.editing.set(true);
    this.raw.set(this.value() ? String(this.value()).replace('.', ',') : '');
  }

  /**
   * @description Interpreta o texto digitado e atualiza o model quando válido.
   * @param event Evento `input` do elemento.
   */
  protected onInput(event: Event): void {
    const text = (event.target as HTMLInputElement).value;
    this.raw.set(text);
    const parsed = parseBrNumber(text);
    this.value.set(parsed === null ? 0 : Math.min(Math.max(parsed, 0), this.max()));
  }

  /**
   * @description Ao sair do campo, volta a exibir o valor formatado.
   */
  protected onBlur(): void {
    this.editing.set(false);
  }
}
