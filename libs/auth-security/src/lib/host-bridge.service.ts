import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, InjectionToken, inject, signal } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import {
  BRIDGE_VERSION,
  HostCommand,
  MfeMessage,
  buildEnvelope,
  buildHostEnvelope,
  parseHostCommand,
} from './host-bridge.schema';

/**
 * @description Whitelist ESTRITA de origens (`scheme://host:port`) autorizadas a enviar comandos ao MFE.
 * Por padrão contém apenas a própria origem (modo loopback/demonstração); em produção deve listar
 * os domínios dos parceiros que embarcam o MFE em `<iframe>`.
 * Comparação é feita por igualdade exata — nunca por `startsWith`/`includes`, que permitiriam
 * `https://parceiro.com.evil.com`.
 */
export const HOST_ALLOWED_ORIGINS = new InjectionToken<readonly string[]>('HOST_ALLOWED_ORIGINS', {
  providedIn: 'root',
  factory: () => {
    const origin = inject(DOCUMENT).defaultView?.location?.origin;
    return origin && origin !== 'null' ? [origin] : [];
  },
});

/** @description Entrada do log de auditoria da ponte (exibido no painel de depuração). */
export interface BridgeAuditEntry {
  /** Instante do evento (epoch ms). */
  readonly at: number;
  /** Direção: `IN` (host → MFE) ou `OUT` (MFE → host). */
  readonly direction: 'IN' | 'OUT';
  /** Origem declarada pelo navegador (`event.origin`) ou destino alvo. */
  readonly origin: string;
  /** Tipo da mensagem, quando identificável. */
  readonly type: string;
  /** Se a mensagem foi aceita (IN) ou enviada (OUT). */
  readonly accepted: boolean;
  /** Detalhe legível (motivo de rejeição, nonce etc.). */
  readonly detail: string;
}

const MAX_AUDIT_ENTRIES = 40;

/**
 * @description Ponte segura Host ↔ MFE baseada em `window.postMessage`.
 *
 * Defesas implementadas (por que cada uma existe):
 * 1. **Whitelist de `event.origin`** — impede que qualquer página aberta no navegador (ou iframe
 *    malicioso) comande o MFE: mitigação de XSS/CSRF "cross-window".
 * 2. **Validação de `event.source`** — só aceitamos mensagens vindas do `window.parent` (host) ou do
 *    próprio window (loopback de demonstração).
 * 3. **Validação de schema** — o payload é tratado como `unknown` até provar o formato esperado.
 * 4. **`targetOrigin` explícito no envio** — nunca `'*'`, para que dados não vazem a outro destino
 *    caso o iframe seja navegado para um domínio inesperado.
 * 5. **Comandos mínimos** — o host NÃO pode alterar perfil/permissões (escalada de privilégio).
 */
@Injectable({ providedIn: 'root' })
export class HostBridgeService {
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly allowedOrigins = inject(HOST_ALLOWED_ORIGINS);
  private readonly commandsSubject = new Subject<HostCommand>();
  private readonly _audit = signal<readonly BridgeAuditEntry[]>([]);
  private listener: ((event: MessageEvent) => void) | null = null;

  /** Fluxo de comandos validados vindos do Host. */
  readonly commands$: Observable<HostCommand> = this.commandsSubject.asObservable();

  /** Log de auditoria reativo (últimas mensagens aceitas/rejeitadas). */
  readonly audit = this._audit.asReadonly();

  /**
   * @description Inicia a escuta de mensagens (idempotente; no-op no servidor) e anuncia `MFE_READY`.
   * @example
   * inject(HostBridgeService).start();
   */
  start(): void {
    const win = this.document.defaultView;
    if (!win || this.listener) {
      return;
    }
    this.listener = (event: MessageEvent) => this.handleMessage(event);
    win.addEventListener('message', this.listener);
    this.destroyRef.onDestroy(() => this.stop());
    this.postToHost({ type: 'MFE_READY', payload: { version: BRIDGE_VERSION } });
  }

  /**
   * @description Remove o listener registrado.
   * @example
   * bridge.stop();
   */
  stop(): void {
    const win = this.document.defaultView;
    if (win && this.listener) {
      win.removeEventListener('message', this.listener);
    }
    this.listener = null;
  }

  /**
   * @description Processa um `MessageEvent` aplicando as defesas descritas na classe.
   * @param event Evento recebido pelo `window`.
   * @example
   * bridge.handleMessage(new MessageEvent('message', { origin: 'https://x', data: {} }));
   */
  handleMessage(event: MessageEvent): void {
    const win = this.document.defaultView;
    if (!win) {
      return;
    }
    // Ecos de mensagens que o próprio MFE enviou (modo loopback) não são comandos.
    if (this.isOwnOutboundEcho(event.data)) {
      return;
    }
    if (!this.allowedOrigins.includes(event.origin)) {
      this.log('IN', event.origin, this.typeOf(event.data), false, 'Origem fora da whitelist.');
      return;
    }
    if (event.source !== win.parent && event.source !== win) {
      this.log('IN', event.origin, this.typeOf(event.data), false, 'Source não é o host nem o próprio window.');
      return;
    }
    const parsed = parseHostCommand(event.data);
    if (!parsed.ok) {
      this.log('IN', event.origin, this.typeOf(event.data), false, parsed.reason);
      return;
    }
    this.log('IN', event.origin, parsed.command.type, true, this.describe(parsed.command));
    this.commandsSubject.next(parsed.command);
    if (parsed.command.type === 'HOST_PING') {
      this.postToHost({ type: 'MFE_PONG', payload: { nonce: parsed.command.payload.nonce } });
    }
  }

  /**
   * @description Envia uma mensagem do MFE para o Host com `targetOrigin` explícito.
   * @param message Mensagem tipada do MFE.
   * @returns `true` se enviada; `false` se não houver destino confiável.
   * @example
   * bridge.postToHost({ type: 'MFE_ASSET_SELECTED', payload: { isin: 'BRABCDE12347' } });
   */
  postToHost(message: MfeMessage): boolean {
    const win = this.document.defaultView;
    if (!win) {
      return false;
    }
    const embedded = win.parent !== win;
    const targetOrigin = embedded ? this.referrerOrigin() : win.location.origin;
    if (!targetOrigin || !this.allowedOrigins.includes(targetOrigin)) {
      this.log('OUT', targetOrigin ?? 'desconhecido', message.type, false, 'Sem destino confiável.');
      return false;
    }
    (embedded ? win.parent : win).postMessage(buildEnvelope(message), targetOrigin);
    this.log('OUT', targetOrigin, message.type, true, this.describe(message));
    return true;
  }

  /**
   * @description (Demonstração) Simula um Host externo legítimo enviando um comando ao MFE.
   * @param command Comando a enviar.
   * @example
   * bridge.simulateExternalHost({ type: 'HOST_PING', payload: { nonce: 'demo' } });
   */
  simulateExternalHost(command: HostCommand): void {
    const win = this.document.defaultView;
    win?.postMessage(buildHostEnvelope(command), win.location.origin);
  }

  /**
   * @description (Demonstração) Simula um site malicioso: despacha um evento com `origin` forjada,
   * que DEVE ser rejeitado pela whitelist.
   * @param command Comando que o atacante tentaria executar.
   * @param forgedOrigin Origem forjada (padrão `https://site-malicioso.example`).
   * @example
   * bridge.simulateUntrustedHost({ type: 'HOST_SELECT_ASSET', payload: { isin: 'BRABCDE12347' } });
   */
  simulateUntrustedHost(command: HostCommand, forgedOrigin = 'https://site-malicioso.example'): void {
    const win = this.document.defaultView;
    if (!win) {
      return;
    }
    win.dispatchEvent(
      new MessageEvent('message', { data: buildHostEnvelope(command), origin: forgedOrigin, source: win }),
    );
  }

  /**
   * @description Limpa o log de auditoria.
   * @example
   * bridge.clearAudit();
   */
  clearAudit(): void {
    this._audit.set([]);
  }

  /**
   * @description Determina a origem do documento que embarcou o MFE a partir de `document.referrer`.
   * @returns Origem (`scheme://host:port`) ou `null` se indisponível.
   */
  private referrerOrigin(): string | null {
    try {
      return this.document.referrer ? new URL(this.document.referrer).origin : null;
    } catch {
      return null;
    }
  }

  /**
   * @description Detecta mensagens `MFE_*` ecoadas no loopback.
   * @param data Dados do evento.
   * @returns `true` se for eco de saída.
   */
  private isOwnOutboundEcho(data: unknown): boolean {
    const type = this.typeOf(data);
    return type.startsWith('MFE_');
  }

  /**
   * @description Extrai `type` de forma segura de dados não confiáveis.
   * @param data Dados do evento.
   * @returns Tipo ou `'desconhecido'`.
   */
  private typeOf(data: unknown): string {
    if (typeof data === 'object' && data !== null && 'type' in data) {
      const type = (data as { type: unknown }).type;
      return typeof type === 'string' ? type.slice(0, 40) : 'desconhecido';
    }
    return 'desconhecido';
  }

  /**
   * @description Produz um detalhe curto para o log.
   * @param message Comando ou mensagem.
   * @returns Texto descritivo.
   */
  private describe(message: HostCommand | MfeMessage): string {
    return JSON.stringify(message.payload);
  }

  /**
   * @description Acrescenta uma entrada ao log mantendo o tamanho limitado (proteção de memória).
   * @param direction Direção da mensagem.
   * @param origin Origem/destino.
   * @param type Tipo da mensagem.
   * @param accepted Resultado.
   * @param detail Detalhe legível.
   */
  private log(
    direction: BridgeAuditEntry['direction'],
    origin: string,
    type: string,
    accepted: boolean,
    detail: string,
  ): void {
    const entry: BridgeAuditEntry = { at: Date.now(), direction, origin, type, accepted, detail };
    this._audit.update((current) => [entry, ...current].slice(0, MAX_AUDIT_ENTRIES));
  }
}
