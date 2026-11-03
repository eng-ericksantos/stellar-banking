import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { SessionTerminationReason } from '@invest/auth-security';
import { HttpFeedbackPort, RetryAttemptInfo } from '@invest/http-core';
import { SessionEndedDialogComponent } from './session-ended-dialog.component';

/**
 * @description Implementação Material da porta `HttpFeedbackPort`: Snackbars para retry/avisos e um
 * modal para o encerramento global de sessão. Fica no *shell* (e não em `http-core`) para que a lib de
 * HTTP permaneça independente de UI.
 */
@Injectable({ providedIn: 'root' })
export class MaterialHttpFeedback implements HttpFeedbackPort {
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private sessionDialogOpen = false;

  /**
   * @description Exibe uma mensagem informativa.
   * @param message Texto.
   */
  info(message: string): void {
    this.snackBar.open(message, 'OK', { duration: 3000 });
  }

  /**
   * @description Exibe um aviso.
   * @param message Texto.
   */
  warn(message: string): void {
    this.snackBar.open(message, 'OK', { duration: 5000, panelClass: 'inv-snack-warn' });
  }

  /**
   * @description Exibe um erro.
   * @param message Texto.
   */
  error(message: string): void {
    this.snackBar.open(message, 'Fechar', { duration: 7000, panelClass: 'inv-snack-error' });
  }

  /**
   * @description Informa cada nova tentativa do retry com backoff.
   * @param info Detalhes da tentativa.
   */
  retryAttempt(info: RetryAttemptInfo): void {
    this.snackBar.open(
      `Serviço instável. Nova tentativa ${info.attempt} de ${info.maxAttempts} em ${(info.delayMs / 1000).toFixed(1).replace('.', ',')}s…`,
      undefined,
      { duration: Math.max(info.delayMs, 1500), panelClass: 'inv-snack-warn' },
    );
  }

  /**
   * @description Abre o modal de sessão encerrada (uma única vez) e redireciona ao login ao fechar.
   * @param reason Motivo do encerramento.
   */
  sessionTerminated(reason: SessionTerminationReason): void {
    this.snackBar.dismiss();
    if (this.sessionDialogOpen) {
      return;
    }
    this.sessionDialogOpen = true;
    this.dialog
      .open(SessionEndedDialogComponent, { data: { reason }, disableClose: true, width: '440px', maxWidth: '95vw' })
      .afterClosed()
      .subscribe(() => {
        this.sessionDialogOpen = false;
        void this.router.navigateByUrl('/login');
      });
  }
}
