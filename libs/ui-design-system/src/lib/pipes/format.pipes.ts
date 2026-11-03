import { Pipe, PipeTransform } from '@angular/core';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * @description Formata um valor em reais (pt-BR) — função pura reutilizável fora de templates.
 * @param value Valor numérico.
 * @returns Texto como `R$ 1.234,56`.
 * @example
 * formatBrl(1234.5); // 'R$ 1.234,50'
 */
export function formatBrl(value: number): string {
  return BRL.format(value);
}

/**
 * @description Formata um número decimal como percentual pt-BR.
 * @param decimal Fração (ex.: `0.1612` → `16,12%`).
 * @param digits Casas decimais (padrão 2).
 * @returns Texto formatado.
 * @example
 * formatPercent(0.1612); // '16,12%'
 */
export function formatPercent(decimal: number, digits = 2): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'percent',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(decimal);
}

/**
 * @description Pipe puro `brl`: formata valores monetários. Por ser *pure*, só reexecuta quando a
 * referência do valor de entrada muda — custo zero em Change Detection OnPush.
 * @example
 * {{ 1500 | brl }}
 */
@Pipe({ name: 'brl' })
export class BrlPipe implements PipeTransform {
  /**
   * @description Aplica a formatação monetária.
   * @param value Valor numérico (ou `null`).
   * @returns Texto formatado ou `'—'` para valores ausentes.
   */
  transform(value: number | null | undefined): string {
    return value === null || value === undefined || Number.isNaN(value) ? '—' : formatBrl(value);
  }
}

/**
 * @description Formata um prazo em dias de forma humana: `90 dias (≈ 3 meses)`, `720 dias (≈ 2 anos)`.
 * @param days Prazo em dias corridos.
 * @returns Texto em pt-BR; prazos curtos (< 60 dias) mostram apenas os dias.
 * @example
 * formatDuration(720); // '720 dias (≈ 2 anos)'
 */
export function formatDuration(days: number): string {
  const label = `${days} ${days === 1 ? 'dia' : 'dias'}`;
  if (days < 60) {
    return label;
  }
  if (days < 360) {
    const months = Math.round(days / 30);
    return `${label} (≈ ${months} meses)`;
  }
  const years = Math.round((days / 365) * 10) / 10;
  const text = years.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  return `${label} (≈ ${text} ${years === 1 ? 'ano' : 'anos'})`;
}

/**
 * @description Pipe puro `pct`: formata frações decimais como percentual.
 * @example
 * {{ 0.1612 | pct }} // 16,12%
 */
@Pipe({ name: 'pct' })
export class PercentPipe implements PipeTransform {
  /**
   * @description Aplica a formatação percentual.
   * @param value Fração decimal (ou `null`).
   * @param digits Casas decimais (padrão 2).
   * @returns Texto formatado ou `'—'`.
   */
  transform(value: number | null | undefined, digits = 2): string {
    return value === null || value === undefined || Number.isNaN(value) ? '—' : formatPercent(value, digits);
  }
}

/**
 * @description Pipe puro `duration`: prazo em dias → texto humano (`720 dias (≈ 2 anos)`).
 * @example
 * {{ 720 | duration }}
 */
@Pipe({ name: 'duration' })
export class DurationPipe implements PipeTransform {
  /**
   * @description Formata o prazo.
   * @param value Dias corridos (ou `null`).
   * @returns Texto formatado ou `'—'`.
   */
  transform(value: number | null | undefined): string {
    return value === null || value === undefined || Number.isNaN(value) ? '—' : formatDuration(value);
  }
}
