import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

/**
 * @description Tela exibida quando o `CanMatchFn` nega o acesso (sessão válida, mas sem permissão/escopo/flag).
 */
@Component({
  selector: 'app-forbidden',
  imports: [MatButtonModule, MatIconModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="forbidden" role="alert">
      <mat-icon aria-hidden="true">gpp_bad</mat-icon>
      <h1>Acesso negado</h1>
      <p>Seu perfil, escopo de jornada ou os recursos habilitados não permitem abrir esta área.</p>
      <a mat-flat-button routerLink="/login">Trocar de perfil</a>
    </section>
  `,
  styles: `
    .forbidden {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--inv-space-3);
      margin: var(--inv-space-6) auto;
      max-width: 520px;
      text-align: center;
    }
    mat-icon {
      font-size: 64px;
      width: 64px;
      height: 64px;
      color: var(--inv-negative);
    }
  `,
})
export class ForbiddenComponent {}
