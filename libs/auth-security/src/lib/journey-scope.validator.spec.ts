import { TestBed } from '@angular/core/testing';
import { JourneyScopeError, JourneyScopeValidator } from './journey-scope.validator';
import { InvalidTokenError, buildDemoClaims, createDemoJwt } from './jwt';

describe('JourneyScopeValidator', () => {
  const now = Date.UTC(2026, 10, 3, 12, 0, 0);
  let validator: JourneyScopeValidator;

  beforeEach(() => {
    validator = TestBed.inject(JourneyScopeValidator);
  });

  it('valida token com o escopo exigido', () => {
    const token = createDemoJwt(buildDemoClaims('PRIVATE_BANKING', now));
    expect(validator.validate(token, 'PRIVATE_BANKING', now).valid).toBe(true);
  });

  it('acusa SCOPE_MISSING quando o escopo não existe no token', () => {
    const token = createDemoJwt(buildDemoClaims('RETAIL', now));
    expect(validator.validate(token, 'PRIVATE_BANKING', now)).toEqual({ valid: false, reason: 'SCOPE_MISSING' });
  });

  it('acusa MISSING_TOKEN, MALFORMED e EXPIRED', () => {
    expect(validator.validate(null, 'RETAIL', now)).toEqual({ valid: false, reason: 'MISSING_TOKEN' });
    expect(validator.validate('lixo', 'RETAIL', now)).toEqual({ valid: false, reason: 'MALFORMED' });
    const expired = createDemoJwt(buildDemoClaims('RETAIL', now, 10));
    expect(validator.validate(expired, 'RETAIL', now + 11_000)).toEqual({ valid: false, reason: 'EXPIRED' });
  });

  it('assertScope lança JourneyScopeError quando o escopo falta', () => {
    const token = createDemoJwt(buildDemoClaims('RETAIL', now));
    expect(() => validator.assertScope(token, 'PRIVATE_BANKING', now)).toThrow(JourneyScopeError);
  });

  it('assertScope lança InvalidTokenError para token ausente', () => {
    expect(() => validator.assertScope(null, 'RETAIL', now)).toThrow(InvalidTokenError);
  });
});
