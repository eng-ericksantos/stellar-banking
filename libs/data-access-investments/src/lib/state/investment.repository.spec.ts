import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { MOCK_FIXED_INCOME, MOCK_FUNDS, MOCK_RATES } from '@invest/http-core';
import { ISIN, unwrap, parseIsin } from '../domain/branded';
import { toAssets, toRates } from '../domain/mappers';
import { InvestmentElfRepository } from './investment.repository';

describe('InvestmentElfRepository', () => {
  let repository: InvestmentElfRepository;
  const { assets } = toAssets(MOCK_FIXED_INCOME);
  const funds = toAssets(MOCK_FUNDS).assets;
  const isin = (raw: string): ISIN => unwrap(parseIsin(raw));

  beforeEach(() => {
    repository = TestBed.inject(InvestmentElfRepository);
  });

  it('upsert normaliza por ISIN e não duplica', async () => {
    repository.upsertAssets(assets);
    repository.upsertAssets(assets);
    expect(await firstValueFrom(repository.assets$)).toHaveLength(assets.length);
  });

  it('upsert atualiza campos de um ativo existente', () => {
    repository.upsertAssets(assets);
    const original = assets[0]!;
    repository.upsertAssets([{ ...original, aplicacaoMinima: 999 }]);
    expect(repository.getAsset(original.isin)?.aplicacaoMinima).toBe(999);
    expect(repository.getAssets()).toHaveLength(assets.length);
  });

  it('remove ativos por família', () => {
    repository.upsertAssets([...assets, ...funds]);
    repository.removeAssetsByKind('FUNDO_MULTIMERCADO');
    expect(repository.getAssets().some((asset) => asset.kind === 'FUNDO_MULTIMERCADO')).toBe(false);
    expect(repository.getAssets()).toHaveLength(assets.length);
  });

  it('addPosition soma ao valor existente e adiciona novas posições', async () => {
    repository.setPositions([{ isin: isin('BRCDBBRA0016'), valorAplicado: 1000, dataAplicacao: '2026-01-01' }]);
    repository.addPosition({ isin: isin('BRCDBBRA0016'), valorAplicado: 500, dataAplicacao: '2026-11-03' });
    repository.addPosition({ isin: isin('BRLCIITA0036'), valorAplicado: 2000, dataAplicacao: '2026-11-03' });
    const positions = await firstValueFrom(repository.positions$);
    expect(positions).toHaveLength(2);
    expect(positions.find((p) => p.isin === 'BRCDBBRA0016')?.valorAplicado).toBe(1500);
  });

  it('controla status e erro (erro é limpo ao sair do estado de falha)', async () => {
    repository.setStatus('error', 'falhou');
    expect(await firstValueFrom(repository.error$)).toBe('falhou');
    repository.setStatus('success');
    expect(await firstValueFrom(repository.error$)).toBeNull();
    expect(await firstValueFrom(repository.lastUpdatedAt$)).not.toBeNull();
  });

  it('reset devolve o store ao estado inicial (logout)', async () => {
    repository.upsertAssets(assets);
    repository.setRates(toRates(MOCK_RATES));
    repository.setStatus('success');
    repository.reset();
    expect(repository.getAssets()).toHaveLength(0);
    expect(await firstValueFrom(repository.rates$)).toBeNull();
    expect(await firstValueFrom(repository.status$)).toBe('idle');
  });

  it('snapshot/hydrate transportam o estado SSR → browser', async () => {
    expect(repository.snapshot()).toBeNull();
    repository.upsertAssets(assets);
    repository.setRates(toRates(MOCK_RATES));
    repository.setStatus('success');
    const snapshot = repository.snapshot();
    expect(snapshot?.assets).toHaveLength(assets.length);

    repository.reset();
    repository.hydrate(snapshot!);
    expect(repository.getAssets()).toHaveLength(assets.length);
    expect(await firstValueFrom(repository.status$)).toBe('success');
  });
});
