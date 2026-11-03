import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { INVESTMENT_CLEANUP_PROVIDER } from './facade/investment.facade';

/**
 * @description Registra os providers da camada de dados de investimentos: limpeza do estado Elf
 * no encerramento de sessão. (Facade, API e Repositório são `providedIn: 'root'`.)
 * @returns Providers de ambiente.
 * @example
 * bootstrapApplication(App, { providers: [provideInvestmentsDataAccess()] });
 */
export function provideInvestmentsDataAccess(): EnvironmentProviders {
  return makeEnvironmentProviders([INVESTMENT_CLEANUP_PROVIDER]);
}
