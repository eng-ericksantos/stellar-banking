/**
 * @file Branded Types (tipos "nominais") dos contratos financeiros.
 *
 * Por que branding? `string` e `number` são intercambiáveis para o compilador: nada impede passar
 * um CNPJ onde se espera um ISIN. Com um *brand* fantasma (que só existe em tempo de compilação),
 * `CNPJ` e `ISIN` tornam-se tipos incompatíveis entre si e só podem ser obtidos por meio de
 * construtores que VALIDAM o valor (dígitos verificadores, formato, faixa) — "parse, don't validate".
 */

declare const brand: unique symbol;

/**
 * @description Cria um tipo nominal a partir de um tipo base.
 * @example
 * type UserId = Brand<string, 'UserId'>;
 */
export type Brand<TBase, TBrand extends string> = TBase & { readonly [brand]: TBrand };

/** @description CNPJ válido, somente dígitos (14 posições). */
export type CNPJ = Brand<string, 'CNPJ'>;

/** @description ISIN válido (ISO 6166) com dígito verificador conferido. */
export type ISIN = Brand<string, 'ISIN'>;

/** @description Código de negociação (ticker) em caixa alta, 4 a 12 caracteres alfanuméricos. */
export type Ticker = Brand<string, 'Ticker'>;

/**
 * @description Taxa de rentabilidade em **percentual** (ex.: `110` = 110% do CDI; `7.45` = IPCA + 7,45% a.a.).
 * Sempre finita e maior que zero.
 */
export type TaxaRentabilidade = Brand<number, 'TaxaRentabilidade'>;

/** @description Campo cujo valor foi rejeitado numa validação de domínio. */
export type DomainField = 'CNPJ' | 'ISIN' | 'Ticker' | 'TaxaRentabilidade';

/**
 * @description Erro de validação de um valor de domínio.
 */
export class DomainValidationError extends Error {
  /**
   * @description Cria o erro de validação.
   * @param field Campo de domínio violado.
   * @param value Valor recebido (para diagnóstico).
   * @param reason Motivo legível.
   */
  constructor(
    readonly field: DomainField,
    readonly value: unknown,
    reason: string,
  ) {
    super(`${field} inválido (${String(value)}): ${reason}`);
    this.name = 'DomainValidationError';
  }
}

/** @description Resultado discriminado de uma tentativa de parse (sem exceções para fluxo normal). */
export type ParseOutcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: DomainValidationError };

/**
 * @description Calcula os dois dígitos verificadores de um CNPJ a partir dos 12 primeiros dígitos.
 * @param base12 Base numérica com 12 dígitos.
 * @returns Os dois dígitos verificadores concatenados (ex.: `'95'`).
 * @example
 * cnpjCheckDigits('123456780001'); // '95'
 */
export function cnpjCheckDigits(base12: string): string {
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const calc = (digits: string, weights: readonly number[]): number => {
    const total = [...digits].reduce((sum, char, index) => sum + Number(char) * (weights[index] ?? 0), 0);
    const remainder = total % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  const first = calc(base12, weights1);
  const second = calc(`${base12}${first}`, weights2);
  return `${first}${second}`;
}

/**
 * @description Type guard: verifica se o texto (apenas dígitos) é um CNPJ válido.
 * @param raw Texto candidato com 14 dígitos.
 * @returns `true` se o formato e os dígitos verificadores conferem.
 * @example
 * isValidCnpj('12345678000195'); // true
 */
export function isValidCnpj(raw: string): raw is CNPJ {
  if (!/^\d{14}$/.test(raw) || /^(\d)\1{13}$/.test(raw)) {
    return false;
  }
  return cnpjCheckDigits(raw.slice(0, 12)) === raw.slice(12);
}

/**
 * @description Constrói um {@link CNPJ} a partir de texto, aceitando máscara (`00.000.000/0000-00`).
 * @param raw Texto candidato.
 * @returns Resultado discriminado com o CNPJ branded ou o erro.
 * @example
 * const result = parseCnpj('12.345.678/0001-95');
 */
export function parseCnpj(raw: string): ParseOutcome<CNPJ> {
  const digits = raw.replace(/[.\-/\s]/g, '');
  return isValidCnpj(digits)
    ? { ok: true, value: digits }
    : { ok: false, error: new DomainValidationError('CNPJ', raw, 'formato ou dígitos verificadores inválidos') };
}

/**
 * @description Aplica a máscara de exibição a um CNPJ.
 * @param cnpj CNPJ validado.
 * @returns Texto no formato `00.000.000/0000-00`.
 * @example
 * formatCnpj(cnpj); // '12.345.678/0001-95'
 */
export function formatCnpj(cnpj: CNPJ): string {
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
}

/**
 * @description Calcula o dígito verificador ISIN (algoritmo de Luhn sobre os 11 primeiros caracteres,
 * com letras expandidas para A=10…Z=35).
 * @param body Os 11 primeiros caracteres (país + NSIN).
 * @returns Dígito verificador de 0 a 9.
 * @example
 * isinCheckDigit('BRCDBBRA001'); // 6
 */
export function isinCheckDigit(body: string): number {
  const expanded = [...body].map((char) => (/\d/.test(char) ? char : String(char.charCodeAt(0) - 55))).join('');
  let sum = 0;
  let double = true;
  for (let index = expanded.length - 1; index >= 0; index--) {
    let digit = Number(expanded[index]);
    if (double) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    sum += digit;
    double = !double;
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * @description Type guard: verifica se o texto é um ISIN válido.
 * @param raw Texto candidato (12 caracteres).
 * @returns `true` se formato e dígito verificador conferem.
 * @example
 * isValidIsin('BRCDBBRA0016'); // true
 */
export function isValidIsin(raw: string): raw is ISIN {
  return /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(raw) && isinCheckDigit(raw.slice(0, 11)) === Number(raw[11]);
}

/**
 * @description Constrói um {@link ISIN}.
 * @param raw Texto candidato.
 * @returns Resultado discriminado.
 * @example
 * const isin = parseIsin('BRCDBBRA0016');
 */
export function parseIsin(raw: string): ParseOutcome<ISIN> {
  const normalized = raw.trim().toUpperCase();
  return isValidIsin(normalized)
    ? { ok: true, value: normalized }
    : { ok: false, error: new DomainValidationError('ISIN', raw, 'formato ou dígito verificador inválido') };
}

/**
 * @description Constrói um {@link Ticker}.
 * @param raw Texto candidato.
 * @returns Resultado discriminado.
 * @example
 * const ticker = parseTicker('ntnb2035'); // value: 'NTNB2035'
 */
export function parseTicker(raw: string): ParseOutcome<Ticker> {
  const normalized = raw.trim().toUpperCase();
  return /^[A-Z0-9]{4,12}$/.test(normalized)
    ? { ok: true, value: normalized as Ticker }
    : { ok: false, error: new DomainValidationError('Ticker', raw, 'deve conter 4 a 12 caracteres alfanuméricos') };
}

/**
 * @description Constrói uma {@link TaxaRentabilidade} (percentual finito, > 0 e ≤ 1000).
 * @param value Valor percentual.
 * @returns Resultado discriminado.
 * @example
 * const taxa = parseTaxa(110);
 */
export function parseTaxa(value: number): ParseOutcome<TaxaRentabilidade> {
  return Number.isFinite(value) && value > 0 && value <= 1000
    ? { ok: true, value: value as TaxaRentabilidade }
    : { ok: false, error: new DomainValidationError('TaxaRentabilidade', value, 'deve ser > 0 e ≤ 1000') };
}

/**
 * @description Desembrulha um {@link ParseOutcome} lançando o erro de domínio quando inválido.
 * @param outcome Resultado de um parse.
 * @returns Valor branded.
 * @throws {DomainValidationError} Quando o resultado é inválido.
 * @example
 * const isin = unwrap(parseIsin('BRCDBBRA0016'));
 */
export function unwrap<T>(outcome: ParseOutcome<T>): T {
  if (outcome.ok) {
    return outcome.value;
  }
  throw outcome.error;
}
