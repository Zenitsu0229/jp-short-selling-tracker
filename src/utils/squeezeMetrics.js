/**
 * squeezeMetrics.js
 *
 * 踏み上げ（ショートスクイーズ）分析指標の計算モジュール
 *
 * 【踏み上げが起きる仕組み】
 *  空売り機関が含み損を抱えた状態で株価が上昇すると、損切りのための
 *  買い戻し（カバー）が発生。その買い需要がさらに株価を押し上げ、
 *  他の空売り機関も連鎖的に買い戻しを迫られる——これが踏み上げ。
 *
 * 【スコア構成 (合計 0〜100)】
 *  ・空売り燃料スコア  (10%) : 合算残高率の水準
 *  ・水没圧力スコア   (40%) : 損失中の機関が抱える含み損の深さ × 水没比率
 *  ・解消進行スコア   (25%) : 直近 ~1ヶ月の合算残高の減少度合い
 *  ・価格モメンタムスコア(25%): 直近 ~1ヶ月の株価騰落率
 */

import { buildAggregateSeries } from './analysis';

// ─── 公開 API ────────────────────────────────────────────────────

/**
 * @param {Object[]} records         - 空売りレコード配列
 * @param {Object[]} candles         - OHLCV ローソク足配列
 * @param {Object[]} institutionStats - calcInstitutionStats() の出力
 * @returns {SqueezeMetrics | null}
 */
export function calcSqueezeMetrics(records, candles, institutionStats) {
  if (!records.length || !candles.length || !institutionStats.length) return null;

  // ── 1. 合算残高・機関集計 ─────────────────────────────────────
  const activeStats = institutionStats.filter((s) => !s.isExited);
  const aggregateRatio = activeStats.reduce((sum, s) => sum + s.latestRatio, 0);
  const activeCount    = activeStats.length;
  const totalCount     = institutionStats.length;

  // ── 2. 加重平均 PnL・水没比率 ──────────────────────────────────
  // pnlPct の符号: 正 = 利益（株価下落），負 = 損失（株価上昇） → 負が踏み上げ圧力
  const activeWithPnl   = activeStats.filter((s) => s.pnlPct != null && !isNaN(s.pnlPct));
  const totalActiveSW   = activeWithPnl.reduce((s, x) => s + x.latestRatio, 0); // 残高ウェイト合計

  const weightedPnl = totalActiveSW > 0
    ? activeWithPnl.reduce((sum, s) => sum + s.pnlPct * (s.latestRatio / totalActiveSW), 0)
    : null;

  // 水没率: 損失中の機関が占める合算残高の割合 (%)
  const underwaterRatio = aggregateRatio > 0
    ? activeWithPnl
        .filter((s) => s.pnlPct < 0)
        .reduce((sum, s) => sum + s.latestRatio, 0)
      / aggregateRatio * 100
    : 0;

  // 最大含み損機関（最もリスクの高い機関）
  const maxLossInst = activeWithPnl.length
    ? activeWithPnl.reduce((worst, s) =>
        (s.pnlPct ?? 0) < (worst.pnlPct ?? 0) ? s : worst
      )
    : null;

  // ── 3. 残高トレンド (合算時系列から計算) ────────────────────────
  const aggSeries  = buildAggregateSeries(records, candles);
  const currentAgg = aggSeries.length ? aggSeries[aggSeries.length - 1].value : 0;
  const peakAgg    = aggSeries.length ? Math.max(...aggSeries.map((p) => p.value)) : 0;

  // 直近 N 取引日の変化量
  const trend21d = aggSeriesDelta(aggSeries, 21);   // ≒ 1ヶ月
  const trend63d = aggSeriesDelta(aggSeries, 63);   // ≒ 3ヶ月

  // ピークからの下落率 (解消進行度)
  const drawdownFromPeak = peakAgg > 0
    ? ((peakAgg - currentAgg) / peakAgg) * 100
    : 0;

  // ── 4. 価格モメンタム ─────────────────────────────────────────
  const momentum20d = priceMomentum(candles, 20);   // ≒ 1ヶ月
  const momentum60d = priceMomentum(candles, 60);   // ≒ 3ヶ月
  const currentPrice = candles[candles.length - 1]?.close ?? null;

  // ── 5. 各サブスコア計算 ───────────────────────────────────────
  const fuelScore       = scoreFuel(aggregateRatio);
  const underwaterScore = scoreUnderwater(weightedPnl, underwaterRatio);
  const coveringScore   = scoreCovering(trend21d);
  const momentumScore   = scoreMomentum(momentum20d);

  // ── 6. 踏み上げスコア合成 ─────────────────────────────────────
  const squeezeScore = Math.round(
    0.10 * fuelScore +
    0.40 * underwaterScore +
    0.25 * coveringScore +
    0.25 * momentumScore,
  );

  return {
    // 基本
    aggregateRatio,
    activeCount,
    totalCount,
    currentPrice,

    // 水没分析
    weightedPnl,
    underwaterRatio,
    maxLossInst: maxLossInst
      ? { institution: maxLossInst.institution, pnlPct: maxLossInst.pnlPct }
      : null,

    // 残高トレンド
    currentAgg,
    peakAgg,
    drawdownFromPeak,
    trend21d,
    trend63d,

    // 価格
    momentum20d,
    momentum60d,

    // サブスコア
    fuelScore,
    underwaterScore,
    coveringScore,
    momentumScore,

    // 総合
    squeezeScore,

    // フェーズ
    phase: detectPhase(aggregateRatio, trend21d, momentum20d, weightedPnl, underwaterRatio),
  };
}

// ─── スコア関数 ────────────────────────────────────────────────

/**
 * 空売り燃料スコア (0〜100)
 * 合算残高率の水準を点数化。多いほど「踏み上げたときの反発エネルギー」が大きい。
 * 日本市場では合算 3〜5%+ が高水準。
 */
function scoreFuel(agg) {
  if (agg >= 8)  return 100;
  if (agg >= 5)  return 80 + (agg - 5) / 3 * 20;
  if (agg >= 3)  return 55 + (agg - 3) / 2 * 25;
  if (agg >= 2)  return 38 + (agg - 2) * 17;
  if (agg >= 1)  return 18 + (agg - 1) * 20;
  return Math.round(agg / 1 * 18);
}

/**
 * 水没圧力スコア (0〜100)
 * 最重要指標。損失中の機関ほど強制決済リスクが高い。
 *   weightedPnl < 0  → 機関が含み損を抱えている（踏み上げ圧力あり）
 *   underwaterRatio  → 合算残高のうち何%が水没しているか
 */
function scoreUnderwater(weightedPnl, underwaterRatio) {
  if (weightedPnl == null) return 0;
  if (weightedPnl >= 0) return 0;          // 利益中 = 圧力なし

  // 含み損の深さ: -20%で満点
  const depthScore = Math.min((-weightedPnl) / 20, 1);

  // 水没している残高の割合で調整
  const urFactor = underwaterRatio / 100;

  return Math.round(depthScore * urFactor * 100);
}

/**
 * 解消進行スコア (0〜100)
 * 直近 21 取引日（≒1ヶ月）の合算残高変化を評価。
 * 残高が減少 = 機関が買い戻している = 踏み上げが現実に進行中。
 */
function scoreCovering(delta) {
  if (delta == null) return 0;
  if (delta >= 0) return 0;         // 増加中 = 解消なし
  if (delta <= -3.0) return 100;
  if (delta <= -2.0) return 85;
  if (delta <= -1.0) return 68;
  if (delta <= -0.5) return 48;
  if (delta <= -0.2) return 28;
  return Math.round((-delta / 0.2) * 28);
}

/**
 * 価格モメンタムスコア (0〜100)
 * 直近 20 取引日（≒1ヶ月）の騰落率。
 * 価格上昇が空売り機関の含み損を拡大させ、踏み上げを加速させる。
 */
function scoreMomentum(ret) {
  if (ret == null || ret <= 0) return 0;
  if (ret >= 20) return 100;
  return Math.round((ret / 20) * 100);
}

// ─── フェーズ判定 ──────────────────────────────────────────────

/**
 * 5つのフェーズで踏み上げ局面を分類する。
 * 判定は priority 順（上が優先）。
 */
function detectPhase(agg, trend21d, momentum20d, weightedPnl, underwaterRatio) {
  const isCovering    = trend21d != null && trend21d < -0.3;
  const isBuilding    = trend21d != null && trend21d > 0.2;
  const isPriceRising = momentum20d != null && momentum20d > 4;
  const isUnderwater  = weightedPnl != null && weightedPnl < -3;
  const isDeepUW      = weightedPnl != null && weightedPnl < -8;
  const highUWRatio   = underwaterRatio > 60;

  // 踏み上げ発生: 解消進行 + 価格上昇が同時に起きている
  if (isCovering && isPriceRising) {
    return {
      key:   'squeezing',
      label: '踏み上げ発生',
      color: '#f87171',
      bg:    'rgba(248,113,113,0.08)',
      border:'rgba(248,113,113,0.25)',
      desc:  '空売り機関が買い戻しを進めながら株価が上昇。解消買いと価格上昇の連鎖が進行中です。',
    };
  }

  // トリガー局面: 大きな含み損 + 価格上昇 → 踏み上げ一歩手前
  if (isDeepUW && isPriceRising && highUWRatio) {
    return {
      key:   'triggering',
      label: 'トリガー局面',
      color: '#fb923c',
      bg:    'rgba(251,146,60,0.08)',
      border:'rgba(251,146,60,0.25)',
      desc:  '多くの空売り機関が深い含み損を抱え、さらに株価が上昇中。強制決済（踏み上げ）が誘発されやすい状態です。',
    };
  }

  // 蓄積待機: 含み損あり・解消未開始 → カタリスト待ち
  if (isUnderwater && !isCovering && highUWRatio) {
    return {
      key:   'primed',
      label: '蓄積待機中',
      color: '#fbbf24',
      bg:    'rgba(251,191,36,0.08)',
      border:'rgba(251,191,36,0.25)',
      desc:  '空売り機関が含み損を抱えたまま踏みとどまっています。株価上昇のカタリストが生じれば連鎖的な踏み上げが発生しやすい局面です。',
    };
  }

  // 積み上げ中: 残高が増加トレンド
  if (isBuilding && agg >= 1.5) {
    return {
      key:   'building',
      label: '積み上げ中',
      color: '#60a5fa',
      bg:    'rgba(96,165,250,0.08)',
      border:'rgba(96,165,250,0.25)',
      desc:  '空売り残高が増加傾向にあります。踏み上げの「燃料」が積み上げられている段階で、まだ解消の動きは始まっていません。',
    };
  }

  // 低圧力: 合算残高が少ない
  if (agg < 1.5) {
    return {
      key:   'idle',
      label: '低圧力',
      color: '#34d399',
      bg:    'rgba(52,211,153,0.08)',
      border:'rgba(52,211,153,0.25)',
      desc:  '空売り残高が低水準です。踏み上げのリスクは現時点では限定的と考えられます。',
    };
  }

  // 様子見
  return {
    key:   'neutral',
    label: '様子見',
    color: '#7a96b8',
    bg:    'rgba(122,150,184,0.08)',
    border:'rgba(122,150,184,0.25)',
    desc:  '空売り残高は存在しますが、明確なトレンドは見られません。引き続き残高変化と価格動向を注視してください。',
  };
}

// ─── ヘルパー ──────────────────────────────────────────────────

/** 合算時系列の N 取引日前との差分を返す */
function aggSeriesDelta(series, n) {
  if (series.length < 2) return null;
  const now  = series[series.length - 1].value;
  const past = series[Math.max(0, series.length - 1 - n)].value;
  return parseFloat((now - past).toFixed(3));
}

/** ローソク足の N 取引日前比騰落率 (%) を返す */
function priceMomentum(candles, n) {
  if (candles.length < 2) return null;
  const now  = candles[candles.length - 1].close;
  const past = candles[Math.max(0, candles.length - 1 - n)].close;
  if (!past) return null;
  return parseFloat(((now - past) / past * 100).toFixed(2));
}

// ─── ラベルユーティリティ ──────────────────────────────────────

/** スコア 0〜100 を色コードに変換 */
export function squeezeScoreColor(score) {
  if (score >= 75) return '#f87171';   // 赤: 高リスク
  if (score >= 55) return '#fb923c';   // オレンジ: 警戒
  if (score >= 35) return '#fbbf24';   // 黄: 注意
  return '#34d399';                    // 緑: 低リスク
}

/** スコア 0〜100 をレベル文字列に変換 */
export function squeezeScoreLabel(score) {
  if (score >= 75) return '高';
  if (score >= 55) return '中高';
  if (score >= 35) return '中';
  return '低';
}
