import axios from 'axios';
import { load } from 'cheerio';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
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

export default async function handler(req, res) {
  const { code } = req.query;

  res.setHeader('Access-Control-Allow-Origin', '*');

  if (!/^\d{4,5}$/.test(code)) {
    return res.status(400).json({ error: '銘柄コードは4〜5桁の数字で入力してください' });
  }

  try {
    const data = await scrapeKarauri(code);
    res.status(200).json(data);
  } catch (error) {
    if (error.response?.status === 404) {
      return res.status(404).json({ error: `銘柄コード ${code} が見つかりませんでした` });
    }
    res.status(500).json({ error: 'データの取得に失敗しました: ' + error.message });
  }
}
