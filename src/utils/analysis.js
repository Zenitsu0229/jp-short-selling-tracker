// ─── 日付変換 ────────────────────────────────────────────
export function tsToDateStr(ts) {
  const d = new Date(ts * 1000);
  return [
    d.getUTCFullYear(),
    String(d.getUTCMonth() + 1).padStart(2, '0'),
    String(d.getUTCDate()).padStart(2, '0'),
  ].join('/');
}

// ─── 全機関合算の残高割合時系列 ──────────────────────────
// 各取引日について「その時点での全機関の残高合計」を返す
export function buildAggregateSeries(records, candles) {
  if (!records.length || !candles.length) return [];

  // 機関ごとに日付昇順でグループ化
  const groups = {};
  records.forEach((r) => {
    if (!groups[r.institution]) groups[r.institution] = [];
    groups[r.institution].push(r);
  });
  const institutionGroups = Object.values(groups).map((recs) =>
    [...recs].sort((a, b) => a.date.localeCompare(b.date))
  );

  return candles.map((candle) => {
    const candleDate = tsToDateStr(candle.time);
    let total = 0;

    institutionGroups.forEach((recs) => {
      // candleDate 以前の最新レコードを取得（前進して最後に見つかったもの）
      let lastRec = null;
      for (const rec of recs) {
        if (rec.date <= candleDate) lastRec = rec;
        else break;
      }
      if (!lastRec) return;

      // 報告義務消失 = ポジションなし
      const exited =
        lastRec.remark?.includes('報告義務消失') ||
        lastRec.remark?.includes('解消');
      if (!exited) total += parseRatio(lastRec.ratio) || 0;
    });

    return { time: candle.time, value: parseFloat(total.toFixed(3)) };
  });
}

// ─── 特定機関のマーカーデータ ────────────────────────────
export function buildInstitutionMarkers(institution, records, candles) {
  if (!institution || !candles.length) return [];

  const candleTimes = new Set(candles.map((c) => c.time));
  const instRecs = records
    .filter((r) => r.institution === institution)
    .sort((a, b) => a.date.localeCompare(b.date));

  return instRecs
    .map((rec) => {
      const ts = dateToTs(rec.date);
      let matchTime = candleTimes.has(ts) ? ts : null;
      if (!matchTime) {
        for (let off = -4; off <= 4; off++) {
          const t = ts + off * 86400;
          if (candleTimes.has(t)) { matchTime = t; break; }
        }
      }
      if (!matchTime) return null;

      const action = detectAction(rec);
      const isBuy  = action === 'entry' || action === 'increase';

      return {
        time:     matchTime,
        position: isBuy ? 'aboveBar' : 'belowBar',
        shape:    isBuy ? 'arrowDown' : 'arrowUp',
        color:    isBuy ? '#f87171' : '#34d399',
        text:     `${ACTION_META_LABEL[action]} ${rec.ratio}`,
        size:     2,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.time - b.time);
}

const ACTION_META_LABEL = {
  entry:    '新規',
  increase: '売増',
  decrease: '返済',
  exit:     '解消',
};

// ─── パーサー ───────────────────────────────────────────
function parseQty(str) {
  if (!str) return NaN;
  return parseFloat(str.replace(/[,株+\s]/g, ''));
}

export function parseRatio(str) {
  if (!str) return NaN;
  return parseFloat(str.replace('%', ''));
}

// "YYYY/MM/DD" → UTC Unix 秒
export function dateToTs(dateStr) {
  const [y, m, d] = dateStr.split('/').map(Number);
  return Date.UTC(y, m - 1, d) / 1000;
}

// candles → { "YYYY/MM/DD": close } マップ
export function buildPriceMap(candles) {
  const map = {};
  candles.forEach((c) => {
    const d = new Date(c.time * 1000);
    const key = [
      d.getUTCFullYear(),
      String(d.getUTCMonth() + 1).padStart(2, '0'),
      String(d.getUTCDate()).padStart(2, '0'),
    ].join('/');
    map[key] = c.close;
  });
  return map;
}

// ─── アクション判定 ──────────────────────────────────────
export function detectAction(rec) {
  const { remark = '', ratioChange = '', quantityChange = '' } = rec;
  if (remark.includes('報告義務消失') || remark.includes('解消')) return 'exit';
  if (remark.includes('再IN') || remark.includes('新規')) return 'entry';
  const rc = parseFloat(ratioChange);
  if (!isNaN(rc) && rc > 0) return 'increase';
  if (!isNaN(rc) && rc < 0) return 'decrease';
  const qc = parseQty(quantityChange);
  if (!isNaN(qc) && qc > 0) return 'increase';
  if (!isNaN(qc) && qc < 0) return 'decrease';
  return 'entry';
}

// ─── 機関別統計 ──────────────────────────────────────────
export function calcInstitutionStats(records, candles) {
  const priceMap = buildPriceMap(candles);
  const currentPrice = candles.length ? candles[candles.length - 1].close : null;

  // 機関ごとにグループ化
  const groups = {};
  records.forEach((r) => {
    if (!groups[r.institution]) groups[r.institution] = [];
    groups[r.institution].push(r);
  });

  return Object.entries(groups).map(([institution, recs]) => {
    // 日付昇順
    const sorted = [...recs].sort((a, b) => a.date.localeCompare(b.date));

    const firstDate = sorted[0].date;
    const lastDate  = sorted[sorted.length - 1].date;
    const lastRec   = sorted[sorted.length - 1];

    const ratios    = sorted.map((r) => parseRatio(r.ratio)).filter((v) => !isNaN(v));
    const latestRatio = ratios[ratios.length - 1] ?? 0;
    const peakRatio   = ratios.length ? Math.max(...ratios) : 0;

    // ステータス
    const isExited =
      lastRec.remark?.includes('報告義務消失') ||
      lastRec.remark?.includes('解消') ||
      latestRatio === 0;

    // 平均取得単価（空売り平均建値）
    // 買い増し or 新規参入ごとに price × qty を累積
    let totalCost = 0;
    let totalQty  = 0;

    sorted.forEach((r, idx) => {
      const action = detectAction(r);
      const price  = priceMap[r.date];
      if (!price) return;

      if (action === 'entry' || action === 'increase') {
        // quantityChange が正の場合はその分、なければ quantity 全体（初回）
        const qc  = parseQty(r.quantityChange);
        const qty = !isNaN(qc) && qc > 0
          ? qc
          : idx === 0 ? (parseQty(r.quantity) || 0) : 0;

        if (qty > 0) {
          totalCost += price * qty;
          totalQty  += qty;
        }
      }
    });

    const avgEntryPrice = totalQty > 0 ? totalCost / totalQty : null;

    // 損益率（空売り: 建値より下がれば利益）
    const pnlPct =
      avgEntryPrice && currentPrice
        ? ((avgEntryPrice - currentPrice) / avgEntryPrice) * 100
        : null;

    return {
      institution,
      firstDate,
      lastDate,
      latestRatio,
      peakRatio,
      isExited,
      avgEntryPrice,
      pnlPct,
      currentPrice,
      entryCount: sorted.length,
      records: sorted,
    };
  });
}

// 機関名 → インデックス色
export const PALETTE = [
  '#f87171', '#60a5fa', '#34d399', '#fbbf24', '#a78bfa',
  '#2dd4bf', '#fb923c', '#94a3b8', '#f472b6', '#38bdf8',
  '#4ade80', '#facc15', '#c084fc', '#fb7185', '#22d3ee',
  '#86efac', '#fde047', '#e879f9', '#67e8f9', '#a3e635',
];

export function buildColorMap(records) {
  const institutions = [...new Set(records.map((r) => r.institution))];
  const map = {};
  institutions.forEach((inst, i) => { map[inst] = PALETTE[i % PALETTE.length]; });
  return map;
}
