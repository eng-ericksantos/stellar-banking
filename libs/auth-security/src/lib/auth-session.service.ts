import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';
import { CustomerProfile, JourneyScope, JwtClaims, Permission, SessionTerminationReason } from './auth.models';
import {
  SESSION_CLEANUP_HANDLERS,
  SESSION_ENDED_MARKER,
  SESSION_STORAGE_KEY,
  SessionCleanupHandler,
} from './auth.tokens';
import { InvalidTokenError, buildDemoClaims, createDemoJwt, decodeJwt, isExpired } from './jwt';

/**
 * @description Fonte única da verdade sobre a sessão do cliente (token JWT + claims derivadas).
 *
 * Decisões arquitetônicas:
 * - O estado é um `signal` — qualquer template/`computed` que leia `claims()` é reavaliado
 *   automaticamente quando o perfil muda, sem `async` pipe nem `markForCheck()` (compatível com OnPush).
 * - No servidor (SSR) a sessão nasce com um token demo RETAIL; no browser o estado persistido só é
 *   restaurado em {@link AuthSessionService.restoreFromStorage}, chamado *após* a hidratação, para que
 *   o primeiro render do cliente seja idêntico ao do servidor (evita flickering/mismatch NG0500).
 */
@Injectable({ providedIn: 'root' })
export class AuthSessionService {
  private readonly document = inject(DOCUMENT);
  private readonly cleanupHandlers: readonly SessionCleanupHandler[] =
    inject(SESSION_CLEANUP_HANDLERS, { optional: true }) ?? [];

  private readonly _token = signal<string | null>(this.createToken('RETAIL'));
  private readonly _terminationReason = signal<SessionTerminationReason | null>(null);

  /** Token JWT corrente (somente leitura). */
  readonly token = this._token.asReadonly();

  /** Último motivo de encerramento de sessão (ou `null` se a sessão está ativa). */
  readonly terminationReason = this._terminationReason.asReadonly();

  /** Claims decodificadas do token; `null` se ausente ou malformado. */
  readonly claims = computed<JwtClaims | null>(() => {
    const token = this._token();
    if (!token) {
      return null;
    }
    try {
      return decodeJwt(token);
    } catch (error) {
      if (error instanceof InvalidTokenError) {
        return null;
      }
      throw error;
    }
  });

  /** Indica se existe sessão com claims válidas. */
  readonly isAuthenticated = computed(() => this.claims() !== null);

  /** Perfil comercial corrente. */
  readonly profile = computed<CustomerProfile | null>(() => this.claims()?.profile ?? null);

  /** Permissões concedidas ao cliente. */
  readonly permissions = computed<readonly Permission[]>(() => this.claims()?.permissions ?? []);

  /** Escopos de jornada concedidos ao cliente. */
  readonly journeyScopes = computed<readonly JourneyScope[]>(() => this.claims()?.journeyScopes ?? []);

  /** Nome de exibição do cliente. */
  readonly displayName = computed(() => this.claims()?.name ?? 'Visitante');

  /**
   * @description Retorna o token apenas se ainda estiver dentro da validade.
   * @returns JWT válido ou `null`.
   * @example
   * const token = session.getValidToken();
   */
  getValidToken(): string | null {
    const token = this._token();
    const claims = this.claims();
    if (!token || !claims || isExpired(claims, Date.now())) {
      return null;
    }
    return token;
  }

  /**
   * @description Realiza o "login" de demonstração com um perfil (emite um JWT local).
   * @param profile Perfil comercial desejado.
   * @example
   * session.loginAs('PRIVATE_BANKING');
   */
  loginAs(profile: CustomerProfile): void {
    const token = this.createToken(profile);
    this._terminationReason.set(null);
    this._token.set(token);
    this.writeStorage(token);
  }

  /**
   * @description Restaura a sessão persistida (somente browser). Deve ser chamado após a hidratação.
   * @example
   * afterNextRender(() => session.restoreFromStorage());
   */
  restoreFromStorage(): void {
    const stored = this.readStorage();
    if (stored === null) {
      return;
    }
    if (stored === SESSION_ENDED_MARKER) {
      this.logout('USER_REQUEST');
      return;
    }
    try {
      const claims = decodeJwt(stored);
      if (!isExpired(claims, Date.now())) {
        this._terminationReason.set(null);
        this._token.set(stored);
      }
    } catch {
      this.removeStorage();
    }
  }

  /**
   * @description Encerra a sessão com segurança: zera o token, executa todos os handlers de limpeza
   * (ex.: reset do Elf) e remove chaves do storage. Falha em um handler NÃO impede os demais —
   * uma limpeza parcial seria um vazamento de dados entre sessões.
   * @param reason Motivo do encerramento (exibido no modal global).
   * @example
   * session.logout('UNAUTHORIZED');
   */
  logout(reason: SessionTerminationReason): void {
    this._token.set(null);
    this._terminationReason.set(reason);
    for (const handler of this.cleanupHandlers) {
      try {
        handler();
      } catch (error) {
        console.error('[auth-security] Falha em handler de limpeza de sessão', error);
      }
    }
    this.removeStorage();
    this.writeStorage(SESSION_ENDED_MARKER);
  }

  /**
   * @description Cria um token demo para o perfil.
   * @param profile Perfil comercial.
   * @returns JWT demo.
   */
  private createToken(profile: CustomerProfile): string {
    return createDemoJwt(buildDemoClaims(profile, Date.now()));
  }

  /**
   * @description Acesso seguro ao `sessionStorage` (inexistente no servidor e bloqueável no browser).
   * @returns Storage ou `null`.
   */
  private storage(): Storage | null {
    try {
      return this.document.defaultView?.sessionStorage ?? null;
    } catch {
      return null;
    }
  }

  /**
   * @description Lê o valor persistido.
   * @returns Valor gravado ou `null`.
   */
  private readStorage(): string | null {
    return this.storage()?.getItem(SESSION_STORAGE_KEY) ?? null;
  }

  /**
   * @description Persiste um valor de sessão.
   * @param value Token ou marcador de encerramento.
   */
  private writeStorage(value: string): void {
    this.storage()?.setItem(SESSION_STORAGE_KEY, value);
  }

  /**
   * @description Remove todas as chaves da aplicação (prefixo `inv.`) do storage.
   */
  private removeStorage(): void {
    const storage = this.storage();
    if (!storage) {
      return;
    }
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (key?.startsWith('inv.')) {
        keys.push(key);
      }
    }
    keys.forEach((key) => storage.removeItem(key));
  }
}
