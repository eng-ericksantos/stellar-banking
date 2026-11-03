import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { SessionTerminationReason, TERMINATION_MESSAGE } from '@invest/auth-security';

/** @description Dados do diálogo de sessão encerrada. */
export interface SessionEndedDialogData {
  readonly reason: SessionTerminationReason;
}

/**
 * @description Modal exibido pelo `globalLogoutInterceptor` quando a sessão é encerrada globalmente.
 * Informa que o estado local (Elf, cache HTTP e storage) foi limpo por segurança.
 */
@Component({
  selector: 'app-session-ended-dialog',
  imports: [MatButtonModule, MatDialogModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title class="title">
      <mat-icon aria-hidden="true">lock_clock</mat-icon>
      Sessão encerrada
    </h2>
    <mat-dialog-content>
      <p>{{ message }}</p>
      <p class="muted">
        Por segurança, os dados da carteira, o cache de consultas e o armazenamento local foram limpos.
      </p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-flat-button type="button" [mat-dialog-close]="true" cdkFocusInitial>Entrar novamente</button>
    </mat-dialog-actions>
  `,
  styles: `
    .title {
      display: flex;
      align-items: center;
      gap: var(--inv-space-2);
    }
    .muted {
      color: var(--inv-text-muted);
    }
  `,
})
export class SessionEndedDialogComponent {
  private readonly data = inject<SessionEndedDialogData>(MAT_DIALOG_DATA);

  /** Mensagem correspondente ao motivo. */
  protected readonly message = TERMINATION_MESSAGE[this.data.reason];
}
