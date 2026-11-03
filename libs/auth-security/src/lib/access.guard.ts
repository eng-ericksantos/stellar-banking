import { inject } from '@angular/core';
import { CanActivateFn, CanMatchFn, Router, UrlTree } from '@angular/router';
import { AccessControlService, AccessRequirement } from './access-control.service';
import { AUTH_ROUTES } from './auth.tokens';

/**
 * @description Avalia o requisito e devolve `true` ou um `UrlTree` de redirecionamento.
 * Retornar `UrlTree` (em vez de chamar `router.navigate`) é a forma idiomática e segura:
 * o roteador cancela a navegação atual e a substitui de forma atômica, sem corrida de navegações.
 * @param requirement Requisito de acesso (permissão/escopo/flag).
 * @returns `true` quando permitido; `UrlTree` quando negado.
 * @example
 * const result = resolveAccess({ permission: 'FIXED_INCOME_READ' });
 */
export function resolveAccess(requirement: AccessRequirement): true | UrlTree {
  const access = inject(AccessControlService);
  const router = inject(Router);
  const routes = inject(AUTH_ROUTES);
  const decision = access.evaluate(requirement);
  if (decision.allowed) {
    return true;
  }
  return router.parseUrl(decision.cause === 'UNAUTHENTICATED' ? routes.login : routes.forbidden);
}

/**
 * @description Fábrica de `CanMatchFn` com requisito explícito.
 * `canMatch` é preferível a `canActivate` para rotas lazy: se negado, o chunk do MFE
 * **nem é baixado** — economiza banda e não expõe código a quem não tem permissão.
 * @param requirement Requisito de acesso.
 * @returns Guard funcional `CanMatchFn`.
 * @example
 * { path: 'renda-fixa', canMatch: [requireAccessMatch({ permission: 'FIXED_INCOME_READ' })], ... }
 */
export function requireAccessMatch(requirement: AccessRequirement): CanMatchFn {
  return () => resolveAccess(requirement);
}

/**
 * @description Fábrica de `CanActivateFn` com requisito explícito.
 * @param requirement Requisito de acesso.
 * @returns Guard funcional `CanActivateFn`.
 * @example
 * { path: 'ordens', canActivate: [requireAccess({ permission: 'INVESTMENT_EXECUTE' })] }
 */
export function requireAccess(requirement: AccessRequirement): CanActivateFn {
  return () => resolveAccess(requirement);
}

/**
 * @description `CanActivateFn` orientado a dados: lê `permission`/`scope`/`featureFlag` de `route.data`.
 * Permite declarar a ACL diretamente na definição da rota.
 * @param route Snapshot da rota sendo ativada.
 * @returns `true` ou `UrlTree`.
 * @example
 * { path: 'x', canActivate: [accessDataGuard], data: { permission: 'FUNDS_READ' } }
 */
export const accessDataGuard: CanActivateFn = (route) =>
  resolveAccess({
    permission: route.data['permission'],
    scope: route.data['scope'],
    featureFlag: route.data['featureFlag'],
  });
