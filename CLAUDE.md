# CLAUDE.md — Guia para agentes de IA neste repositório

## Comandos

```bash
npm install
npm test -- --watch=false     # testes (Vitest via Angular CLI) — devem passar 100%
npm run lint                  # ESLint
npm run build                 # build de produção com SSR (budgets ativos)
npm run start:ssr             # build + servidor SSR (http://localhost:4000)
```

## Stack e regras invioláveis

- Angular 22 **standalone** (zero `NgModule`), **Signals**, `inject()`, `input()/output()/model()`,
  `@if/@for(track)/@defer`. **`ChangeDetectionStrategy.OnPush` em todo componente.**
- TypeScript `strict: true`; **proibido `any`**. Identificadores financeiros usam Branded Types
  (`CNPJ`, `ISIN`, `Ticker`, `TaxaRentabilidade`) criados por `parse*` — nunca por `as`.
- **JSDoc completo** (`@description`, `@param`, `@returns`, `@throws`, `@example`) em toda função/classe/pipe/
  diretiva/guard/interceptor e **comentários em português explicando o *porquê*** da decisão.
- Nunca truncar código (`// resto aqui`, `...`).
- Libs em `libs/*` (`@invest/*`). Sentido das dependências:
  `mfe-renda-fixa → data-access-investments → http-core → auth-security`; `ui-design-system` é folha.
  Não crie ciclos: use os pontos de extensão `SESSION_CLEANUP_HANDLERS` e `HTTP_FEEDBACK`.
- Estado: só `InvestmentElfRepository` escreve no Elf; componentes leem **Signals do Facade**.
- Regras de negócio (IR regressivo, rentabilidade) = **funções puras** em `domain/` com testes.
- Seletores: `inv-*` nas libs, `app-*` no shell (exceção justificada: diretiva `hasPermission`).

## Segurança (não regredir)

- Token JWT só para URLs **relativas** de `/api/v1` (ver `isApiUrl`). Teste existente: `auth.interceptor.spec.ts`.
- `HostBridgeService`: whitelist de origem por igualdade exata, `event.source`, schema, `targetOrigin` explícito.
  O host **não** pode mudar perfil/permissões.
- CSP `script-src 'self'`: não reative Event Replay / Hydration Incremental / inline critical CSS sem nonce.
- Nunca confiar na ACL do front-end como autorização: o backend (e o mock) reavalia.

## Fluxo de trabalho esperado

1. Escreva/ajuste o teste (TDD) → 2. implemente → 3. `npm run lint && npm test -- --watch=false && npm run build`.
Só conclua com os três verdes. Para mudanças visuais, valide no navegador (`npm run start:ssr`).

## Mapa rápido

| Quero…                         | Arquivo                                                        |
| ------------------------------ | -------------------------------------------------------------- |
| Alterar a cadeia de interceptors | `libs/http-core/src/lib/provide-http-core.ts`                |
| Novo cenário de falha          | `mock-control.service.ts` + botão em `src/app/features/debug-drawer.component.ts` |
| Nova permissão/escopo          | `libs/auth-security/src/lib/auth.models.ts` + `PROFILE_GRANTS` em `jwt.ts` |
| Nova família de ativo          | `domain/models.ts` (união) → `mappers.ts` → `mock-data.ts` → testes |
| Tokens de design               | `libs/ui-design-system/src/lib/styles/_tokens.scss`            |
