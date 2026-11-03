import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { HTTP_FEEDBACK, HttpFeedbackPort, RETRY_CONFIG, RetryConfig, apiContext } from './http-core.tokens';
import { computeBackoffDelay, isTransientError, retryInterceptor } from './retry.interceptor';

describe('retryInterceptor', () => {
  const config: RetryConfig = {
    maxRetries: 3,
    baseDelayMs: 100,
    factor: 2,
    maxDelayMs: 1000,
    requestTimeoutMs: 5000,
    random: () => 0,
  };
  let http: HttpClient;
  let controller: HttpTestingController;
  let feedback: HttpFeedbackPort;

  beforeEach(() => {
    vi.useFakeTimers();
    feedback = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      retryAttempt: vi.fn(),
      sessionTerminated: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([retryInterceptor])),
        provideHttpClientTesting(),
        { provide: RETRY_CONFIG, useValue: config },
        { provide: HTTP_FEEDBACK, useValue: feedback },
      ],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    controller.verify();
    vi.useRealTimers();
  });

  it('repete 503 com backoff exponencial e conclui com sucesso', async () => {
    let result: unknown;
    http.get('/api/v1/fixed-income').subscribe((body) => (result = body));

    controller.expectOne('/api/v1/fixed-income').flush('x', { status: 503, statusText: 'Service Unavailable' });
    await vi.advanceTimersByTimeAsync(50); // 1ª espera: teto 100 → 50ms (jitter = 0)
    controller.expectOne('/api/v1/fixed-income').flush('x', { status: 503, statusText: 'Service Unavailable' });
    await vi.advanceTimersByTimeAsync(100); // 2ª espera: teto 200 → 100ms
    controller.expectOne('/api/v1/fixed-income').flush({ ok: true });

    expect(result).toEqual({ ok: true });
    expect(feedback.retryAttempt).toHaveBeenCalledTimes(2);
    expect(feedback.retryAttempt).toHaveBeenNthCalledWith(1, expect.objectContaining({ attempt: 1, delayMs: 50, status: 503 }));
    expect(feedback.retryAttempt).toHaveBeenNthCalledWith(2, expect.objectContaining({ attempt: 2, delayMs: 100, maxAttempts: 3 }));
  });

  it('esgota as tentativas e propaga o último erro', async () => {
    let error: unknown;
    http.get('/api/v1/fixed-income').subscribe({ error: (e: unknown) => (error = e) });

    for (const wait of [50, 100, 200]) {
      controller.expectOne('/api/v1/fixed-income').flush('x', { status: 503, statusText: 'Service Unavailable' });
      await vi.advanceTimersByTimeAsync(wait);
    }
    controller.expectOne('/api/v1/fixed-income').flush('x', { status: 503, statusText: 'Service Unavailable' });

    expect(error).toBeInstanceOf(HttpErrorResponse);
    expect((error as HttpErrorResponse).status).toBe(503);
    expect(feedback.retryAttempt).toHaveBeenCalledTimes(3);
  });

  it('não repete erros 4xx (ex.: 401 e 422)', async () => {
    const errors: number[] = [];
    http.get('/api/v1/a').subscribe({ error: (e: HttpErrorResponse) => errors.push(e.status) });
    controller.expectOne('/api/v1/a').flush('x', { status: 401, statusText: 'Unauthorized' });
    http.get('/api/v1/b').subscribe({ error: (e: HttpErrorResponse) => errors.push(e.status) });
    controller.expectOne('/api/v1/b').flush('x', { status: 422, statusText: 'Unprocessable' });
    await vi.advanceTimersByTimeAsync(5000);
    expect(errors).toEqual([401, 422]);
    expect(feedback.retryAttempt).not.toHaveBeenCalled();
  });

  it('não repete POST (poderia duplicar ordem), exceto se marcado como RETRY_SAFE', async () => {
    let failed = false;
    http.post('/api/v1/orders', {}).subscribe({ error: () => (failed = true) });
    controller.expectOne('/api/v1/orders').flush('x', { status: 503, statusText: 'Service Unavailable' });
    expect(failed).toBe(true);

    http.post('/api/v1/simulations', {}, { context: apiContext({ retrySafe: true }) }).subscribe();
    controller.expectOne('/api/v1/simulations').flush('x', { status: 503, statusText: 'Service Unavailable' });
    await vi.advanceTimersByTimeAsync(50);
    controller.expectOne('/api/v1/simulations').flush({});
  });

  it('ignora URLs fora da API', () => {
    let failed = false;
    http.get('https://terceiro.example/x').subscribe({ error: () => (failed = true) });
    controller.expectOne('https://terceiro.example/x').flush('x', { status: 503, statusText: 'Service Unavailable' });
    expect(failed).toBe(true);
  });

  it('computeBackoffDelay cresce exponencialmente, respeita o teto e aplica jitter', () => {
    const noJitter = { baseDelayMs: 100, factor: 2, maxDelayMs: 500, random: () => 0 };
    expect([1, 2, 3, 4, 5].map((n) => computeBackoffDelay(n, noJitter))).toEqual([50, 100, 200, 250, 250]);
    const fullJitter = { ...noJitter, random: () => 1 };
    expect(computeBackoffDelay(1, fullJitter)).toBe(100);
    expect(computeBackoffDelay(10, fullJitter)).toBe(500);
  });

  it('isTransientError classifica corretamente', () => {
    expect(isTransientError(new HttpErrorResponse({ status: 503 }))).toBe(true);
    expect(isTransientError(new HttpErrorResponse({ status: 0 }))).toBe(true);
    expect(isTransientError(new HttpErrorResponse({ status: 401 }))).toBe(false);
    expect(isTransientError(new Error('x'))).toBe(false);
  });
});
