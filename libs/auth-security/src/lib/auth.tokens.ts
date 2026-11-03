import { InjectionToken } from '@angular/core';

/**
 * @description Callback executado no encerramento de sessão para limpar caches/estados sensíveis.
 * Padrão "plugin": cada lib (ex.: data-access) registra seu próprio handler via `multi`-provider,
 * sem que `auth-security` precise conhecer o Elf — mantém a dependência apontando numa só direção.
 */
export type SessionCleanupHandler = () => void;

/**
 * @description Token multi-provider com os handlers de limpeza de sessão.
 * @example
 * providers: [{ provide: SESSION_CLEANUP_HANDLERS, multi: true, useValue: () => store.reset() }]
 */
export const SESSION_CLEANUP_HANDLERS = new InjectionToken<readonly SessionCleanupHandler[]>(
  'SESSION_CLEANUP_HANDLERS',
);

/**
 * @description Rotas de redirecionamento usadas pelos guards.
 */
export interface AuthRoutesConfig {
  /** URL da tela de login (usuário sem sessão). */
  readonly login: string;
  /** URL da tela de acesso negado (sessão válida, mas sem permissão). */
  readonly forbidden: string;
}

/**
 * @description Token de configuração de rotas de autenticação, com padrões sensatos.
 */
export const AUTH_ROUTES = new InjectionToken<AuthRoutesConfig>('AUTH_ROUTES', {
  providedIn: 'root',
  factory: () => ({ login: '/login', forbidden: '/acesso-negado' }),
});

/**
 * @description Chave de armazenamento (sessionStorage) do token. Prefixo `inv.` permite
 * que o logout remova *todas* as chaves da aplicação de forma segura e auditável.
 */
export const SESSION_STORAGE_KEY = 'inv.session.token';

/** @description Valor sentinela gravado após logout para impedir auto-login na hidratação. */
export const SESSION_ENDED_MARKER = 'ENDED';
