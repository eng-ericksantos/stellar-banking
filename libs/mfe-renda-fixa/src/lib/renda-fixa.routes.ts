import { Routes } from '@angular/router';
import { FixedIncomeContainerComponent } from './fixed-income-container/fixed-income-container.component';

/**
 * @description Rotas do MFE de Renda Fixa. Exportadas como constante para que o shell as carregue de forma
 * *lazy* via `loadChildren: () => import('@invest/mfe-renda-fixa').then(m => m.RENDA_FIXA_ROUTES)`:
 * todo o código do MFE (componentes, Material Table/Slider/Stepper...) vira um chunk separado.
 */
export const RENDA_FIXA_ROUTES: Routes = [
  {
    path: '',
    title: 'Renda Fixa e Fundos · Stellar Banking',
    component: FixedIncomeContainerComponent,
  },
];
