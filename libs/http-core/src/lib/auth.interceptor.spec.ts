import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { JourneyScopeError } from '@invest/auth-security';
import { AuthSessionService } from '@invest/auth-security';
import { authInterceptor, resolveRequiredScope } from './auth.interceptor';
import { HTTP_FEEDBACK, HttpFeedbackPort, apiContext, API_SCOPE_POLICY } from './http-core.tokens';

describe('authInterceptor', () => {
  let http: HttpClient;
  let controller: HttpTestingController;
  let session: AuthSessionService;
  let feedback: HttpFeedbackPort;

  beforeEach(() => {
    sessionStorage.clear();
    feedback = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      retryAttempt: vi.fn(),
      sessionTerminated: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: HTTP_FEEDBACK, useValue: feedback },
      ],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
    session = TestBed.inject(AuthSessionService);
  });

  afterEach(() => controller.verify());

  it('injeta o JWT Bearer em chamadas da API', () => {
    http.get('/api/v1/rates').subscribe();
    const request = controller.expectOne('/api/v1/rates');
    expect(request.request.headers.get('Authorization')).toBe(`Bearer ${session.token()}`);
    request.flush({});
  });

  it('NÃO envia o token a URLs de terceiros (evita vazamento de credencial)', () => {
    http.get('https://terceiro.example/api/v1/rates').subscribe();
    const request = controller.expectOne('https://terceiro.example/api/v1/rates');
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({});
  });

  it('bloqueia ANTES do disparo quando o token não possui o journeyScope exigido', () => {
    let error: unknown;
    http.get('/api/v1/funds').subscribe({ error: (e: unknown) => (error = e) });
    controller.expectNone('/api/v1/funds');
    expect(error).toBeInstanceOf(JourneyScopeError);
    expect((error as JourneyScopeError).requiredScope).toBe('PRIVATE_BANKING');
    expect(feedback.warn).toHaveBeenCalled();
  });

  it('libera o endpoint restrito quando o perfil possui o escopo', () => {
    session.loginAs('PRIVATE_BANKING');
    http.get('/api/v1/funds').subscribe();
    controller.expectOne('/api/v1/funds').flush([]);
  });

  it('o escopo informado no HttpContext prevalece sobre a política por prefixo', () => {
    let error: unknown;
    http.get('/api/v1/rates', { context: apiContext({ scope: 'PRIVATE_BANKING' }) }).subscribe({
      error: (e: unknown) => (error = e),
    });
    controller.expectNone('/api/v1/rates');
    expect(error).toBeInstanceOf(JourneyScopeError);
  });

  it('gera 401 local sem disparar a requisição quando não há token vigente', () => {
    session.logout('USER_REQUEST');
    let status = 0;
    http.get('/api/v1/rates').subscribe({ error: (e: { status: number }) => (status = e.status) });
    controller.expectNone('/api/v1/rates');
    expect(status).toBe(401);
  });

  it('resolveRequiredScope usa o maior prefixo', () => {
    const policy = TestBed.inject(API_SCOPE_POLICY);
    expect(resolveRequiredScope('/api/v1/funds', policy)).toBe('PRIVATE_BANKING');
    expect(resolveRequiredScope('/api/v1/rates', policy)).toBe('RETAIL');
    expect(resolveRequiredScope('/outra', policy)).toBeNull();
  });
});
