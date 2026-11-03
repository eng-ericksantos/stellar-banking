import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { HOST_ALLOWED_ORIGINS, HostBridgeService } from './host-bridge.service';
import { buildHostEnvelope, parseHostCommand } from './host-bridge.schema';

describe('HostBridgeService', () => {
  const trusted = 'https://parceiro.exemplo.com.br';
  let bridge: HostBridgeService;

  /** Cria um evento mínimo; `source: window` representa o loopback/host legítimo. */
  function messageEvent(origin: string, data: unknown, source: unknown = window): MessageEvent {
    return { origin, data, source } as unknown as MessageEvent;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: HOST_ALLOWED_ORIGINS, useValue: [trusted, window.location.origin] }],
    });
    bridge = TestBed.inject(HostBridgeService);
  });

  it('aceita comando válido de origem da whitelist e o emite', async () => {
    const next = firstValueFrom(bridge.commands$);
    bridge.handleMessage(
      messageEvent(trusted, buildHostEnvelope({ type: 'HOST_SELECT_ASSET', payload: { isin: 'BRCDBBRA0016' } })),
    );
    expect(await next).toEqual({ type: 'HOST_SELECT_ASSET', payload: { isin: 'BRCDBBRA0016' } });
    expect(bridge.audit()[0]).toMatchObject({ direction: 'IN', accepted: true });
  });

  it('rejeita origem fora da whitelist (previne XSS/CSRF cross-window)', () => {
    const received = vi.fn();
    bridge.commands$.subscribe(received);
    bridge.handleMessage(
      messageEvent('https://site-malicioso.example', buildHostEnvelope({ type: 'HOST_PING', payload: { nonce: 'x' } })),
    );
    expect(received).not.toHaveBeenCalled();
    expect(bridge.audit()[0]).toMatchObject({ accepted: false, detail: 'Origem fora da whitelist.' });
  });

  it('não confunde origem com sufixo/prefixo parecido com a de um parceiro', () => {
    const received = vi.fn();
    bridge.commands$.subscribe(received);
    bridge.handleMessage(
      messageEvent(`${trusted}.evil.com`, buildHostEnvelope({ type: 'HOST_PING', payload: { nonce: 'x' } })),
    );
    expect(received).not.toHaveBeenCalled();
  });

  it('rejeita source desconhecido', () => {
    const received = vi.fn();
    bridge.commands$.subscribe(received);
    bridge.handleMessage(
      messageEvent(trusted, buildHostEnvelope({ type: 'HOST_PING', payload: { nonce: 'x' } }), {}),
    );
    expect(received).not.toHaveBeenCalled();
    expect(bridge.audit()[0]?.detail).toContain('Source');
  });

  it('rejeita payload com schema inválido (ISIN malformado)', () => {
    const received = vi.fn();
    bridge.commands$.subscribe(received);
    bridge.handleMessage(
      messageEvent(trusted, { channel: 'invest-mfe', version: 1, type: 'HOST_SELECT_ASSET', payload: { isin: '<script>' } }),
    );
    expect(received).not.toHaveBeenCalled();
    expect(bridge.audit()[0]).toMatchObject({ accepted: false, detail: 'ISIN inválido.' });
  });

  it('rejeita comandos não permitidos, como tentar alterar o perfil (escalada de privilégio)', () => {
    const result = parseHostCommand({
      channel: 'invest-mfe',
      version: 1,
      type: 'HOST_SET_PROFILE',
      payload: { profile: 'PRIVATE_BANKING' },
    });
    expect(result).toEqual({ ok: false, reason: 'Tipo de comando não permitido.' });
  });

  it('responde PONG ao PING usando targetOrigin explícito', () => {
    const spy = vi.spyOn(window, 'postMessage').mockImplementation(() => undefined);
    bridge.handleMessage(messageEvent(trusted, buildHostEnvelope({ type: 'HOST_PING', payload: { nonce: 'abc' } })));
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ type: 'MFE_PONG', payload: { nonce: 'abc' } }), window.location.origin);
    spy.mockRestore();
  });

  it('valida versão, canal e tema no schema', () => {
    expect(parseHostCommand(null).ok).toBe(false);
    expect(parseHostCommand({ channel: 'x' }).ok).toBe(false);
    expect(parseHostCommand({ channel: 'invest-mfe', version: 2, type: 'HOST_PING', payload: {} }).ok).toBe(false);
    expect(
      parseHostCommand({ channel: 'invest-mfe', version: 1, type: 'HOST_SET_THEME', payload: { theme: 'neon' } }).ok,
    ).toBe(false);
    expect(
      parseHostCommand({ channel: 'invest-mfe', version: 1, type: 'HOST_SET_THEME', payload: { theme: 'dark' } }).ok,
    ).toBe(true);
  });
});
