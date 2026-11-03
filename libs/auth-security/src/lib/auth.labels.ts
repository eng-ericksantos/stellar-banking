import { CustomerProfile, JourneyScope, Permission, SessionTerminationReason } from './auth.models';

/**
 * @file Rótulos de apresentação (pt-BR) para os códigos internos de segurança.
 *
 * Os códigos (`FIXED_INCOME_READ`, `PRIVATE_BANKING`…) são contratos técnicos entre front, JWT e backend —
 * nunca devem ser exibidos ao cliente. Usar `Record<União, string>` obriga, em tempo de compilação,
 * a criar o rótulo de qualquer permissão/escopo novo (sem "buracos" na interface).
 */

/** @description Rótulo amigável de cada permissão (ACL). */
export const PERMISSION_LABEL: Readonly<Record<Permission, string>> = {
  FIXED_INCOME_READ: 'Consultar renda fixa',
  FUNDS_READ: 'Consultar fundos',
  SIMULATION_RUN: 'Simular rentabilidade',
  INVESTMENT_EXECUTE: 'Investir (enviar ordens)',
};

/** @description Rótulo amigável de cada escopo de jornada. */
export const SCOPE_LABEL: Readonly<Record<JourneyScope, string>> = {
  RETAIL: 'Varejo',
  PRIVATE_BANKING: 'Private Banking',
};

/** @description Rótulo amigável de cada perfil comercial. */
export const PROFILE_LABEL: Readonly<Record<CustomerProfile, string>> = SCOPE_LABEL;

/** @description Mensagem para o cliente conforme o motivo do encerramento de sessão. */
export const TERMINATION_MESSAGE: Readonly<Record<SessionTerminationReason, string>> = {
  UNAUTHORIZED: 'Sua sessão expirou ou deixou de ser válida.',
  FORBIDDEN: 'Seu acesso a este recurso foi revogado.',
  EXPIRED: 'O tempo de validade da sua sessão terminou.',
  USER_REQUEST: 'Você encerrou a sessão.',
};
