import { Injectable, signal } from '@angular/core';

/** @description Origem do evento no log de atividade HTTP. */
export type HttpLogSource = 'auth' | 'cache' | 'retry' | 'logout' | 'mock';

/** @description Severidade do evento. */
export type HttpLogLevel = 'info' | 'success' | 'warn' | 'error';

/** @description Entrada do log de atividade (exibida no painel de depuração). */
export interface HttpLogEntry {
  readonly id: number;
  readonly at: number;
  readonly source: HttpLogSource;
  readonly level: HttpLogLevel;
  readonly message: string;
}

const MAX_ENTRIES = 80;

/**
 * @description Log reativo das decisões tomadas pelos interceptors. Serve de "observabilidade
 * didática": o painel de simulação mostra, em tempo real, o backoff, o cache e o logout.
 */
@Injectable({ providedIn: 'root' })
export class HttpActivityLog {
  private sequence = 0;
  private readonly state = signal<readonly HttpLogEntry[]>([]);

  /** Entradas mais recentes primeiro. */
  readonly entries = this.state.asReadonly();

  /**
   * @description Registra um evento (mantendo apenas os mais recentes).
   * @param source Origem do evento.
   * @param level Severidade.
   * @param message Mensagem legível.
   * @example
   * log.add('retry', 'warn', 'Tentativa 1/3 em 640ms');
   */
  add(source: HttpLogSource, level: HttpLogLevel, message: string): void {
    const entry: HttpLogEntry = { id: ++this.sequence, at: Date.now(), source, level, message };
    this.state.update((current) => [entry, ...current].slice(0, MAX_ENTRIES));
  }

  /**
   * @description Limpa o log.
   * @example
   * log.clear();
   */
  clear(): void {
    this.state.set([]);
  }
}
