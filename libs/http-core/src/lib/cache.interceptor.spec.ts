import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TransferState, makeStateKey } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { cacheInterceptor } from './cache.interceptor';
import { HttpCacheStore } from './http-cache.store';
import { apiContext } from './http-core.tokens';

describe('cacheInterceptor', () => {
  let http: HttpClient;
  let controller: HttpTestingController;
  let store: HttpCacheStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([cacheInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
    store = TestBed.inject(HttpCacheStore);
  });

  afterEach(() => controller.verify());

  it('serve a segunda leitura do cache dentro do TTL (uma única ida à rede)', () => {
    const results: unknown[] = [];
    const options = { context: apiContext({ cacheTtlMs: 60_000 }) };
    http.get('/api/v1/rates', options).subscribe((body) => results.push(body));
    controller.expectOne('/api/v1/rates').flush({ cdi: 14.65 });

    http.get('/api/v1/rates', options).subscribe((body) => results.push(body));
    controller.expectNone('/api/v1/rates');
    expect(results).toEqual([{ cdi: 14.65 }, { cdi: 14.65 }]);
  });

  it('expira a entrada após o TTL', () => {
    vi.useFakeTimers();
    try {
      const options = { context: apiContext({ cacheTtlMs: 1000 }) };
      http.get('/api/v1/rates', options).subscribe();
      controller.expectOne('/api/v1/rates').flush({});
      vi.advanceTimersByTime(1001);
      http.get('/api/v1/rates', options).subscribe();
      controller.expectOne('/api/v1/rates').flush({});
    } finally {
      vi.useRealTimers();
    }
  });

  it('não usa cache sem TTL no contexto', () => {
    http.get('/api/v1/fixed-income').subscribe();
    controller.expectOne('/api/v1/fixed-income').flush([]);
    http.get('/api/v1/fixed-income').subscribe();
    controller.expectOne('/api/v1/fixed-income').flush([]);
    expect(store.size).toBe(0);
  });

  it('SKIP_CACHE revalida na rede e atualiza o cache', () => {
    http.get('/api/v1/rates', { context: apiContext({ cacheTtlMs: 60_000 }) }).subscribe();
    controller.expectOne('/api/v1/rates').flush({ cdi: 1 });

    let fresh: unknown;
    http.get('/api/v1/rates', { context: apiContext({ cacheTtlMs: 60_000, skipCache: true }) }).subscribe((b) => (fresh = b));
    controller.expectOne('/api/v1/rates').flush({ cdi: 2 });
    expect(fresh).toEqual({ cdi: 2 });

    let cached: unknown;
    http.get('/api/v1/rates', { context: apiContext({ cacheTtlMs: 60_000 }) }).subscribe((b) => (cached = b));
    expect(cached).toEqual({ cdi: 2 });
  });

  it('invalida entradas do mesmo recurso após mutação bem-sucedida', () => {
    http.get('/api/v1/orders', { context: apiContext({ cacheTtlMs: 60_000 }) }).subscribe();
    controller.expectOne('/api/v1/orders').flush([]);
    expect(store.size).toBe(1);
    http.post('/api/v1/orders', {}).subscribe();
    controller.expectOne('/api/v1/orders').flush({});
    expect(store.size).toBe(0);
  });

  it('consome o TransferState do SSR na hidratação (sem request duplicado)', () => {
    const key = makeStateKey<{ body: unknown; status: number; statusText: string }>('inv-http:/api/v1/rates');
    const transferState = TestBed.inject(TransferState);
    transferState.set(key, { body: { cdi: 14.65 }, status: 200, statusText: 'OK' });

    let result: unknown;
    http.get('/api/v1/rates', { context: apiContext({ cacheTtlMs: 60_000 }) }).subscribe((b) => (result = b));
    controller.expectNone('/api/v1/rates');
    expect(result).toEqual({ cdi: 14.65 });
    expect(transferState.hasKey(key)).toBe(false);
  });

  it('entrega cópias: mutar a resposta não corrompe o cache', () => {
    const options = { context: apiContext({ cacheTtlMs: 60_000 }) };
    http.get<{ cdi: number }>('/api/v1/rates', options).subscribe();
    controller.expectOne('/api/v1/rates').flush({ cdi: 14.65 });
    http.get<{ cdi: number }>('/api/v1/rates', options).subscribe((body) => (body.cdi = 0));
    let again: { cdi: number } | undefined;
    http.get<{ cdi: number }>('/api/v1/rates', options).subscribe((body) => (again = body));
    expect(again?.cdi).toBe(14.65);
  });
});
