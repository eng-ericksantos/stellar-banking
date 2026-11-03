import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { PortfolioSummary } from '@invest/data-access-investments';
import { BrlPipe, KpiCardComponent, PercentPipe } from '@invest/ui-design-system';

/**
 * @description Cards de KPI do resumo patrimonial (componente *presentational*).
 * Recebe o resumo já calculado pelo `InvestmentFacade`; não contém regra de negócio.
 * `OnPush` + `input()` => só re-renderiza quando o objeto `summary` troca de referência
 * (a cada recálculo do `computed` do facade), nunca por eventos alheios.
 * @example
 * <inv-portfolio-summary-cards [summary]="facade.portfolioSummary()" />
 */
@Component({
  selector: 'inv-portfolio-summary-cards',
  imports: [KpiCardComponent, BrlPipe, PercentPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="cards" aria-label="Resumo patrimonial">
      <inv-kpi-card
        label="Patrimônio líquido"
        icon="account_balance"
        tone="accent"
        [value]="summary().patrimonioLiquido | brl"
        [hint]="holdingsLabel()"
      />
      <inv-kpi-card
        label="Total aplicado"
        icon="savings"
        [value]="summary().totalAplicado | brl"
        hint="Capital investido"
      />
      <inv-kpi-card
        label="Rendimento líquido"
        icon="trending_up"
        [tone]="summary().rendimentoLiquido >= 0 ? 'positive' : 'negative'"
        [value]="summary().rendimentoLiquido | brl"
        [hint]="(summary().rentabilidade | pct) + ' sobre o capital'"
      />
      <inv-kpi-card
        label="IR estimado"
        icon="receipt_long"
        [value]="summary().irEstimado | brl"
        hint="Tabela regressiva 22,5% a 15%"
      />
    </section>
  `,
  styles: `
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: var(--inv-space-4);
    }
  `,
})
export class PortfolioSummaryCardsComponent {
  /** Resumo patrimonial calculado pelo facade. */
  readonly summary = input.required<PortfolioSummary>();

  /** Texto de apoio com a concordância correta (1 ativo / N ativos). */
  protected readonly holdingsLabel = computed(() => {
    const count = this.summary().quantidadeAtivos;
    if (count === 0) {
      return 'Nenhum ativo em carteira';
    }
    return `${count} ${count === 1 ? 'ativo' : 'ativos'} em carteira`;
  });
}
