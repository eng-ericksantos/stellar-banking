/**
 * @file Contrato e validação de schema das mensagens `postMessage` entre Host (parceiro) e MFE.
 *
 * Por que validar o schema além da `origin`? A whitelist de origem garante *quem* enviou;
 * a validação de payload garante *o quê* foi enviado. Sem a segunda, um host legítimo porém
 * comprometido (ou um bug) poderia injetar dados inesperados em fluxos de negócio.
 */

/** @description Identificador do canal — evita colisão com outras libs que usam `postMessage`. */
export const BRIDGE_CHANNEL = 'invest-mfe' as const;

/** @description Versão do protocolo; mensagens de outra versão são rejeitadas. */
export const BRIDGE_VERSION = 1 as const;

/** @description Comandos aceitos do Host externo para o MFE (união discriminada por `type`). */
export type HostCommand =
  | { readonly type: 'HOST_PING'; readonly payload: { readonly nonce: string } }
  | { readonly type: 'HOST_SELECT_ASSET'; readonly payload: { readonly isin: string } }
  | { readonly type: 'HOST_SET_THEME'; readonly payload: { readonly theme: 'light' | 'dark' } };

/** @description Mensagens emitidas pelo MFE para o Host externo (união discriminada por `type`). */
export type MfeMessage =
  | { readonly type: 'MFE_READY'; readonly payload: { readonly version: typeof BRIDGE_VERSION } }
  | { readonly type: 'MFE_PONG'; readonly payload: { readonly nonce: string } }
  | { readonly type: 'MFE_ASSET_SELECTED'; readonly payload: { readonly isin: string } };

/** @description Envelope de transporte comum a todas as mensagens do canal. */
export interface BridgeEnvelope<TMessage extends { readonly type: string }> {
  readonly channel: typeof BRIDGE_CHANNEL;
  readonly version: typeof BRIDGE_VERSION;
  readonly type: TMessage['type'];
  readonly payload: unknown;
}

/** @description Resultado discriminado do parse de um comando recebido. */
export type ParseResult =
  | { readonly ok: true; readonly command: HostCommand }
  | { readonly ok: false; readonly reason: string };

/** @description Padrão estrutural de ISIN (ISO 6166): 2 letras + 9 alfanuméricos + 1 dígito. */
const ISIN_SHAPE = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

/** @description Limite defensivo do tamanho do nonce para evitar abuso de memória. */
const MAX_NONCE_LENGTH = 64;

/**
 * @description Type guard para objetos simples indexáveis por string.
 * @param value Valor desconhecido.
 * @returns `true` se for objeto não nulo e não array.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @description Valida estruturalmente um dado desconhecido e o converte em {@link HostCommand}.
 * @param data Valor recebido em `MessageEvent.data` (NUNCA confiável).
 * @returns `ok: true` com o comando tipado, ou `ok: false` com o motivo da rejeição.
 * @example
 * const parsed = parseHostCommand({ channel: 'invest-mfe', version: 1, type: 'HOST_PING', payload: { nonce: 'a1' } });
 */
export function parseHostCommand(data: unknown): ParseResult {
  if (!isRecord(data)) {
    return { ok: false, reason: 'Mensagem não é um objeto.' };
  }
  if (data['channel'] !== BRIDGE_CHANNEL) {
    return { ok: false, reason: 'Canal desconhecido.' };
  }
  if (data['version'] !== BRIDGE_VERSION) {
    return { ok: false, reason: 'Versão de protocolo não suportada.' };
  }
  const payload = data['payload'];
  if (!isRecord(payload)) {
    return { ok: false, reason: 'Payload ausente ou inválido.' };
  }
  switch (data['type']) {
    case 'HOST_PING': {
      const nonce = payload['nonce'];
      if (typeof nonce !== 'string' || nonce.length === 0 || nonce.length > MAX_NONCE_LENGTH) {
        return { ok: false, reason: 'Nonce inválido.' };
      }
      return { ok: true, command: { type: 'HOST_PING', payload: { nonce } } };
    }
    case 'HOST_SELECT_ASSET': {
      const isin = payload['isin'];
      if (typeof isin !== 'string' || !ISIN_SHAPE.test(isin)) {
        return { ok: false, reason: 'ISIN inválido.' };
      }
      return { ok: true, command: { type: 'HOST_SELECT_ASSET', payload: { isin } } };
    }
    case 'HOST_SET_THEME': {
      const theme = payload['theme'];
      if (theme !== 'light' && theme !== 'dark') {
        return { ok: false, reason: 'Tema inválido.' };
      }
      return { ok: true, command: { type: 'HOST_SET_THEME', payload: { theme } } };
    }
    default:
      return { ok: false, reason: 'Tipo de comando não permitido.' };
  }
}

/**
 * @description Cria o envelope de uma mensagem a ser enviada pelo MFE ao Host.
 * @param message Mensagem tipada do MFE.
 * @returns Envelope serializável por structured clone.
 * @example
 * const envelope = buildEnvelope({ type: 'MFE_READY', payload: { version: 1 } });
 */
export function buildEnvelope(message: MfeMessage): BridgeEnvelope<MfeMessage> {
  return { channel: BRIDGE_CHANNEL, version: BRIDGE_VERSION, type: message.type, payload: message.payload };
}

/**
 * @description Cria o envelope de um comando de Host (usado pelo painel de simulação/testes).
 * @param command Comando de host tipado.
 * @returns Envelope serializável.
 * @example
 * const envelope = buildHostEnvelope({ type: 'HOST_PING', payload: { nonce: 'x' } });
 */
export function buildHostEnvelope(command: HostCommand): BridgeEnvelope<HostCommand> {
  return { channel: BRIDGE_CHANNEL, version: BRIDGE_VERSION, type: command.type, payload: command.payload };
}
