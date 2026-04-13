import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// ローカル dev 用: Vercel Serverless Functions と同じロジックをミドルウェアで提供
function localApiPlugin() {
  return {
    name: 'local-api',
    async configureServer(server) {
      // 動的インポートで Node.js 専用モジュールを読み込む
      const { default: axios } = await import('axios');
      const { load } = await import('cheerio');
      const { default: YahooFinance } = await import('yahoo-finance2');

      const yf = new YahooFinance({ suppressNotices: ['ripHistorical'] });

      const HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
      };

      async function scrapeKarauri(stockCode) {
        const url = `https://karauri.net/${stockCode}/`;
        const response = await axios.get(url, { headers: HEADERS, timeout: 15000 });
        const $ = load(response.data);

        const titleText = $('title').text().trim();
        const stockName = titleText
          .replace(/の空売り残高情報.*/, '')
          .replace(/^\d{4,5}\s*/, '')
          .trim();

        const table = $('#sort');
        if (!table.length) {
          return { stockName, stockCode, records: [], warning: 'データテーブルが見つかりませんでした' };
        }

        const records = [];
        table.find('tbody tr').each((_, row) => {
          const cells = [];
          $(row).find('td').each((_, cell) => cells.push($(cell).text().trim()));
          if (cells.length < 2) return;
          records.push({
            date: cells[0] || '',
            institution: $(row).find('td').eq(1).find('a').first().text().trim() || cells[1] || '',
            ratio: cells[2] || '',
            ratioChange: cells[3] || '',
            quantity: cells[4] || '',
            quantityChange: cells[5] || '',
            remark: cells[6] || '',
          });
        });

        return { stockName, stockCode, records };
      }

      function rangeToDate(range) {
        const now = new Date();
        const map = { '6mo': 6, '1y': 12, '2y': 24, '5y': 60, 'max': 240 };
        now.setMonth(now.getMonth() - (map[range] ?? 24));
        return now;
      }

      async function fetchOHLCV(stockCode, range) {
        const rows = await yf.historical(`${stockCode}.T`, {
          period1: rangeToDate(range),
          period2: new Date(),
          interval: '1d',
        });
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

      server.middlewares.use(async (req, res, next) => {
        const url = req.url || '';

        // /api/short-selling/:code
        const shortMatch = url.match(/^\/api\/short-selling\/(\d{4,5})(?:\?.*)?$/);
        if (shortMatch) {
          res.setHeader('Content-Type', 'application/json');
          try {
            const data = await scrapeKarauri(shortMatch[1]);
            res.end(JSON.stringify(data));
          } catch (e) {
            res.statusCode = e.response?.status === 404 ? 404 : 500;
            res.end(JSON.stringify({ error: e.message }));
          }
          return;
        }

        // /api/chart/:code?range=2y
        const chartMatch = url.match(/^\/api\/chart\/(\d{4,5})(?:\?(.*))?$/);
        if (chartMatch) {
          res.setHeader('Content-Type', 'application/json');
          try {
            const qs = new URLSearchParams(chartMatch[2] || '');
            const range = qs.get('range') || '2y';
            const candles = await fetchOHLCV(chartMatch[1], range);
            res.end(JSON.stringify({ stockCode: chartMatch[1], candles }));
          } catch (e) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: e.message }));
          }
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), localApiPlugin()],
  server: { port: 5173 },
});
