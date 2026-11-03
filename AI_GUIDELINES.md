# AI_GUIDELINES — Engenharia de Prompt e Governança de IA

Guia para o time usar assistentes de IA (Copilot, Claude etc.) com **qualidade, segurança e rastreabilidade**.

## 1. Princípios de governança

1. **IA propõe, humano dispõe.** Todo código gerado passa por revisão humana e pelo pipeline (lint, testes, build, audit).
2. **Nunca enviar segredos ou dados reais de clientes** em prompts (tokens, CPF/CNPJ reais, chaves, logs de produção).
   Use dados fictícios (como os do mock).
3. **Contexto mínimo necessário**: cole apenas os trechos relevantes; prefira referenciar arquivos do repositório.
4. **Rastreabilidade**: PRs com contribuição relevante de IA declaram isso na descrição e listam o prompt-base.
5. **Licenças**: não aceite trechos longos copiados de fontes externas sem origem conhecida.
6. **Responsabilidade**: quem faz o merge responde pelo código, independentemente de quem o escreveu.

## 2. Anatomia de um bom prompt

```
Contexto:   (stack, lib, arquivos envolvidos)
Objetivo:   (resultado observável)
Restrições: (regras do CLAUDE.md: OnPush, Signals, sem any, JSDoc, libs @invest/*)
Entrada:    (trecho de código / erro / requisito)
Saída:      (formato esperado: diff, arquivo novo, testes)
Critérios de aceite: (testes que devem passar, comportamento, acessibilidade)
```

## 3. Prompts prontos

### 3.1 TDD (teste primeiro)
> Atue como Staff Frontend Engineer. No arquivo `libs/data-access-investments/src/lib/domain/yield-calculator.ts`
> preciso suportar **IOF** para resgates < 30 dias. **Primeiro** escreva os testes Vitest (`*.spec.ts`) cobrindo:
> dia 1, dia 29, dia 30 e a combinação com a tabela regressiva de IR. Depois implemente a função pura mínima para
> passar. Sem `any`, JSDoc completo em português. Mostre apenas os diffs.

### 3.2 Revisão de segurança (OWASP)
> Revise `libs/auth-security/src/lib/host-bridge.service.ts` e `libs/http-core/src/lib/auth.interceptor.ts` contra
> OWASP ASVS (V3 sessão, V4 controle de acesso, V5 validação) e Top 10 (A01 Broken Access Control, A03 Injection,
> A05 Misconfiguration, A07 Auth failures). Para cada achado: severidade, cenário de exploração, arquivo/linha,
> correção mínima e **teste que reproduz** o problema. Não sugira mudanças que enfraqueçam a CSP.

### 3.3 Análise de bundle
> Segue a saída de `npm run build` (anexar). Identifique os 5 maiores chunks iniciais, explique o que os compõe
> (core, Material, Elf, mock...), proponha reduções **mensuráveis** (`@defer`, lazy routes, imports pontuais,
> remover dependência) e estime o ganho em kB gzip. Respeite o budget de `angular.json` e `npm run bundle:check`.

### 3.4 Refatoração para OnPush/Signals
> Refatore o componente abaixo para: standalone, `OnPush`, `inject()`, `input()/output()/model()`, `computed`
> no lugar de getters/métodos no template, `@for … track` por identidade estável, e remover subscriptions manuais
> (`toSignal`/`takeUntilDestroyed`). Preserve o comportamento: liste os testes existentes que o garantem e
> adicione os que faltarem. Explique cada mudança em comentário "por quê".

### 3.5 Acessibilidade
> Audite o template abaixo contra WCAG 2.2 AA: rótulos, foco, contraste com os tokens `--inv-*`, navegação por
> teclado, `aria-live` em regiões dinâmicas. Corrija e mostre como testar com leitor de tela.

## 4. Checklist antes de aceitar código de IA

- [ ] Compila (`npm run build`), passa em `npm run lint` e `npm test -- --watch=false`.
- [ ] Segue o `CLAUDE.md` (OnPush, Signals, sem `any`, JSDoc, limites entre libs).
- [ ] Não introduz segredo, `eval`, `innerHTML` sem sanitização, `postMessage('*')` ou CSP mais frouxa.
- [ ] Testes cobrem sucesso **e** falha; nada de testes "vazios" que só inflam cobertura.
- [ ] Dependência nova justificada (tamanho, manutenção, licença) e `npm audit` sem alta/crítica.

## 5. Anti-padrões

- Pedir "faça tudo" sem critérios de aceite. · Aceitar mocks que escondem bugs reais.
- Deixar a IA alterar `angular.json`/CSP/CI sem revisão de quem entende o impacto.
- Usar a IA para "fazer o teste passar" alterando o teste em vez do código.
