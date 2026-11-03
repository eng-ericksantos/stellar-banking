# ADR-001 · Arquitetura do Portal de Investimentos

- **Status:** Aceita
- **Público-alvo:** devs plenos/juniores em mentoria — cada decisão traz *contexto*, *decisão* e *consequências*.

## 1. Contexto

Plataforma de investimentos (Renda Fixa e Fundos) com requisitos de: performance (SSR/Hydration, bundle pequeno),
segurança (JWT, ACL, CSP, embed em iframe de parceiros), resiliência (retry, logout global) e manutenção por
várias equipes (fronteiras claras, testabilidade).

## 2. Decisões

### 2.1 Monorepo modular com libs `@invest/*` (estilo Nx)
**Decisão:** uma workspace Angular com `libs/*` mapeadas por `paths` no `tsconfig.json`.
**Por quê:** fronteiras explícitas sem custo de publicar pacotes; refatoração atômica; build único.
**Regra de dependência:** `mfe-renda-fixa → data-access-investments → http-core → auth-security`;
`ui-design-system` é folha. Violações (ex.: `auth-security` importando Elf) criam ciclos — por isso a limpeza de
sessão usa o *multi-token* `SESSION_CLEANUP_HANDLERS` (inversão de dependência) e o feedback visual usa a
*porta* `HTTP_FEEDBACK` (a lib HTTP não conhece Material).
**Consequência:** para virar Nx real, basta adicionar `project.json` por lib — o código já respeita os limites.

### 2.2 MFE via lazy route (`loadChildren` + `import()`)
**Decisão:** `mfe-renda-fixa` é carregado sob demanda e protegido por `CanMatchFn`.
**Por quê:** se o cliente não tem permissão, o *chunk nem é baixado*. Module Federation poderia substituir o
`import()` sem alterar as libs (a fronteira já existe).

### 2.3 Signals + OnPush + Standalone em 100% do código
**Por quê:** estado em `signal`/`computed` dá reatividade granular; com `OnPush` só os componentes que leem um
Signal alterado são reavaliados. Ex.: mover o slider de prazo recalcula `simulationResult` e re-renderiza o
simulador — a tabela (inputs inalterados) não é tocada.
**Padrão:** *Smart* (`FixedIncomeContainerComponent`) fala com o Facade; *Presentational* recebe `input()` e emite
`output()`/`model()`.

### 2.4 Estado: Elf (repositório) + Facade (Signals)
**Decisão:** `InvestmentElfRepository` (`withEntities` por `isin` + `withProps`) é o único escritor do estado;
`InvestmentFacade` converte `Observable → Signal (toSignal)` e expõe derivações `computed`.
**Por quê:** entidades normalizadas permitem *upsert* barato (cache); o Facade esconde HTTP/Elf dos componentes.
**Logout:** `store.reset()` registrado como cleanup — nenhum dado do cliente anterior sobrevive.

### 2.5 Domínio tipado: Branded Types + Discriminated Unions + ACL
**Decisão:** `CNPJ`, `ISIN`, `Ticker`, `TaxaRentabilidade` só nascem de *parsers* que validam (dígito verificador,
faixa). `InvestmentAsset` é uma união discriminada por `kind`. `mappers.ts` é o *Anti-Corruption Layer*: DTOs
(`string`/`number`) entram, tipos de domínio saem; dados inválidos são rejeitados na fronteira.
**Regras de IR** (22,5% → 15%) vivem em funções puras (`yield-calculator.ts`) — triviais de testar e reutilizar.

### 2.6 Cadeia de interceptors funcionais

```
request  → globalLogout → auth → cache → retry → mock/rede
response ← globalLogout ← auth ← cache ← retry ← mock/rede
```

| Interceptor    | Decisão / Por quê |
| -------------- | ----------------- |
| `globalLogout` | Mais externo: vê o erro **final** (após retries). 401/403 → logout + limpeza + modal (uma vez). |
| `auth`         | Injeta Bearer só em URLs relativas da API; valida **localmente** o `journeyScope` antes do disparo (`JourneyScopeError`, que NÃO derruba a sessão). Antes do cache: o escopo vale também para respostas em cache. |
| `cache`        | TTL em memória só para GET marcados via `HttpContext` (taxas). Servidor grava no `TransferState`; o browser consome na hidratação → **sem request duplicado**. Mutações invalidam o recurso. |
| `retry`        | **Exponential Backoff + Equal Jitter** para 0/408/429/5xx e timeout; nunca repete 4xx nem POST (exceto `RETRY_SAFE`) — repetir uma ordem poderia duplicá-la. O jitter evita *thundering herd*. |
| `mock`         | Último da cadeia: o tráfego é idêntico ao de produção. Também **autoriza como um servidor real** (claims do JWT). |

### 2.7 SSR + Hydration sem flicker
- `RenderMode.Server` (não Prerender): conteúdo depende de sessão/dados vivos.
- **Estado Elf transferido via `TransferState`** (`onSerialize` no servidor; `hydrate` antes do primeiro render
  no browser): o DOM hidratado é idêntico ao HTML do servidor e o Facade não recarrega (`isFresh`).
- `PendingTasks.run` no carregamento inicial: o servidor espera os dados antes de serializar.
- A sessão persistida só é restaurada **após** a hidratação (`afterNextRender`), evitando *mismatch* (NG0500).
- Valorização da carteira usa a **data de referência das taxas**, não `Date.now()` → resultado determinístico.

### 2.8 Segurança do embed (postMessage + CSP)
- **Whitelist de `event.origin`** por igualdade exata (nunca `startsWith`/`includes`).
- **`event.source`** deve ser o `window.parent` (host) ou o próprio window.
- **Schema validation** do payload (`unknown` até provar o formato) — origem confiável ≠ dado confiável.
- **`targetOrigin` explícito** no envio. **Comandos mínimos:** o host não altera perfil (anti escalada de privilégio).
- **CSP** (`index.html`): `script-src 'self'` — por isso Event Replay/Hydration Incremental (scripts inline) e o
  *inline critical CSS* estão desligados. `frame-ancestors` só funciona como header: está no `server.ts`.

### 2.9 Design System
Design Tokens como CSS Custom Properties (`--inv-*`) mudam em runtime (claro/escuro) e atravessam o
encapsulamento. O tema Material 3 é **mapeado sobre os tokens** (`mat.theme-overrides`). Fontes locais (offline + CSP).

## 3. Consequências / trade-offs

- Mock e libs compilam no mesmo bundle do shell (adequado a showroom; em produção o mock sai do build).
- `@defer (on idle)` no painel de debug retira ~100 kB do bundle inicial ao custo de aparecer após a hidratação.
- Sem Event Replay: cliques antes da hidratação não são reexecutados (compensação aceita pela CSP estrita;
  alternativa: CSP com *nonce* por requisição).

## 4. Checklist de revisão de PR

- [ ] Componente novo é `standalone`, `OnPush`, usa `inject()`/`input()`/`output()` e `@for … track`?
- [ ] Lógica de negócio está no domínio/Facade (função pura testável), não no componente?
- [ ] Sem `any`; novos identificadores financeiros usam Branded Types?
- [ ] Dependência respeita o sentido das libs? JSDoc e comentário do "porquê" presentes?
- [ ] Testes cobrindo o caminho feliz **e** o de erro (401/403/503/escopo)?
