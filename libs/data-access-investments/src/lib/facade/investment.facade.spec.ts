import { HttpErrorResponse } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthSessionService, FeatureFlagsService, JourneyScopeError } from '@invest/auth-security';
import { MOCK_API_CONFIG, MockControlService, RETRY_CONFIG, provideHttpCore } from '@invest/http-core';
import { InvestmentFacade, describeError } from './investment.facade';
import { InvestmentElfRepository } from '../state/investment.repository';
import { provideInvestmentsDataAccess } from '../provide-investments-data-access';
import { ISIN, parseIsin, unwrap } from '../domain/branded';

describe('InvestmentFacade', () => {
  let facade: InvestmentFacade;
  let session: AuthSessionService;
  const isin = (raw: string): ISIN => unwrap(parseIsin(raw));

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpCore({ useMockApi: true }),
        provideHttpClientTesting(),
        provideInvestmentsDataAccess(),
        { provide: MOCK_API_CONFIG, useValue: { minLatencyMs: 0, maxLatencyMs: 0 } },
        {
          provide: RETRY_CONFIG,
          useValue: { maxRetries: 3, baseDelayMs: 1, factor: 2, maxDelayMs: 5, requestTimeoutMs: 2000, random: () => 0 },
        },
      ],
    });
    session = TestBed.inject(AuthSessionService);
    facade = TestBed.inject(InvestmentFacade);
  });

  it('carrega catálogo, taxas e carteira; varejo não vê fundos', async () => {
    await facade.load();
    expect(facade.status()).toBe('success');
    expect(facade.assets()).toHaveLength(10);
    expect(facade.assets().some((asset) => asset.kind === 'FUNDO_MULTIMERCADO')).toBe(false);
    expect(facade.rates()?.cdi).toBe(14.65);
    expect(facade.positions()).toHaveLength(3);
  });

  it('deriva o resumo patrimonial em Signals', async () => {
    await facade.load();
    const summary = facade.portfolioSummary();
    expect(summary.quantidadeAtivos).toBe(3);
    expect(summary.totalAplicado).toBe(50_000);
    expect(summary.patrimonioLiquido).toBeGreaterThan(50_000);
  });

  it('filtra por indexador reativamente', async () => {
    await facade.load();
    facade.setIndexadorFilter('IPCA');
    expect(facade.filteredAssets().length).toBeGreaterThan(0);
    expect(facade.filteredAssets().every((asset) => asset.indexador === 'IPCA')).toBe(true);
    facade.setIndexadorFilter('TODOS');
    expect(facade.filteredAssets()).toHaveLength(10);
  });

  it('calcula IR regressivo na simulação do ativo selecionado', async () => {
    await facade.load();
    facade.selectAsset(isin('BRCDBBRA0016'));
    facade.setSimulationParams({ valor: 20_000, prazoDias: 400 });
    expect(facade.simulationResult()?.aliquotaIR).toBe(0.175);
    facade.selectAsset(isin('BRNTNB350062'));
    facade.setSimulationParams({ prazoDias: 800 });
    expect(facade.simulationResult()?.aliquotaIR).toBe(0.15);
    facade.selectAsset(isin('BRLCIITA0036'));
    expect(facade.simulationResult()?.aliquotaIR).toBe(0);
    facade.selectAsset(null);
    expect(facade.simulationResult()).toBeNull();
  });

  it('limita o prazo simulado ao vencimento do título selecionado', async () => {
    await facade.load();
    facade.setSimulationParams({ prazoDias: 1500 });
    facade.selectAsset(isin('BRLCIITA0036')); // vence em 30/06/2027
    expect(facade.maturityDays()).toBe(239);
    expect(facade.simulationParams().prazoDias).toBe(239);
    facade.setSimulationParams({ prazoDias: 900 });
    expect(facade.simulationParams().prazoDias).toBe(239);
    facade.selectAsset(isin('BRNTNB450078')); // Tesouro 2045: não limita 900 dias
    facade.setSimulationParams({ prazoDias: 900 });
    expect(facade.simulationParams().prazoDias).toBe(900);
  });

  it('recalcula o comparativo CDB × isenta ao alterar as taxas', async () => {
    await facade.load();
    facade.setSimulationParams({ valor: 10_000, prazoDias: 720 });
    facade.setComparisonParams({ cdbPercentCdi: 100, isentoPercentCdi: 92 });
    expect(facade.comparison()?.vencedor).toBe('ISENTO');
    facade.setComparisonParams({ cdbPercentCdi: 130, isentoPercentCdi: 80 });
    expect(facade.comparison()?.vencedor).toBe('CDB');
  });

  it('carrega fundos ao assumir o escopo PRIVATE_BANKING e os remove ao perder (effect)', async () => {
    await facade.load();
    session.loginAs('PRIVATE_BANKING');
    await vi.waitFor(() => {
      TestBed.tick();
      expect(facade.assets().some((asset) => asset.kind === 'FUNDO_MULTIMERCADO')).toBe(true);
    });
    session.loginAs('RETAIL');
    await vi.waitFor(() => {
      TestBed.tick();
      expect(facade.assets().some((asset) => asset.kind === 'FUNDO_MULTIMERCADO')).toBe(false);
    });
  });

  it('desliga fundos pela Feature Flag sem nova requisição', async () => {
    session.loginAs('PRIVATE_BANKING');
    await facade.load();
    await vi.waitFor(() => expect(facade.assets().some((asset) => asset.kind === 'FUNDO_MULTIMERCADO')).toBe(true));
    TestBed.inject(FeatureFlagsService).set('MULTIMARKET_FUNDS', false);
    expect(facade.filteredAssets().some((asset) => asset.kind === 'FUNDO_MULTIMERCADO')).toBe(false);
  });

  it('invest: varejo é bloqueado pelo escopo antes do envio', async () => {
    await facade.load();
    await expect(facade.invest(isin('BRCDBBRA0016'), 5000)).rejects.toBeInstanceOf(JourneyScopeError);
    expect(facade.positions()).toHaveLength(3);
  });

  it('invest: Private muta o Elf (soma à posição existente) após sucesso', async () => {
    session.loginAs('PRIVATE_BANKING');
    await facade.load();
    const receipt = await facade.invest(isin('BRCDBBRA0016'), 5000);
    expect(receipt.status).toBe('ACEITA');
    const position = facade.positions().find((candidate) => candidate.isin === 'BRCDBBRA0016');
    expect(position?.valorAplicado).toBe(30_000);
    expect(facade.portfolioSummary().totalAplicado).toBe(55_000);
  });

  it('a ordem enviada persiste no backend simulado e sobrevive a um "Atualizar"', async () => {
    session.loginAs('PRIVATE_BANKING');
    await facade.load();
    await facade.invest(isin('BRLCIITA0036'), 2000);
    await facade.refresh();
    expect(facade.positions()).toHaveLength(4);
    expect(facade.portfolioSummary().totalAplicado).toBe(52_000);
  });

  it('invest: abaixo do mínimo gera erro 422 e não altera a carteira', async () => {
    session.loginAs('PRIVATE_BANKING');
    await facade.load();
    await expect(facade.invest(isin('BRCDBBRA0016'), 10)).rejects.toMatchObject({ status: 422 });
    expect(facade.portfolioSummary().totalAplicado).toBe(50_000);
  });

  it('describeError usa a mensagem de negócio da API em erros 4xx', () => {
    const error = new HttpErrorResponse({ status: 422, error: { codigo: 'X', mensagem: 'Aplicação mínima: R$ 1000.' } });
    expect(describeError(error)).toBe('Aplicação mínima: R$ 1000.');
    expect(describeError(new HttpErrorResponse({ status: 500 }))).toContain('HTTP 500');
  });

  it('503 transitório é absorvido pelo retry e o carregamento termina com sucesso', async () => {
    TestBed.inject(MockControlService).armTransient503();
    await facade.load({ forceRefresh: true });
    expect(facade.status()).toBe('success');
  });

  it('503 persistente esgota o retry e expõe a mensagem de erro', async () => {
    TestBed.inject(MockControlService).armPersistent503();
    await facade.load({ forceRefresh: true });
    expect(facade.status()).toBe('error');
    expect(facade.error()).toContain('indisponível');
  });

  it('401 aciona o logout global e limpa o estado Elf', async () => {
    await facade.load();
    expect(facade.assets()).toHaveLength(10);
    TestBed.inject(MockControlService).armUnauthorized();
    await facade.load({ forceRefresh: true });
    expect(session.isAuthenticated()).toBe(false);
    expect(facade.assets()).toHaveLength(0);
    expect(facade.status()).toBe('error');
  });

  it('chamadas concorrentes de load compartilham a mesma promessa', async () => {
    const first = facade.load();
    const second = facade.load();
    expect(second).toBe(first);
    await first;
  });

  it('não recarrega enquanto o estado está fresco (cache do Elf / pós-hidratação)', async () => {
    await facade.load();
    const spy = vi.spyOn(TestBed.inject(InvestmentElfRepository), 'setStatus');
    await facade.load();
    expect(spy).not.toHaveBeenCalled();
  });

  it('describeError traduz erros técnicos', () => {
    expect(describeError(new JourneyScopeError('PRIVATE_BANKING', ['RETAIL']))).toContain('Private Banking');
    expect(describeError(new Error('x'))).toBe('x');
    expect(describeError('texto')).toBe('Ocorreu um erro inesperado.');
  });

  it('registerSimulation exige ativo selecionado e registra no backend', async () => {
    await facade.load();
    await expect(facade.registerSimulation()).rejects.toThrow();
    facade.selectAsset(isin('BRCDBBRA0016'));
    expect((await facade.registerSimulation()).id).toMatch(/^SIM-/);
  });
});
