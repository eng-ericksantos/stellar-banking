import { formatBrl, formatDuration, formatPercent, BrlPipe, DurationPipe, PercentPipe } from './format.pipes';
import { parseBrNumber } from '../currency-input/currency-input.component';

describe('formatadores pt-BR', () => {
  it('formata prazos de forma humana', () => {
    expect(formatDuration(1)).toBe('1 dia');
    expect(formatDuration(45)).toBe('45 dias');
    expect(formatDuration(90)).toBe('90 dias (≈ 3 meses)');
    expect(formatDuration(720)).toBe('720 dias (≈ 2 anos)');
    expect(formatDuration(540)).toBe('540 dias (≈ 1,5 anos)');
    expect(new DurationPipe().transform(null)).toBe('—');
  });

  it('formata moeda e percentual', () => {
    expect(formatBrl(1234.5).replace(/\s/g, ' ')).toBe('R$ 1.234,50');
    expect(formatPercent(0.1612)).toBe('16,12%');
  });

  it('pipes tratam valores ausentes', () => {
    expect(new BrlPipe().transform(null)).toBe('—');
    expect(new PercentPipe().transform(undefined)).toBe('—');
    expect(new PercentPipe().transform(0.15, 1)).toBe('15,0%');
  });

  it('parseBrNumber interpreta texto digitado em pt-BR', () => {
    expect(parseBrNumber('R$ 1.234,56')).toBe(1234.56);
    expect(parseBrNumber('1500')).toBe(1500);
    expect(parseBrNumber('')).toBeNull();
    expect(parseBrNumber('abc')).toBeNull();
  });
});
