import { buildDemoClaims } from '@invest/auth-security';
import { API_ENDPOINTS } from './api-contracts';
import { handleMockRequest } from './mock-financial-api';
import { MOCK_FIXED_INCOME, MOCK_FUNDS } from './mock-data';

describe('backend simulado', () => {
  const now = Date.now();
  const retail = buildDemoClaims('RETAIL', now);
  const privateClaims = buildDemoClaims('PRIVATE_BANKING', now);

  it('responde 401 sem token', () => {
    expect(handleMockRequest({ method: 'GET', path: API_ENDPOINTS.rates, body: null, claims: null }).status).toBe(401);
  });

  it('entrega taxas e catálogo de renda fixa ao varejo', () => {
    expect(handleMockRequest({ method: 'GET', path: API_ENDPOINTS.rates, body: null, claims: retail }).status).toBe(200);
    const fixedIncome = handleMockRequest({ method: 'GET', path: API_ENDPOINTS.fixedIncome, body: null, claims: retail });
    expect(fixedIncome.body).toEqual(MOCK_FIXED_INCOME);
  });

  it('fundos exigem PRIVATE_BANKING (403 para o varejo)', () => {
    expect(handleMockRequest({ method: 'GET', path: API_ENDPOINTS.funds, body: null, claims: retail }).status).toBe(403);
    const result = handleMockRequest({ method: 'GET', path: API_ENDPOINTS.funds, body: null, claims: privateClaims });
    expect(result.body).toEqual(MOCK_FUNDS);
  });

  it('ordens: 403 sem permissão, 422 abaixo do mínimo, 404 para ISIN desconhecido e 201 em sucesso', () => {
    const order = (claims: typeof retail, body: unknown) =>
      handleMockRequest({ method: 'POST', path: API_ENDPOINTS.orders, body, claims });
    expect(order(retail, { isin: 'BRCDBBRA0016', valor: 5000 }).status).toBe(403);
    expect(order(privateClaims, { isin: 'BRCDBBRA0016', valor: 10 }).status).toBe(422);
    expect(order(privateClaims, { isin: 'BRXXXXXX0000', valor: 5000 }).status).toBe(404);
    expect(order(privateClaims, { lixo: true }).status).toBe(422);
    const ok = order(privateClaims, { isin: 'BRCDBBRA0016', valor: 5000 });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ status: 'ACEITA', valor: 5000 });
  });

  it('simulações validam parâmetros', () => {
    const simulate = (body: unknown) =>
      handleMockRequest({ method: 'POST', path: API_ENDPOINTS.simulations, body, claims: retail });
    expect(simulate({ isin: 'BRCDBBRA0016', valor: 1000, prazoDias: 360 }).status).toBe(201);
    expect(simulate({ isin: 'BRCDBBRA0016', valor: -1, prazoDias: 360 }).status).toBe(422);
  });

  it('rota inexistente retorna 404', () => {
    expect(handleMockRequest({ method: 'GET', path: '/api/v1/nada', body: null, claims: retail }).status).toBe(404);
  });
});
