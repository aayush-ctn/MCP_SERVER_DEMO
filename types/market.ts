export interface MarketData {
  btc_dominance: number;
  fear_and_greed_index: number;
  global_market: number;
  global_volume: number;
  updated_at: string;
}

export interface MarketDataResponse {
  data: MarketData;
}
