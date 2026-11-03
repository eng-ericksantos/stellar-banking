import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import {
  ApplicationConfig,
  LOCALE_ID,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import {
  provideClientHydration,
  withHttpTransferCacheOptions,
  withNoIncrementalHydration,
} from '@angular/platform-browser';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { HTTP_FEEDBACK, provideHttpCore } from '@invest/http-core';
import { provideInvestmentsDataAccess } from '@invest/data-access-investments';
import { MaterialHttpFeedback } from './core/material-http-feedback.service';
import { routes } from './app.routes';

registerLocaleData(localePt);

/**
 * @description Configuração da aplicação (compartilhada por browser e servidor).
 *
 * - `provideClientHydration`: reaproveita o DOM renderizado no servidor (sem recriar a árvore, sem flickering).
 *   Event Replay e Hydration Incremental (que injetam um script inline no HTML) ficam desligados de propósito:
 *   a CSP estrita do `index.html` (`script-src 'self'`) bloquearia esse script.
 * - `withHttpTransferCacheOptions`: para chamadas a um backend REAL, o Angular serializa as respostas
 *   GET do servidor no HTML e as reutiliza no browser (zero request duplicado). Requisições com header
 *   `Authorization` NÃO entram no cache automático (`includeRequestsWithAuthHeaders: false`) para não
 *   vazar dados de um usuário no HTML; as taxas públicas (CDI/Selic/IPCA) são transferidas de forma
 *   controlada pelo `cacheInterceptor`, e o estado Elf, pelo `TransferState` do repositório.
 * - `provideHttpCore`: cadeia de interceptors + backend simulado (100% offline).
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideClientHydration(
      withNoIncrementalHydration(),
      withHttpTransferCacheOptions({ includePostRequests: false, includeRequestsWithAuthHeaders: false }),
    ),
    provideHttpCore({ useMockApi: true }),
    provideInvestmentsDataAccess(),
    { provide: HTTP_FEEDBACK, useExisting: MaterialHttpFeedback },
    { provide: LOCALE_ID, useValue: 'pt-BR' },
  ],
};
