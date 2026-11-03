import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthSessionService, SESSION_CLEANUP_HANDLERS } from '@invest/auth-security';
import { globalLogoutInterceptor } from './global-logout.interceptor';
import { HTTP_FEEDBACK, HttpFeedbackPort } from './http-core.tokens';

describe('globalLogoutInterceptor', () => {
  let http: HttpClient;
  let controller: HttpTestingController;
  let session: AuthSessionService;
  let feedback: HttpFeedbackPort;
  const cleanup = vi.fn();

  beforeEach(() => {
    sessionStorage.clear();
    cleanup.mockClear();
    feedback = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      retryAttempt: vi.fn(),
      sessionTerminated: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([globalLogoutInterceptor])),
        provideHttpClientTesting(),
        { provide: HTTP_FEEDBACK, useValue: feedback },
        { provide: SESSION_CLEANUP_HANDLERS, multi: true, useValue: cleanup },
      ],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
    session = TestBed.inject(AuthSessionService);
  });

  afterEach(() => controller.verify());

  it('401 encerra a sessão, limpa o estado e aciona o modal global', () => {
    let propagated = 0;
    http.get('/api/v1/rates').subscribe({ error: (e: { status: number }) => (propagated = e.status) });
    controller.expectOne('/api/v1/rates').flush('x', { status: 401, statusText: 'Unauthorized' });

    expect(session.isAuthenticated()).toBe(false);
    expect(session.terminationReason()).toBe('UNAUTHORIZED');
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(feedback.sessionTerminated).toHaveBeenCalledWith('UNAUTHORIZED');
    expect(propagated).toBe(401);
  });

  it('403 também encerra a sessão', () => {
    http.get('/api/v1/funds').subscribe({ error: () => undefined });
    controller.expectOne('/api/v1/funds').flush('x', { status: 403, statusText: 'Forbidden' });
    expect(session.terminationReason()).toBe('FORBIDDEN');
  });

  it('falhas concorrentes geram um único modal', () => {
    http.get('/api/v1/a').subscribe({ error: () => undefined });
    http.get('/api/v1/b').subscribe({ error: () => undefined });
    controller.expectOne('/api/v1/a').flush('x', { status: 401, statusText: 'Unauthorized' });
    controller.expectOne('/api/v1/b').flush('x', { status: 401, statusText: 'Unauthorized' });
    expect(feedback.sessionTerminated).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('5xx não encerra a sessão', () => {
    http.get('/api/v1/a').subscribe({ error: () => undefined });
    controller.expectOne('/api/v1/a').flush('x', { status: 503, statusText: 'Service Unavailable' });
    expect(session.isAuthenticated()).toBe(true);
    expect(feedback.sessionTerminated).not.toHaveBeenCalled();
  });
});
