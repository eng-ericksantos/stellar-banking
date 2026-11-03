import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTabsModule } from '@angular/material/tabs';
import {
  AuthSessionService,
  BridgeAuditEntry,
  CustomerProfile,
  FEATURE_FLAGS,
  FeatureFlag,
  FeatureFlagsService,
  HostBridgeService,
  PERMISSION_LABEL,
  SCOPE_LABEL,
} from '@invest/auth-security';
import { InvestmentApi, InvestmentFacade, describeError } from '@invest/data-access-investments';
import { HTTP_FEEDBACK, HttpActivityLog, HttpLogSource, MockControlService } from '@invest/http-core';
import { StatusChipComponent, ThemeService } from '@invest/ui-design-system';

/** @description Rótulos amigáveis das feature flags. */
const FLAG_LABEL: Readonly<Record<FeatureFlag, string>> = {
  COMPARATIVE_SIMULATOR: 'Simulador comparativo (CDB × LCI/LCA)',
  MULTIMARKET_FUNDS: 'Fundos multimercado',
  ORDER_EXECUTION: 'Execução de ordens (botão "Investir Agora")',
};

/** @description Rótulos amigáveis da origem dos eventos do log HTTP. */
const SOURCE_LABEL: Readonly<Record<HttpLogSource, string>> = {
  auth: 'Autenticação',
  cache: 'Cache',
  retry: 'Nova tentativa',
  logout: 'Sessão',
  mock: 'API simulada',
};

/** @description Rótulos amigáveis dos tipos de mensagem da ponte postMessage. */
const BRIDGE_TYPE_LABEL: Readonly<Record<string, string>> = {
  HOST_PING: 'Ping do host',
  HOST_SELECT_ASSET: 'Selecionar ativo',
  HOST_SET_THEME: 'Alterar tema',
  MFE_READY: 'MFE pronto',
  MFE_PONG: 'Resposta ao ping',
  MFE_ASSET_SELECTED: 'Ativo selecionado',
};

/**
 * @description **Painel de simulação de cenários** (DevTools/Debug Drawer). Permite, ao vivo:
 * 1. alternar perfil de ACL / jornada (Varejo × Private Banking) e Feature Flags;
 * 2. disparar falha `503` e observar o `retryInterceptor` com Exponential Backoff nos logs;
 * 3. disparar `401` para acionar o `globalLogoutInterceptor`;
 * 4. testar a ponte segura `postMessage` (Host → MFE), inclusive uma origem maliciosa que deve ser bloqueada.
 *
 * Os códigos internos (`FIXED_INCOME_READ`, `PRIVATE_BANKING`, `HOST_PING`…) nunca aparecem na tela:
 * são traduzidos por mapas de rótulos tipados.
 */
@Component({
  selector: 'app-debug-drawer',
  imports: [
    DatePipe,
    MatButtonModule,
    MatButtonToggleModule,
    MatExpansionModule,
    MatIconModule,
    MatSlideToggleModule,
    MatTabsModule,
    StatusChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-accordion class="drawer">
      <mat-expansion-panel [expanded]="true">
        <mat-expansion-panel-header>
          <mat-panel-title>
            <mat-icon aria-hidden="true">science</mat-icon>
            &nbsp;Painel de simulação de cenários
          </mat-panel-title>
          <mat-panel-description>
            Teste perfis, funcionalidades, falhas de rede e integração com o parceiro
          </mat-panel-description>
        </mat-expansion-panel-header>

        <mat-tab-group animationDuration="0ms" dynamicHeight>
          <mat-tab label="Perfil e funcionalidades">
            <div class="tab">
              <div class="block">
                <h3>Perfil do cliente</h3>
                <p class="muted">Define o que o cliente pode ver e fazer (permissões e jornada).</p>
                <mat-button-toggle-group
                  aria-label="Perfil do cliente"
                  [value]="session.profile()"
                  (change)="onProfile($event.value)"
                >
                  <mat-button-toggle value="RETAIL">Varejo</mat-button-toggle>
                  <mat-button-toggle value="PRIVATE_BANKING">Private Banking</mat-button-toggle>
                </mat-button-toggle-group>
                @if (session.claims(); as claims) {
                  <p class="caption">Jornadas liberadas</p>
                  <div class="chips">
                    @for (scope of claims.journeyScopes; track scope) {
                      <inv-status-chip [label]="scopeLabel(scope)" tone="accent" icon="workspace_premium" />
                    }
                  </div>
                  <p class="caption">O que este perfil pode fazer</p>
                  <div class="chips">
                    @for (permission of claims.permissions; track permission) {
                      <inv-status-chip [label]="permissionLabel(permission)" tone="info" icon="check_circle" />
                    }
                  </div>
                  <p class="muted">
                    Sessão de {{ claims.name }} válida até {{ claims.exp * 1000 | date: 'HH:mm' }}
                  </p>
                } @else {
                  <p class="muted">Nenhuma sessão ativa.</p>
                }
              </div>
              <div class="block">
                <h3>Funcionalidades</h3>
                <p class="muted">Ligue ou desligue recursos em tempo real, sem recarregar a página.</p>
                @for (flag of flagNames; track flag) {
                  <div>
                    <mat-slide-toggle [checked]="flags.flags()[flag]" (change)="flags.set(flag, $event.checked)">
                      {{ flagLabel(flag) }}
                    </mat-slide-toggle>
                  </div>
                }
              </div>
            </div>
          </mat-tab>

          <mat-tab label="Falhas de rede">
            <div class="tab">
              <div class="block">
                <h3>Instabilidade do serviço (503)</h3>
                <p class="muted">
                  O sistema tenta novamente sozinho, esperando um pouco mais a cada tentativa (backoff exponencial).
                </p>
                <div class="buttons">
                  <button mat-stroked-button type="button" (click)="trigger503(false)">
                    <mat-icon>cloud_sync</mat-icon>
                    Falha temporária (se recupera)
                  </button>
                  <button mat-stroked-button type="button" (click)="trigger503(true)">
                    <mat-icon>cloud_off</mat-icon>
                    Falha persistente (esgota as tentativas)
                  </button>
                </div>
                @if (mock.armed(); as armed) {
                  <p class="muted">Falha preparada: {{ armed.label }} · restam {{ armed.remaining }}.</p>
                }
              </div>
              <div class="block">
                <h3>Sessão e permissões</h3>
                <p class="muted">Veja como o portal reage a uma sessão inválida e a uma jornada não liberada.</p>
                <div class="buttons">
                  <button mat-stroked-button type="button" (click)="trigger401()">
                    <mat-icon>lock_clock</mat-icon>
                    Expirar sessão (401)
                  </button>
                  <button mat-stroked-button type="button" (click)="tryFunds()">
                    <mat-icon>shield</mat-icon>
                    Acessar fundos (exige Private Banking)
                  </button>
                </div>
              </div>
            </div>
          </mat-tab>

          <mat-tab label="Integração com parceiro">
            <div class="tab">
              <div class="block">
                <h3>Mensagens do site parceiro (postMessage)</h3>
                <p class="muted">
                  Simula o portal do parceiro enviando comandos ao MFE embarcado. Só origens autorizadas são aceitas.
                </p>
                <div class="buttons">
                  <button mat-stroked-button type="button" (click)="hostPing()">
                    <mat-icon>wifi_tethering</mat-icon>
                    Testar conexão
                  </button>
                  <button mat-stroked-button type="button" (click)="hostSelectAsset()">
                    <mat-icon>ads_click</mat-icon>
                    Selecionar o 1º ativo
                  </button>
                  <button mat-stroked-button type="button" (click)="hostToggleTheme()">
                    <mat-icon>contrast</mat-icon>
                    Alternar tema
                  </button>
                  <button mat-stroked-button type="button" (click)="untrustedHost()">
                    <mat-icon>dangerous</mat-icon>
                    Simular site malicioso (deve ser bloqueado)
                  </button>
                </div>
              </div>
              <div class="block log" role="log" aria-label="Mensagens trocadas com o parceiro">
                @for (entry of bridge.audit(); track entry.at + entry.type + $index) {
                  <div class="log__row log__row--bridge" [class.rejected]="!entry.accepted">
                    <span>{{ entry.at | date: 'HH:mm:ss' }}</span>
                    <strong>{{ directionLabel(entry) }}</strong>
                    <span>{{ typeLabel(entry.type) }}</span>
                    <span>{{ entry.accepted ? 'Aceita' : 'Bloqueada' }}: {{ entryDetail(entry) }}</span>
                  </div>
                } @empty {
                  <p class="muted">Nenhuma mensagem trocada ainda. Use os botões acima.</p>
                }
              </div>
            </div>
          </mat-tab>

          <mat-tab label="Registro de eventos">
            <div class="tab">
              <div class="block log" role="log" aria-label="Registro de atividade de rede">
                @for (entry of activity.entries(); track entry.id) {
                  <div class="log__row" [class.rejected]="entry.level === 'error'" [class.warn]="entry.level === 'warn'">
                    <span>{{ entry.at | date: 'HH:mm:ss.SSS' }}</span>
                    <strong>{{ sourceLabel(entry.source) }}</strong>
                    <span>{{ entry.message }}</span>
                  </div>
                } @empty {
                  <p class="muted">Sem atividade de rede registrada.</p>
                }
              </div>
              <div class="buttons">
                <button mat-button type="button" (click)="activity.clear(); bridge.clearAudit()">Limpar registros</button>
              </div>
            </div>
          </mat-tab>
        </mat-tab-group>
      </mat-expansion-panel>
    </mat-accordion>
  `,
  styles: `
    :host {
      display: block;
    }
    .drawer {
      display: block;
    }
    .tab {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: var(--inv-space-5);
      padding: var(--inv-space-4) var(--inv-space-2);
    }
    h3 {
      margin: 0 0 var(--inv-space-1);
      font-size: 0.9375rem;
      font-weight: 500;
    }
    .muted {
      color: var(--inv-text-muted);
      font-size: 0.8125rem;
      margin: 0 0 var(--inv-space-2);
    }
    .caption {
      margin: var(--inv-space-3) 0 var(--inv-space-1);
      font-size: 0.75rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--inv-text-muted);
    }
    .chips,
    .buttons {
      display: flex;
      flex-wrap: wrap;
      gap: var(--inv-space-2);
      margin-top: var(--inv-space-2);
    }
    .log {
      max-height: 220px;
      overflow: auto;
      font-size: 0.8125rem;
      grid-column: 1 / -1;
    }
    .log__row {
      display: grid;
      grid-template-columns: 96px 130px 1fr;
      gap: var(--inv-space-2);
      padding: 3px 0;
      border-bottom: 1px dotted var(--inv-border);
    }
    .log__row--bridge {
      grid-template-columns: 70px 120px 150px 1fr;
    }
    .log__row.rejected {
      color: var(--inv-negative);
    }
    .log__row.warn {
      color: var(--inv-warning);
    }
  `,
})
export class DebugDrawerComponent {
  protected readonly session = inject(AuthSessionService);
  protected readonly flags = inject(FeatureFlagsService);
  protected readonly mock = inject(MockControlService);
  protected readonly activity = inject(HttpActivityLog);
  protected readonly bridge = inject(HostBridgeService);
  private readonly facade = inject(InvestmentFacade);
  private readonly api = inject(InvestmentApi);
  private readonly feedback = inject(HTTP_FEEDBACK);
  private readonly theme = inject(ThemeService);

  /** Nomes das flags (para o `@for`). */
  protected readonly flagNames = FEATURE_FLAGS;

  /** Primeiro ISIN do catálogo, usado pelos comandos de host. */
  private readonly firstIsin = computed(() => this.facade.assets()[0]?.isin ?? null);

  /**
   * @description Rótulo amigável de uma flag.
   * @param flag Flag.
   * @returns Texto.
   */
  protected flagLabel(flag: FeatureFlag): string {
    return FLAG_LABEL[flag];
  }

  /**
   * @description Rótulo amigável de uma permissão.
   * @param permission Código da permissão.
   * @returns Texto como `Consultar renda fixa`.
   */
  protected permissionLabel(permission: keyof typeof PERMISSION_LABEL): string {
    return PERMISSION_LABEL[permission];
  }

  /**
   * @description Rótulo amigável de uma jornada.
   * @param scope Código da jornada.
   * @returns Texto como `Jornada Private Banking`.
   */
  protected scopeLabel(scope: keyof typeof SCOPE_LABEL): string {
    return `Jornada ${SCOPE_LABEL[scope]}`;
  }

  /**
   * @description Rótulo amigável da origem de um evento de rede.
   * @param source Origem.
   * @returns Texto.
   */
  protected sourceLabel(source: HttpLogSource): string {
    return SOURCE_LABEL[source];
  }

  /**
   * @description Rótulo amigável do tipo de mensagem postMessage.
   * @param type Tipo bruto da mensagem.
   * @returns Texto traduzido ou `Mensagem desconhecida`.
   */
  protected typeLabel(type: string): string {
    return BRIDGE_TYPE_LABEL[type] ?? 'Mensagem desconhecida';
  }

  /**
   * @description Direção da mensagem em linguagem natural.
   * @param entry Entrada de auditoria.
   * @returns `Parceiro → MFE` ou `MFE → Parceiro`.
   */
  protected directionLabel(entry: BridgeAuditEntry): string {
    return entry.direction === 'IN' ? 'Parceiro → MFE' : 'MFE → Parceiro';
  }

  /**
   * @description Detalhe da mensagem: o motivo de bloqueio ou a origem de uma mensagem aceita.
   * @param entry Entrada de auditoria.
   * @returns Texto curto.
   */
  protected entryDetail(entry: BridgeAuditEntry): string {
    return entry.accepted ? `origem ${entry.origin}` : `${entry.detail} (origem ${entry.origin})`;
  }

  /**
   * @description Troca o perfil do cliente (emite novo JWT).
   * @param profile Perfil escolhido.
   */
  protected onProfile(profile: CustomerProfile): void {
    this.session.loginAs(profile);
  }

  /**
   * @description Arma uma falha 503 e recarrega os dados para disparar o retry.
   * @param persistent `true` para esgotar todas as tentativas.
   * @returns Promessa resolvida ao final do carregamento.
   */
  protected trigger503(persistent: boolean): Promise<void> {
    if (persistent) {
      this.mock.armPersistent503();
    } else {
      this.mock.armTransient503();
    }
    return this.facade.refresh();
  }

  /**
   * @description Arma um 401 e recarrega os dados — o logout global deve ser acionado.
   * @returns Promessa resolvida ao final do carregamento.
   */
  protected trigger401(): Promise<void> {
    this.mock.armUnauthorized();
    return this.facade.refresh();
  }

  /**
   * @description Tenta acessar o endpoint de fundos (exige escopo PRIVATE_BANKING).
   */
  protected tryFunds(): void {
    this.api.getFunds().subscribe({
      next: ({ assets }) => this.feedback.info(`Fundos carregados: ${assets.length} ativo(s).`),
      error: (error: unknown) => this.activity.add('auth', 'warn', `Fundos indisponíveis: ${describeError(error)}`),
    });
  }

  /**
   * @description Simula um PING legítimo vindo do Host.
   */
  protected hostPing(): void {
    this.bridge.simulateExternalHost({ type: 'HOST_PING', payload: { nonce: `ping-${Date.now()}` } });
  }

  /**
   * @description Simula o Host pedindo a seleção do primeiro ativo.
   */
  protected hostSelectAsset(): void {
    const isin = this.firstIsin();
    if (isin) {
      this.bridge.simulateExternalHost({ type: 'HOST_SELECT_ASSET', payload: { isin } });
    }
  }

  /**
   * @description Simula o Host alternando o tema.
   */
  protected hostToggleTheme(): void {
    const next = this.theme.theme() === 'dark' ? 'light' : 'dark';
    this.bridge.simulateExternalHost({ type: 'HOST_SET_THEME', payload: { theme: next } });
  }

  /**
   * @description Simula um site malicioso com `origin` forjada — a whitelist deve rejeitar.
   */
  protected untrustedHost(): void {
    this.bridge.simulateUntrustedHost({
      type: 'HOST_SELECT_ASSET',
      payload: { isin: this.firstIsin() ?? 'BRCDBBRA0016' },
    });
  }
}
