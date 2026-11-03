import { TestBed } from '@angular/core/testing';
import { Route, Router, UrlSegment, UrlTree, provideRouter } from '@angular/router';
import { FeatureFlagsService } from './feature-flags.service';
import { AuthSessionService } from './auth-session.service';
import { accessDataGuard, requireAccessMatch } from './access.guard';

describe('Guards de ACL', () => {
  let session: AuthSessionService;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    session = TestBed.inject(AuthSessionService);
  });

  /** Executa um `CanMatchFn` no contexto de injeção. */
  function runMatch(guard: ReturnType<typeof requireAccessMatch>): boolean | UrlTree {
    return TestBed.runInInjectionContext(() => guard({} as Route, [] as UrlSegment[], {} as never)) as boolean | UrlTree;
  }

  it('permite quando perfil possui permissão e escopo', () => {
    session.loginAs('RETAIL');
    expect(runMatch(requireAccessMatch({ permission: 'FIXED_INCOME_READ', scope: 'RETAIL' }))).toBe(true);
  });

  it('redireciona para /acesso-negado quando falta permissão', () => {
    session.loginAs('RETAIL');
    const result = runMatch(requireAccessMatch({ permission: 'INVESTMENT_EXECUTE' }));
    expect(result instanceof UrlTree && TestBed.inject(Router).serializeUrl(result)).toBe('/acesso-negado');
  });

  it('redireciona para /acesso-negado quando falta o escopo de jornada', () => {
    session.loginAs('RETAIL');
    const result = runMatch(requireAccessMatch({ scope: 'PRIVATE_BANKING' }));
    expect(result instanceof UrlTree && TestBed.inject(Router).serializeUrl(result)).toBe('/acesso-negado');
  });

  it('redireciona para /login sem sessão', () => {
    session.logout('USER_REQUEST');
    const result = runMatch(requireAccessMatch({ permission: 'FIXED_INCOME_READ' }));
    expect(result instanceof UrlTree && TestBed.inject(Router).serializeUrl(result)).toBe('/login');
  });

  it('respeita Feature Flags reativas', () => {
    session.loginAs('PRIVATE_BANKING');
    const flags = TestBed.inject(FeatureFlagsService);
    const guard = requireAccessMatch({ featureFlag: 'MULTIMARKET_FUNDS' });
    expect(runMatch(guard)).toBe(true);
    flags.set('MULTIMARKET_FUNDS', false);
    expect(runMatch(guard)).toBeInstanceOf(UrlTree);
  });

  it('accessDataGuard lê permissão/escopo de route.data', () => {
    session.loginAs('RETAIL');
    const allowed = TestBed.runInInjectionContext(() =>
      accessDataGuard({ data: { permission: 'SIMULATION_RUN', scope: 'RETAIL' } } as never, {} as never),
    );
    expect(allowed).toBe(true);
    const denied = TestBed.runInInjectionContext(() =>
      accessDataGuard({ data: { permission: 'FUNDS_READ' } } as never, {} as never),
    );
    expect(denied).toBeInstanceOf(UrlTree);
  });
});
