import { BreakpointObserver } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, Component, afterNextRender, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthSessionService, HasPermissionDirective, HostBridgeService } from '@invest/auth-security';
import { StatusChipComponent, ThemeService } from '@invest/ui-design-system';
import { map } from 'rxjs';
import { DebugDrawerComponent } from './features/debug-drawer.component';

/**
 * @description **Shell (App Host)** do portal: toolbar corporativa, sidenav, painel de simulação e a
 * `router-outlet` onde o MFE `mfe-renda-fixa` é carregado de forma *lazy*.
 *
 * Responsabilidades do shell: layout, tema, sessão e ponte segura com o Host externo. Nenhuma regra
 * de negócio de investimentos vive aqui.
 */
@Component({
  selector: 'app-root',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatSidenavModule,
    MatToolbarModule,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    HasPermissionDirective,
    StatusChipComponent,
    DebugDrawerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="skip-link" href="#conteudo">Pular para o conteúdo</a>

    <mat-toolbar class="toolbar" role="banner">
      <button mat-icon-button type="button" aria-label="Alternar menu de navegação" (click)="navOpened.set(!navOpened())">
        <mat-icon>menu</mat-icon>
      </button>
      <mat-icon class="brand__icon" aria-hidden="true">auto_awesome</mat-icon>
      <span class="brand">Stellar Banking <small>Investimentos</small></span>
      <span class="spacer"></span>

      @if (session.isAuthenticated()) {
        <inv-status-chip
          [label]="session.displayName() + ' · ' + profileLabel()"
          [tone]="session.profile() === 'PRIVATE_BANKING' ? 'accent' : 'info'"
          icon="account_circle"
        />
      }
      <button
        mat-icon-button
        type="button"
        [attr.aria-label]="theme.theme() === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'"
        (click)="theme.toggle()"
      >
        <mat-icon>{{ theme.theme() === 'dark' ? 'light_mode' : 'dark_mode' }}</mat-icon>
      </button>
      @if (session.isAuthenticated()) {
        <button mat-icon-button type="button" aria-label="Encerrar sessão" (click)="logout()">
          <mat-icon>logout</mat-icon>
        </button>
      }
    </mat-toolbar>

    <mat-sidenav-container class="container">
      <mat-sidenav
        class="sidenav"
        role="navigation"
        [mode]="isHandset() ? 'over' : 'side'"
        [opened]="navOpened()"
        (openedChange)="navOpened.set($event)"
      >
        <mat-nav-list>
          <a mat-list-item routerLink="/renda-fixa" routerLinkActive="active" (click)="closeOnHandset()">
            <mat-icon matListItemIcon aria-hidden="true">account_balance</mat-icon>
            <span matListItemTitle>Renda Fixa e Fundos</span>
          </a>
          <a mat-list-item routerLink="/login" routerLinkActive="active" (click)="closeOnHandset()">
            <mat-icon matListItemIcon aria-hidden="true">switch_account</mat-icon>
            <span matListItemTitle>Trocar de perfil</span>
          </a>
        </mat-nav-list>
        <p class="side-note" *hasPermission="'INVESTMENT_EXECUTE'; scope: 'PRIVATE_BANKING'">
          <mat-icon aria-hidden="true">workspace_premium</mat-icon>
          Mesa Private habilitada
        </p>
      </mat-sidenav>

      <mat-sidenav-content>
        <!-- O painel é uma ferramenta de apoio: @defer (on idle) tira Tabs/Expansion/Slide-toggle do bundle inicial. -->
        @defer (on idle) {
          <app-debug-drawer />
        } @placeholder {
          <div class="drawer-placeholder" aria-hidden="true"></div>
        }
        <main id="conteudo" class="content" tabindex="-1">
          <router-outlet />
        </main>
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100vh;
    }
    .skip-link {
      position: absolute;
      left: -999px;
      top: 0;
      z-index: 1000;
      padding: var(--inv-space-2) var(--inv-space-3);
      background: var(--inv-accent-solid);
      color: var(--inv-on-accent);
    }
    .skip-link:focus {
      left: 0;
    }
    .toolbar {
      flex: 0 0 auto;
      gap: var(--inv-space-2);
      background: var(--inv-toolbar-bg);
      color: var(--inv-toolbar-text);
      --mat-toolbar-container-background-color: var(--inv-toolbar-bg);
      --mat-toolbar-container-text-color: var(--inv-toolbar-text);
      border-bottom: 3px solid var(--inv-accent-solid);
    }
    .brand {
      font-weight: 500;
      letter-spacing: 0.02em;
    }
    .brand small {
      margin-left: var(--inv-space-2);
      color: var(--inv-gold-300);
      font-weight: 400;
    }
    .brand__icon {
      color: var(--inv-accent-solid);
    }
    .spacer {
      flex: 1 1 auto;
    }
    .container {
      flex: 1 1 auto;
      background: var(--inv-surface);
    }
    .sidenav {
      width: 260px;
      background: var(--inv-sidenav-bg);
      color: var(--inv-sidenav-text);
      --mat-sidenav-container-background-color: var(--inv-sidenav-bg);
      --mat-sidenav-container-text-color: var(--inv-sidenav-text);
      --mat-list-list-item-label-text-color: var(--inv-sidenav-text);
      --mat-list-list-item-leading-icon-color: var(--inv-gold-300);
    }
    .active {
      background: color-mix(in srgb, var(--inv-gold-500) 20%, transparent);
    }
    .side-note {
      display: flex;
      align-items: center;
      gap: var(--inv-space-2);
      margin: var(--inv-space-4);
      color: var(--inv-gold-300);
      font-size: 0.8125rem;
    }
    .drawer-placeholder {
      min-height: 48px;
    }
    .content {
      padding: var(--inv-space-5);
      max-width: 1400px;
      margin: 0 auto;
      outline: none;
    }
  `,
})
export class App {
  protected readonly session = inject(AuthSessionService);
  protected readonly theme = inject(ThemeService);
  private readonly bridge = inject(HostBridgeService);
  private readonly router = inject(Router);
  private readonly breakpoints = inject(BreakpointObserver);

  /** `true` em telas estreitas (sidenav vira "over"). */
  protected readonly isHandset = toSignal(
    this.breakpoints.observe('(max-width: 900px)').pipe(map((state) => state.matches)),
    { initialValue: false },
  );

  /** Estado de abertura do sidenav. */
  protected readonly navOpened = signal(true);

  /** Rótulo do perfil para o chip da toolbar. */
  protected readonly profileLabel = computed(() => (this.session.profile() === 'PRIVATE_BANKING' ? 'Private' : 'Varejo'));

  /**
   * @description Após a hidratação: restaura a sessão do storage (somente no browser, para não
   * divergir do HTML do servidor) e inicia a ponte `postMessage`. Também aplica comandos de tema do Host.
   */
  constructor() {
    afterNextRender(() => {
      this.session.restoreFromStorage();
      if (!this.session.isAuthenticated()) {
        void this.router.navigateByUrl('/login');
      }
      this.bridge.start();
    });
    this.bridge.commands$.pipe(takeUntilDestroyed()).subscribe((command) => {
      if (command.type === 'HOST_SET_THEME') {
        this.theme.set(command.payload.theme);
      }
    });
  }

  /**
   * @description Encerra a sessão a pedido do usuário e vai para o login.
   * @returns Promessa resolvida após a navegação.
   */
  protected async logout(): Promise<void> {
    this.session.logout('USER_REQUEST');
    await this.router.navigateByUrl('/login');
  }

  /**
   * @description Fecha o sidenav após navegar em telas estreitas.
   */
  protected closeOnHandset(): void {
    if (this.isHandset()) {
      this.navOpened.set(false);
    }
  }
}
