import { API_BASE_PATH, API_ENDPOINTS } from './api-contracts';

/**
 * @description Extrai o *pathname* de uma URL absoluta ou relativa, descartando query/hash.
 * @param url URL da requisição.
 * @returns Caminho normalizado (ex.: `/api/v1/rates`).
 * @example
 * pathOf('/api/v1/rates?x=1'); // '/api/v1/rates'
 */
export function pathOf(url: string): string {
  try {
    return new URL(url, 'http://localhost').pathname;
  } catch {
    return url;
  }
}

/**
 * @description Nome legível do recurso acessado por um caminho (para logs e mensagens ao usuário).
 * @param url URL da requisição.
 * @returns Nome como `catálogo de renda fixa`; o próprio caminho se o recurso for desconhecido.
 * @example
 * describeEndpoint('/api/v1/rates?x=1'); // 'taxas de mercado'
 */
export function describeEndpoint(url: string): string {
  const path = pathOf(url);
  const names: Readonly<Record<string, string>> = {
    [API_ENDPOINTS.rates]: 'taxas de mercado',
    [API_ENDPOINTS.fixedIncome]: 'catálogo de renda fixa',
    [API_ENDPOINTS.funds]: 'fundos',
    [API_ENDPOINTS.portfolio]: 'carteira',
    [API_ENDPOINTS.simulations]: 'simulações',
    [API_ENDPOINTS.orders]: 'ordens de aplicação',
  };
  return names[path] ?? path;
}

/**
 * @description Indica se a URL pertence à API financeira (somente ela recebe JWT — enviar o token
 * a terceiros seria vazamento de credencial). Apenas URLs *relativas* (mesma origem) qualificam.
 * @param url URL da requisição.
 * @returns `true` quando o caminho começa com {@link API_BASE_PATH}.
 * @example
 * isApiUrl('/api/v1/funds'); // true
 */
export function isApiUrl(url: string): boolean {
  // Somente URLs relativas (mesma origem): URLs absolutas ou protocol-relative apontam para
  // terceiros, mesmo que o caminho coincida com /api/v1 — nelas o JWT jamais deve ser enviado.
  if (!url.startsWith('/') || url.startsWith('//')) {
    return false;
  }
  const path = pathOf(url);
  return path === API_BASE_PATH || path.startsWith(`${API_BASE_PATH}/`);
}
