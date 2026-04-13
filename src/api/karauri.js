/**
 * 空売り残高データを取得する
 * dev : Vite ミドルウェア (/api/short-selling/:code)
 * prod: Vercel Serverless Function (同 URL)
 */
export async function fetchShortSelling(stockCode) {
  const res = await fetch(`/api/short-selling/${stockCode}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}
