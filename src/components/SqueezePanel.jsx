import { squeezeScoreColor, squeezeScoreLabel } from '../utils/squeezeMetrics';
import './SqueezePanel.css';

// ─── 小コンポーネント ──────────────────────────────────────────

function ScoreGauge({ score }) {
  const color = squeezeScoreColor(score);
  const label = squeezeScoreLabel(score);

  // ゲージの区切り線 (35 / 55 / 75)
  const ticks = [35, 55, 75];

  return (
    <div className="sq-gauge-wrap">
      <div className="sq-gauge-score" style={{ color }}>
        {score}
        <span className="sq-gauge-denom">/100</span>
      </div>
      <div className="sq-gauge-label" style={{ color }}>{label}</div>
      <div className="sq-gauge-bar-wrap">
        <div
          className="sq-gauge-bar-fill"
          style={{ width: `${score}%`, background: color }}
        />
        {ticks.map((t) => (
          <div
            key={t}
            className="sq-gauge-tick"
            style={{ left: `${t}%` }}
          />
        ))}
      </div>
      <div className="sq-gauge-scale">
        <span>低リスク</span>
        <span>注意</span>
        <span>警戒</span>
        <span>高リスク</span>
      </div>
    </div>
  );
}

function SubScoreBar({ label, score, color, tooltip }) {
  return (
    <div className="sq-sub-item" title={tooltip}>
      <div className="sq-sub-header">
        <span className="sq-sub-label">{label}</span>
        <span className="sq-sub-val" style={{ color }}>{score}</span>
      </div>
      <div className="sq-sub-track">
        <div
          className="sq-sub-fill"
          style={{ width: `${score}%`, background: color }}
        />
      </div>
    </div>
  );
}

function MetricPill({ label, value, sub, color, tooltip }) {
  return (
    <div className="sq-metric-pill" title={tooltip}>
      <div className="sq-metric-label">{label}</div>
      <div className="sq-metric-value" style={color ? { color } : {}}>
        {value}
      </div>
      {sub && <div className="sq-metric-sub">{sub}</div>}
    </div>
  );
}

// ─── 書式ユーティリティ ────────────────────────────────────────

function fmtPct(v, digits = 2) {
  if (v == null || isNaN(v)) return '—';
  return (v >= 0 ? '+' : '') + v.toFixed(digits) + '%';
}

function fmtRatio(v) {
  if (v == null || isNaN(v)) return '—';
  return v.toFixed(2) + '%';
}

function trendColor(v) {
  if (v == null) return undefined;
  if (v < -0.3) return '#34d399';   // 緑: 解消進行中（買い戻し）
  if (v > 0.3)  return '#f87171';   // 赤: 積み上げ中
  return '#7a96b8';
}

function momentumColor(v) {
  if (v == null) return undefined;
  if (v > 5)  return '#f87171';   // 赤: 急騰 = ショートに圧力
  if (v > 0)  return '#fb923c';
  if (v < -5) return '#34d399';   // 緑: 下落 = ショートに有利
  return '#7a96b8';
}

function pnlColor(v) {
  if (v == null) return undefined;
  return v < 0 ? '#f87171' : '#34d399';
}

function subScoreColor(score) {
  if (score >= 70) return '#f87171';
  if (score >= 45) return '#fb923c';
  if (score >= 25) return '#fbbf24';
  return '#34d399';
}

// ─── メインコンポーネント ──────────────────────────────────────

export default function SqueezePanel({ metrics }) {
  if (!metrics) return null;

  const {
    squeezeScore, phase,
    fuelScore, underwaterScore, coveringScore, momentumScore,
    aggregateRatio, activeCount, totalCount,
    weightedPnl, underwaterRatio,
    trend21d, drawdownFromPeak,
    momentum20d, momentum60d,
    maxLossInst,
    peakAgg,
  } = metrics;

  return (
    <div
      className="sq-wrap"
      style={{ borderColor: phase.border, '--phase-bg': phase.bg }}
    >
      {/* ── ヘッダー ─────────────────────────────────────── */}
      <div className="sq-header">
        <div className="sq-header-left">
          <span className="sq-title">踏み上げ分析</span>
          <span className="sq-phase-badge" style={{ color: phase.color, borderColor: phase.border, background: phase.bg }}>
            {phase.label}
          </span>
        </div>
        <span className="sq-header-hint">
          SQUEEZE INDEX — 空売り機関の損失圧力・解消進行度・価格モメンタムを統合したスコア
        </span>
      </div>

      {/* ── ボディ ───────────────────────────────────────── */}
      <div className="sq-body">

        {/* 左: スコアゲージ */}
        <div className="sq-left">
          <ScoreGauge score={squeezeScore} />

          {/* サブスコア */}
          <div className="sq-sub-scores">
            <SubScoreBar
              label="空売り燃料"
              score={fuelScore}
              color={subScoreColor(fuelScore)}
              tooltip="合算空売り残高率の水準。高いほど踏み上げ時の反発エネルギーが大きい"
            />
            <SubScoreBar
              label="水没圧力"
              score={underwaterScore}
              color={subScoreColor(underwaterScore)}
              tooltip="損失中の空売り機関が抱える加重平均含み損 × 水没比率。高いほど強制決済リスクが高い"
            />
            <SubScoreBar
              label="解消進行"
              score={coveringScore}
              color={subScoreColor(coveringScore)}
              tooltip="直近 約1ヶ月の合算残高変化。減少（買い戻し）が進んでいるほど高スコア"
            />
            <SubScoreBar
              label="価格モメンタム"
              score={momentumScore}
              color={subScoreColor(momentumScore)}
              tooltip="直近 約1ヶ月の株価騰落率。上昇が空売りの含み損を拡大させ踏み上げを加速させる"
            />
          </div>
        </div>

        {/* 右: メトリクス詳細 */}
        <div className="sq-right">
          <div className="sq-metrics-grid">
            <MetricPill
              label="合算残高率"
              value={fmtRatio(aggregateRatio)}
              sub={`ピーク ${fmtRatio(peakAgg)}`}
              color={aggregateRatio >= 3 ? '#f87171' : aggregateRatio >= 2 ? '#fbbf24' : undefined}
              tooltip="アクティブな全機関の空売り残高割合の合計"
            />
            <MetricPill
              label="活発機関"
              value={`${activeCount} 社`}
              sub={`(解消含 ${totalCount} 社)`}
              tooltip="現在アクティブな空売り機関数"
            />
            <MetricPill
              label="加重平均含み損"
              value={fmtPct(weightedPnl)}
              sub={weightedPnl < 0 ? '空売り機関が損失中' : weightedPnl > 0 ? '空売り機関が利益中' : ''}
              color={pnlColor(weightedPnl)}
              tooltip="残高割合で加重した機関の平均 PnL。負の値 = 含み損（価格上昇で踏み上げ圧力）"
            />
            <MetricPill
              label="水没比率"
              value={`${underwaterRatio.toFixed(0)}%`}
              sub="損失中機関の残高割合"
              color={underwaterRatio > 60 ? '#f87171' : underwaterRatio > 30 ? '#fbbf24' : undefined}
              tooltip="合算残高のうち、含み損を抱えている機関が占める割合"
            />
            <MetricPill
              label="残高 1M 変化"
              value={fmtPct(trend21d)}
              sub={trend21d < 0 ? '解消進行中' : trend21d > 0 ? '積み上げ中' : ''}
              color={trendColor(trend21d)}
              tooltip="直近 21 取引日（≒1ヶ月）の合算残高変化量。負 = 解消（買い戻し）が進行"
            />
            <MetricPill
              label="株価 1M 騰落"
              value={fmtPct(momentum20d)}
              sub={momentum60d != null ? `3M: ${fmtPct(momentum60d)}` : ''}
              color={momentumColor(momentum20d)}
              tooltip="直近 20 取引日（≒1ヶ月）の株価騰落率"
            />
          </div>

          {/* 最大含み損機関 */}
          {maxLossInst && maxLossInst.pnlPct < 0 && (
            <div className="sq-worst-inst">
              <span className="sq-worst-label">最大含み損機関</span>
              <span className="sq-worst-name">{maxLossInst.institution}</span>
              <span className="sq-worst-pnl" style={{ color: '#f87171' }}>
                {fmtPct(maxLossInst.pnlPct)}
              </span>
            </div>
          )}

          {/* ピーク比解消率 */}
          {drawdownFromPeak > 0 && (
            <div className="sq-drawdown">
              <span className="sq-drawdown-label">ピーク比解消率</span>
              <div className="sq-drawdown-bar-wrap">
                <div
                  className="sq-drawdown-fill"
                  style={{ width: `${Math.min(drawdownFromPeak, 100)}%` }}
                />
              </div>
              <span className="sq-drawdown-val">{drawdownFromPeak.toFixed(1)}%</span>
            </div>
          )}
        </div>
      </div>

      {/* ── フェーズ説明 ─────────────────────────────────── */}
      <div className="sq-phase-desc" style={{ borderTopColor: phase.border }}>
        <span className="sq-phase-icon" style={{ color: phase.color }}>■</span>
        <span className="sq-phase-text">{phase.desc}</span>
        <span className="sq-disclaimer">
          ※ このスコアは機械的な分析指標であり、投資判断の参考情報です。実際の投資は自己判断で行ってください。
        </span>
      </div>
    </div>
  );
}
