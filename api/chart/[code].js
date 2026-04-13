import YahooFinance from 'yahoo-finance2';

const yf = new YahooFinance({ suppressNotices: ['ripHistorical'] });

async function fetchOHLCV(stockCode, range) {
  const ticker = `${stockCode}.T`;
  const rows = await yf.historical(ticker, { period1: rangeToDate(range), period2: new Date(), interval: '1d' });

  return rows
    .filter((r) => r.open && r.high && r.low && r.close)
    .map((r) => ({
      time: Math.floor(new Date(r.date).getTime() / 1000),
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
      volume: r.volume || 0,
    }))
    .sort((a, b) => a.time - b.time);
}

function rangeToDate(range) {
  const now = new Date();
  const map = { '6mo': 6, '1y': 12, '2y': 24, '5y': 60, 'max': 12 * 20 };
  const months = map[range] ?? 24;
  now.setMonth(now.getMonth() - months);
  return now;
}

export default async function handler(req, res) {
  const { code, range = '2y' } = req.query;

  res.setHeader('Access-Control-Allow-Origin', '*');

  if (!/^\d{4,5}$/.test(code)) {
    return res.status(400).json({ error: '銘柄コードは4〜5桁の数字で入力してください' });
  }

  try {
    const candles = await fetchOHLCV(code, range);
    res.status(200).json({ stockCode: code, candles });
  } catch (error) {
    res.status(500).json({ error: '株価データの取得に失敗しました: ' + error.message });
  }
}
