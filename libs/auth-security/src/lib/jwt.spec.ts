import { InvalidTokenError, base64UrlDecode, base64UrlEncode, buildDemoClaims, createDemoJwt, decodeJwt, isExpired } from './jwt';

describe('jwt', () => {
  const now = Date.UTC(2026, 10, 3, 12, 0, 0);

  it('faz round-trip de Base64URL preservando acentos', () => {
    expect(base64UrlDecode(base64UrlEncode('João — renda fixa'))).toBe('João — renda fixa');
  });

  it('decodifica as claims de um token demo', () => {
    const claims = buildDemoClaims('PRIVATE_BANKING', now);
    const decoded = decodeJwt(createDemoJwt(claims));
    expect(decoded.profile).toBe('PRIVATE_BANKING');
    expect(decoded.journeyScopes).toEqual(['RETAIL', 'PRIVATE_BANKING']);
    expect(decoded.permissions).toContain('INVESTMENT_EXECUTE');
  });

  it('concede ao varejo apenas permissões e escopo de varejo', () => {
    const claims = buildDemoClaims('RETAIL', now);
    expect(claims.permissions).not.toContain('INVESTMENT_EXECUTE');
    expect(claims.journeyScopes).toEqual(['RETAIL']);
  });

  it('rejeita token com número de segmentos incorreto', () => {
    expect(() => decodeJwt('abc.def')).toThrow(InvalidTokenError);
  });

  it('rejeita payload que não é JSON', () => {
    expect(() => decodeJwt(`a.${base64UrlEncode('não-json')}.c`)).toThrow(InvalidTokenError);
  });

  it('rejeita claims inválidas (escopo desconhecido)', () => {
    const forged = { ...buildDemoClaims('RETAIL', now), journeyScopes: ['ROOT'] };
    expect(() => decodeJwt(`a.${base64UrlEncode(JSON.stringify(forged))}.c`)).toThrow(InvalidTokenError);
  });

  it('detecta expiração', () => {
    const claims = buildDemoClaims('RETAIL', now, 60);
    expect(isExpired(claims, now + 59_000)).toBe(false);
    expect(isExpired(claims, now + 60_000)).toBe(true);
  });
});
