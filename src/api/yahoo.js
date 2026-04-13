/**
 * ローソク足 (OHLCV) データを取得する
 * dev : Vite ミドルウェア (/api/chart/:code)
 * prod: Vercel Serverless Function (同 URL)
 *
 * @param {string} stockCode
 * @param {string} range - "6mo" | "1y" | "2y" | "5y" | "max"
 */
export async function fetchOHLCV(stockCode, range = '2y') {
  const res = await fetch(`/api/chart/${stockCode}?range=${range}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json.candles;
}
