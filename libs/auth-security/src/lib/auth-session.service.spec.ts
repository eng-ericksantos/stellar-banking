import { TestBed } from '@angular/core/testing';
import { SESSION_CLEANUP_HANDLERS, SESSION_ENDED_MARKER, SESSION_STORAGE_KEY } from './auth.tokens';
import { AuthSessionService } from './auth-session.service';

describe('AuthSessionService', () => {
  beforeEach(() => sessionStorage.clear());

  it('nasce com sessão demo RETAIL (idêntica no servidor e no browser)', () => {
    const session = TestBed.inject(AuthSessionService);
    expect(session.profile()).toBe('RETAIL');
    expect(session.isAuthenticated()).toBe(true);
  });

  it('loginAs troca claims e persiste o token', () => {
    const session = TestBed.inject(AuthSessionService);
    session.loginAs('PRIVATE_BANKING');
    expect(session.journeyScopes()).toContain('PRIVATE_BANKING');
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBe(session.token());
  });

  it('logout executa todos os handlers mesmo se um falhar e limpa as chaves inv.*', () => {
    const failing = vi.fn(() => {
      throw new Error('falha');
    });
    const ok = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    TestBed.configureTestingModule({
      providers: [
        { provide: SESSION_CLEANUP_HANDLERS, multi: true, useValue: failing },
        { provide: SESSION_CLEANUP_HANDLERS, multi: true, useValue: ok },
      ],
    });
    const session = TestBed.inject(AuthSessionService);
    sessionStorage.setItem('inv.cache', 'segredo');
    sessionStorage.setItem('outra.chave', 'fica');
    session.logout('UNAUTHORIZED');

    expect(ok).toHaveBeenCalled();
    expect(session.isAuthenticated()).toBe(false);
    expect(session.terminationReason()).toBe('UNAUTHORIZED');
    expect(sessionStorage.getItem('inv.cache')).toBeNull();
    expect(sessionStorage.getItem('outra.chave')).toBe('fica');
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBe(SESSION_ENDED_MARKER);
  });

  it('restoreFromStorage restaura token válido e respeita marcador de encerramento', () => {
    const first = TestBed.inject(AuthSessionService);
    first.loginAs('PRIVATE_BANKING');
    const token = first.token();

    TestBed.resetTestingModule();
    sessionStorage.setItem(SESSION_STORAGE_KEY, token ?? '');
    const restored = TestBed.inject(AuthSessionService);
    restored.restoreFromStorage();
    expect(restored.profile()).toBe('PRIVATE_BANKING');

    sessionStorage.setItem(SESSION_STORAGE_KEY, SESSION_ENDED_MARKER);
    restored.restoreFromStorage();
    expect(restored.isAuthenticated()).toBe(false);
  });

  it('getValidToken retorna null para token expirado', () => {
    vi.useFakeTimers();
    try {
      const session = TestBed.inject(AuthSessionService);
      expect(session.getValidToken()).not.toBeNull();
      vi.advanceTimersByTime(16 * 60 * 1000);
      expect(session.getValidToken()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
