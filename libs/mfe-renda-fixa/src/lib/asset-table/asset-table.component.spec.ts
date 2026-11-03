import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthSessionService } from '@invest/auth-security';
import { InvestmentAsset, toAssets } from '@invest/data-access-investments';
import { MOCK_FIXED_INCOME } from '@invest/http-core';
import { AssetTableComponent } from './asset-table.component';

@Component({
  imports: [AssetTableComponent],
  template: `<inv-asset-table
    [assets]="assets()"
    [ordersEnabled]="true"
    (assetSelected)="selected.set($event)"
    (investRequested)="invested.set($event)"
  />`,
})
class HostComponent {
  readonly assets = signal<readonly InvestmentAsset[]>(toAssets(MOCK_FIXED_INCOME).assets);
  readonly selected = signal<InvestmentAsset | null>(null);
  readonly invested = signal<InvestmentAsset | null>(null);
}

describe('AssetTableComponent', () => {
  beforeEach(() => sessionStorage.clear());

  /** Cria o host e aguarda a renderização. */
  async function create() {
    const fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  const names = (element: HTMLElement): string[] =>
    [...element.querySelectorAll('tbody .name')].map((node) => node.textContent?.trim() ?? '');

  it('renderiza uma linha por ativo', async () => {
    const { element } = await create();
    expect(element.querySelectorAll('tbody tr')).toHaveLength(MOCK_FIXED_INCOME.length);
  });

  it('filtra por texto (nome/emissor/ticker)', async () => {
    const { fixture, element } = await create();
    const input = element.querySelector<HTMLInputElement>('input[type="search"]')!;
    input.value = 'ntnb2035';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(names(element)).toEqual(['Tesouro IPCA+ 2035']);
  });

  it('ordena por coluna ao clicar no cabeçalho', async () => {
    const { fixture, element } = await create();
    const header = element.querySelector<HTMLElement>('th[mat-sort-header="aplicacaoMinima"]')!;
    header.click();
    await fixture.whenStable();
    const first = names(element)[0];
    expect(first).toBe('Tesouro IPCA+ 2035'); // menor aplicação mínima (R$ 150)
  });

  it('mostra estado vazio quando nada corresponde', async () => {
    const { fixture, element } = await create();
    const input = element.querySelector<HTMLInputElement>('input[type="search"]')!;
    input.value = 'zzzz';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(element.querySelector('.empty')?.textContent).toContain('Nenhum ativo');
  });

  it('emite assetSelected ao clicar no nome', async () => {
    const { fixture, element } = await create();
    element.querySelector<HTMLButtonElement>('tbody .name-btn')!.click();
    expect(fixture.componentInstance.selected()?.nome).toBe('CDB Aurora 110% CDI');
  });

  it('"Investir Agora" só existe no DOM para Private Banking', async () => {
    const session = TestBed.inject(AuthSessionService);
    session.loginAs('RETAIL');
    const retail = await create();
    expect(retail.element.textContent).not.toContain('Investir Agora');

    session.loginAs('PRIVATE_BANKING');
    await retail.fixture.whenStable();
    expect(retail.element.textContent).toContain('Investir Agora');
    const button = [...retail.element.querySelectorAll<HTMLButtonElement>('tbody button')].find((b) =>
      b.textContent?.includes('Investir Agora'),
    )!;
    button.click();
    expect(retail.fixture.componentInstance.invested()).not.toBeNull();
  });
});
