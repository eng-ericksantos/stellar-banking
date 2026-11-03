import { Routes } from '@angular/router';
import { requireAccessMatch } from '@invest/auth-security';

/**
 * @description Rotas do shell.
 *
 * O MFE `mfe-renda-fixa` é carregado por `loadChildren` + `import()` dinâmico (chunk separado) e protegido
 * por um `CanMatchFn`: se o cliente não tiver a permissão/escopo, o chunk **nem é baixado**.
 */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'renda-fixa' },
  {
    path: 'login',
    title: 'Entrar · Stellar Banking',
    loadComponent: () => import('./features/login.component').then((module) => module.LoginComponent),
  },
  {
    path: 'acesso-negado',
    title: 'Acesso negado · Stellar Banking',
    loadComponent: () => import('./features/forbidden.component').then((module) => module.ForbiddenComponent),
  },
  {
    path: 'renda-fixa',
    canMatch: [requireAccessMatch({ permission: 'FIXED_INCOME_READ', scope: 'RETAIL' })],
    loadChildren: () => import('@invest/mfe-renda-fixa').then((module) => module.RENDA_FIXA_ROUTES),
  },
  { path: '**', redirectTo: 'renda-fixa' },
];
