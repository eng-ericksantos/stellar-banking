import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  API_ENDPOINTS,
  AssetDto,
  OrderReceiptDto,
  OrderRequestDto,
  PositionDto,
  RatesDto,
  SimulationReceiptDto,
  SimulationRequestDto,
  apiContext,
} from '@invest/http-core';
import { Observable, map } from 'rxjs';
import { MappedAssets, toAssets, toPositions, toRates } from '../domain/mappers';
import { MarketRates, Position } from '../domain/models';

/** @description TTL do cache de taxas de mercado (5 minutos — mudam, no máximo, uma vez ao dia). */
export const RATES_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * @description Gateway HTTP de investimentos. Cada método declara, via `HttpContext`, o escopo de
 * jornada exigido, a política de cache e a segurança de retry — a decisão fica *junto da chamada*,
 * e os interceptors a aplicam de forma transversal.
 */
@Injectable({ providedIn: 'root' })
export class InvestmentApi {
  private readonly http = inject(HttpClient);

  /**
   * @description Consulta as taxas CDI/Selic/IPCA (cacheável).
   * @param options `forceRefresh` ignora o cache e o atualiza com o dado fresco.
   * @returns Taxas validadas.
   * @example
   * api.getRates({ forceRefresh: true }).subscribe();
   */
  getRates(options: { readonly forceRefresh?: boolean } = {}): Observable<MarketRates> {
    return this.http
      .get<RatesDto>(API_ENDPOINTS.rates, {
        context: apiContext({ scope: 'RETAIL', cacheTtlMs: RATES_CACHE_TTL_MS, skipCache: options.forceRefresh }),
      })
      .pipe(map(toRates));
  }

  /**
   * @description Consulta o catálogo de renda fixa (sem cache: dado de preço/estoque).
   * @returns Ativos válidos e rejeitados.
   * @example
   * api.getFixedIncome().subscribe(({ assets }) => ...);
   */
  getFixedIncome(): Observable<MappedAssets> {
    return this.http
      .get<readonly AssetDto[]>(API_ENDPOINTS.fixedIncome, { context: apiContext({ scope: 'RETAIL' }) })
      .pipe(map(toAssets));
  }

  /**
   * @description Consulta os fundos multimercado (exige escopo PRIVATE_BANKING).
   * @returns Ativos válidos e rejeitados.
   * @example
   * api.getFunds().subscribe();
   */
  getFunds(): Observable<MappedAssets> {
    return this.http
      .get<readonly AssetDto[]>(API_ENDPOINTS.funds, { context: apiContext({ scope: 'PRIVATE_BANKING' }) })
      .pipe(map(toAssets));
  }

  /**
   * @description Consulta a carteira do cliente.
   * @returns Posições.
   * @example
   * api.getPortfolio().subscribe();
   */
  getPortfolio(): Observable<readonly Position[]> {
    return this.http
      .get<readonly PositionDto[]>(API_ENDPOINTS.portfolio, { context: apiContext({ scope: 'RETAIL' }) })
      .pipe(map(toPositions));
  }

  /**
   * @description Registra uma simulação (idempotente por natureza — seguro para retry).
   * @param request Parâmetros da simulação.
   * @returns Comprovante.
   * @example
   * api.registerSimulation({ isin, valor: 1000, prazoDias: 365 }).subscribe();
   */
  registerSimulation(request: SimulationRequestDto): Observable<SimulationReceiptDto> {
    return this.http.post<SimulationReceiptDto>(API_ENDPOINTS.simulations, request, {
      context: apiContext({ scope: 'RETAIL', retrySafe: true }),
    });
  }

  /**
   * @description Envia uma ordem de aplicação. NÃO é repetida automaticamente: repetir um POST de
   * ordem poderia duplicar a aplicação.
   * @param request Dados da ordem.
   * @returns Comprovante da ordem.
   * @example
   * api.placeOrder({ isin, valor: 5000 }).subscribe();
   */
  placeOrder(request: OrderRequestDto): Observable<OrderReceiptDto> {
    return this.http.post<OrderReceiptDto>(API_ENDPOINTS.orders, request, {
      context: apiContext({ scope: 'PRIVATE_BANKING' }),
    });
  }
}
