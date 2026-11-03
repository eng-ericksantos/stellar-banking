import { Injectable } from '@angular/core';

/** @description Entrada do cache HTTP em memória. */
export interface HttpCacheEntry {
  readonly body: unknown;
  readonly status: number;
  readonly statusText: string;
  /** Instante de expiração (epoch ms). */
  readonly expiresAt: number;
}

/**
 * @description Cache HTTP em memória com TTL. Escopo `root`: no SSR, o injector raiz é criado
 * *por requisição renderizada*, portanto não há vazamento de dados entre clientes.
 */
@Injectable({ providedIn: 'root' })
export class HttpCacheStore {
  private readonly entries = new Map<string, HttpCacheEntry>();

  /** Quantidade de entradas armazenadas (útil em testes/diagnóstico). */
  get size(): number {
    return this.entries.size;
  }

  /**
   * @description Lê uma entrada ainda vigente; entradas expiradas são descartadas (lazy eviction).
   * @param key Chave (URL com query string).
   * @param nowMs Instante atual em ms.
   * @returns Entrada vigente ou `null`.
   * @example
   * const hit = store.get('/api/v1/rates', Date.now());
   */
  get(key: string, nowMs: number): HttpCacheEntry | null {
    const entry = this.entries.get(key);
    if (!entry) {
      return null;
    }
    if (entry.expiresAt <= nowMs) {
      this.entries.delete(key);
      return null;
    }
    return entry;
  }

  /**
   * @description Grava uma entrada.
   * @param key Chave (URL com query string).
   * @param entry Entrada a armazenar.
   * @example
   * store.set('/api/v1/rates', { body, status: 200, statusText: 'OK', expiresAt: Date.now() + 60_000 });
   */
  set(key: string, entry: HttpCacheEntry): void {
    this.entries.set(key, entry);
  }

  /**
   * @description Invalida todas as entradas cuja chave começa com o prefixo.
   * @param prefix Prefixo de URL (ex.: `/api/v1/rates`).
   * @returns Quantidade de entradas removidas.
   * @example
   * store.invalidate('/api/v1/rates');
   */
  invalidate(prefix: string): number {
    let removed = 0;
    for (const key of [...this.entries.keys()]) {
      if (key.startsWith(prefix)) {
        this.entries.delete(key);
        removed++;
      }
    }
    return removed;
  }

  /**
   * @description Remove todas as entradas (chamado no logout).
   * @example
   * store.clear();
   */
  clear(): void {
    this.entries.clear();
  }
}
