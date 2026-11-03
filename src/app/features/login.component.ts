import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { AuthSessionService, CustomerProfile } from '@invest/auth-security';

/**
 * @description Tela de entrada (demonstração): emite um JWT local para o perfil escolhido.
 * Em produção, o login redirecionaria ao Identity Provider (OIDC/PKCE) e o token viria assinado.
 */
@Component({
  selector: 'app-login',
  imports: [MatButtonModule, MatCardModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="login" aria-labelledby="login-title">
      <h1 id="login-title">Entrar na plataforma</h1>
      <p class="muted">Escolha um perfil de demonstração. A sessão é criada localmente, sem rede.</p>
      <div class="profiles">
        @for (profile of profiles; track profile.id) {
          <mat-card appearance="outlined" class="profile">
            <mat-card-header>
              <mat-icon mat-card-avatar aria-hidden="true">{{ profile.icon }}</mat-icon>
              <mat-card-title>{{ profile.title }}</mat-card-title>
              <mat-card-subtitle>Jornada {{ profile.title }}</mat-card-subtitle>
            </mat-card-header>
            <mat-card-content>
              <p>{{ profile.description }}</p>
            </mat-card-content>
            <mat-card-actions>
              <button mat-flat-button type="button" (click)="enter(profile.id)">Entrar como {{ profile.title }}</button>
            </mat-card-actions>
          </mat-card>
        }
      </div>
    </section>
  `,
  styles: `
    .login {
      max-width: 880px;
      margin: var(--inv-space-6) auto;
    }
    h1 {
      margin: 0;
      font-weight: 500;
    }
    .muted {
      color: var(--inv-text-muted);
    }
    .profiles {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: var(--inv-space-4);
    }
    .profile {
      background: var(--inv-surface-raised);
      border-color: var(--inv-border);
    }
  `,
})
export class LoginComponent {
  private readonly session = inject(AuthSessionService);
  private readonly router = inject(Router);

  /** Perfis de demonstração. */
  protected readonly profiles: readonly {
    readonly id: CustomerProfile;
    readonly title: string;
    readonly icon: string;
    readonly description: string;
  }[] = [
    {
      id: 'RETAIL',
      title: 'Varejo',
      icon: 'person',
      description: 'Consulta o catálogo de renda fixa e simula rentabilidade. Não envia ordens nem acessa fundos.',
    },
    {
      id: 'PRIVATE_BANKING',
      title: 'Private Banking',
      icon: 'workspace_premium',
      description: 'Acesso completo: fundos multimercado, simulações e botão "Investir Agora".',
    },
  ];

  /**
   * @description Autentica com o perfil e navega ao MFE.
   * @param profile Perfil escolhido.
   * @returns Promessa resolvida após a navegação.
   */
  protected async enter(profile: CustomerProfile): Promise<void> {
    this.session.loginAs(profile);
    await this.router.navigateByUrl('/renda-fixa');
  }
}
