import {
  Directive,
  EmbeddedViewRef,
  TemplateRef,
  ViewContainerRef,
  effect,
  inject,
  input,
} from '@angular/core';
import { JourneyScope, Permission } from './auth.models';
import { AccessControlService } from './access-control.service';

/**
 * @description Diretiva estrutural de ACL: renderiza o template apenas se o cliente possuir
 * a permissão (e, opcionalmente, o escopo de jornada) informados. Remove o elemento do DOM
 * (e não apenas o esconde) — o botão "Investir Agora" não existe no HTML de quem não pode usá-lo.
 *
 * O `effect` lê Signals da sessão; assim, ao alternar RETAIL ↔ PRIVATE_BANKING no painel de
 * simulação, o DOM é adicionado/removido reativamente, sem `ngDoCheck`.
 *
 * @example
 * ```html
 * <button *hasPermission="'INVESTMENT_EXECUTE'; scope: 'PRIVATE_BANKING'; else semAcesso">Investir Agora</button>
 * <ng-template #semAcesso>Disponível no Private.</ng-template>
 * ```
 */
// eslint-disable-next-line @angular-eslint/directive-selector
@Directive({ selector: '[hasPermission]' })
export class HasPermissionDirective {
  private readonly templateRef = inject<TemplateRef<unknown>>(TemplateRef);
  private readonly viewContainer = inject(ViewContainerRef);
  private readonly access = inject(AccessControlService);

  /** Permissão exigida. */
  readonly hasPermission = input.required<Permission>();

  /** Escopo de jornada opcional (microsyntax: `scope: 'PRIVATE_BANKING'`). */
  readonly hasPermissionScope = input<JourneyScope | undefined>(undefined);

  /** Template alternativo exibido quando o acesso é negado (microsyntax: `else tpl`). */
  readonly hasPermissionElse = input<TemplateRef<unknown> | null>(null);

  private currentView: EmbeddedViewRef<unknown> | null = null;
  private currentAllowed: boolean | null = null;

  /**
   * @description Registra o `effect` que sincroniza o DOM com a decisão de ACL.
   */
  constructor() {
    effect(() => {
      const allowed = this.access.can(this.hasPermission(), this.hasPermissionScope());
      const elseTemplate = this.hasPermissionElse();
      this.render(allowed, elseTemplate);
    });
  }

  /**
   * @description Aplica a decisão ao DOM (limpa o container e recria a view correspondente).
   * @param allowed Resultado da avaliação de ACL.
   * @param elseTemplate Template alternativo opcional.
   */
  private render(allowed: boolean, elseTemplate: TemplateRef<unknown> | null): void {
    this.viewContainer.clear();
    this.currentView = null;
    this.currentAllowed = allowed;
    if (allowed) {
      this.currentView = this.viewContainer.createEmbeddedView(this.templateRef);
    } else if (elseTemplate) {
      this.currentView = this.viewContainer.createEmbeddedView(elseTemplate);
    }
    this.currentView?.markForCheck();
  }

  /**
   * @description Expõe a última decisão (útil para testes e depuração).
   * @returns `true`/`false` ou `null` antes da primeira avaliação.
   */
  get lastDecision(): boolean | null {
    return this.currentAllowed;
  }
}
