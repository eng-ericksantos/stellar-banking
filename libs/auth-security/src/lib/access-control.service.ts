import { Injectable, inject } from '@angular/core';
import { JourneyScope, Permission } from './auth.models';
import { AuthSessionService } from './auth-session.service';
import { FeatureFlag, FeatureFlagsService } from './feature-flags.service';

/**
 * @description Requisito de acesso avaliado por guards e pela diretiva estrutural.
 * Todos os campos são opcionais e combinados com "E" lógico.
 */
export interface AccessRequirement {
  /** Permissão granular (ACL) exigida. */
  readonly permission?: Permission;
  /** Escopo de jornada exigido. */
  readonly scope?: JourneyScope;
  /** Feature flag que precisa estar habilitada. */
  readonly featureFlag?: FeatureFlag;
}

/**
 * @description Resultado discriminado da avaliação de acesso.
 */
export type AccessDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly cause: 'UNAUTHENTICATED' | 'MISSING_PERMISSION' | 'MISSING_SCOPE' | 'FLAG_DISABLED' };

/**
 * @description Motor de ACL: combina permissões, escopos de jornada e feature flags.
 * Todos os métodos leem Signals; logo, chamadas dentro de `computed`/`effect`/templates
 * são reativas a mudanças de perfil e de flags.
 */
@Injectable({ providedIn: 'root' })
export class AccessControlService {
  private readonly session = inject(AuthSessionService);
  private readonly flags = inject(FeatureFlagsService);

  /**
   * @description Avalia um requisito de acesso completo.
   * @param requirement Permissão/escopo/flag exigidos.
   * @returns Decisão discriminada com a causa da negação.
   * @example
   * access.evaluate({ permission: 'INVESTMENT_EXECUTE', scope: 'PRIVATE_BANKING' });
   */
  evaluate(requirement: AccessRequirement): AccessDecision {
    if (!this.session.isAuthenticated()) {
      return { allowed: false, cause: 'UNAUTHENTICATED' };
    }
    if (requirement.permission && !this.session.permissions().includes(requirement.permission)) {
      return { allowed: false, cause: 'MISSING_PERMISSION' };
    }
    if (requirement.scope && !this.session.journeyScopes().includes(requirement.scope)) {
      return { allowed: false, cause: 'MISSING_SCOPE' };
    }
    if (requirement.featureFlag && !this.flags.isEnabled(requirement.featureFlag)) {
      return { allowed: false, cause: 'FLAG_DISABLED' };
    }
    return { allowed: true };
  }

  /**
   * @description Atalho booleano para permissão (+ escopo opcional).
   * @param permission Permissão exigida.
   * @param scope Escopo de jornada opcional.
   * @returns `true` se permitido.
   * @example
   * access.can('INVESTMENT_EXECUTE', 'PRIVATE_BANKING');
   */
  can(permission: Permission, scope?: JourneyScope): boolean {
    return this.evaluate({ permission, scope }).allowed;
  }

  /**
   * @description Verifica apenas o escopo de jornada.
   * @param scope Escopo exigido.
   * @returns `true` se o token possui o escopo.
   */
  hasScope(scope: JourneyScope): boolean {
    return this.evaluate({ scope }).allowed;
  }
}
