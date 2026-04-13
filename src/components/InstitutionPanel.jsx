import { useMemo, useState } from 'react';
import { buildColorMap } from '../utils/analysis';
import './InstitutionPanel.css';

function fmtPrice(p) {
  if (p == null || isNaN(p)) return '—';
  return '¥' + Math.round(p).toLocaleString('ja-JP');
}

function fmtRatio(r) {
  if (r == null || isNaN(r)) return '—';
  return r.toFixed(3) + '%';
}

function PnlBadge({ pct }) {
  if (pct == null || isNaN(pct)) return <span className="pnl-na">—</span>;
  const pos = pct >= 0;
  return (
    <span className={`pnl-badge ${pos ? 'profit' : 'loss'}`}>
      {pos ? '+' : ''}{pct.toFixed(2)}%
    </span>
  );
}

function RatioBar({ value, maxPeak }) {
  const pct = maxPeak > 0 ? Math.min((value / maxPeak) * 100, 100) : 0;
  return (
    <div className="ratio-bar-wrap">
      <div className="ratio-bar-track">
        <div className="ratio-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="ratio-bar-val">{fmtRatio(value)}</span>
    </div>
  );
}

const SORT_OPTIONS = [
  { value: 'latest',    label: '最新残高' },
  { value: 'peak',      label: 'ピーク' },
  { value: 'firstDate', label: '参入日' },
  { value: 'pnl',       label: '損益率' },
];

export default function InstitutionPanel({
  stats,
  records,
  selectedInstitution,
  onSelect,
}) {
  const [sortBy,      setSortBy]      = useState('latest');
  const [showExited,  setShowExited]  = useState(true);

  const colorMap = useMemo(() => buildColorMap(records), [records]);

  const sorted = useMemo(() => {
    const list = showExited ? stats : stats.filter((s) => !s.isExited);
    return [...list].sort((a, b) => {
      switch (sortBy) {
        case 'latest':    return b.latestRatio - a.latestRatio;
        case 'peak':      return b.peakRatio - a.peakRatio;
        case 'firstDate': return a.firstDate.localeCompare(b.firstDate);
        case 'pnl':       return (b.pnlPct ?? -999) - (a.pnlPct ?? -999);
        default:          return 0;
      }
    });
  }, [stats, sortBy, showExited]);

  const activeCount  = stats.filter((s) => !s.isExited).length;
  const exitedCount  = stats.filter((s) =>  s.isExited).length;
  const currentPrice = stats[0]?.currentPrice;
  const maxPeak      = stats.length ? Math.max(...stats.map((s) => s.peakRatio)) : 0;

  const handleRowClick = (institution) => {
    // 同じ機関を再クリック → 選択解除
    onSelect(selectedInstitution === institution ? null : institution);
  };

  return (
    <div className="ip-wrap">
      {/* ヘッダー */}
      <div className="ip-header">
        <div className="ip-title-area">
          <span className="ip-title">参入機関一覧</span>
          <span className="ip-click-hint">行をクリックするとチャートにマーカーを表示</span>
        </div>

        <div className="ip-summary">
          <div className="ip-stat">
            <span className="ip-stat-label">アクティブ</span>
            <span className="ip-stat-val active">{activeCount}</span>
          </div>
          <div className="ip-stat">
            <span className="ip-stat-label">解消済</span>
            <span className="ip-stat-val muted">{exitedCount}</span>
          </div>
          {currentPrice && (
            <div className="ip-stat">
              <span className="ip-stat-label">現在株価</span>
              <span className="ip-stat-val">{fmtPrice(currentPrice)}</span>
            </div>
          )}
        </div>

        <div className="ip-toolbar">
          <label className="ip-toggle">
            <input
              type="checkbox"
              checked={showExited}
              onChange={(e) => setShowExited(e.target.checked)}
            />
            解消済みを表示
          </label>
          <select
            className="ip-sort-sel"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}順</option>
            ))}
          </select>
        </div>
      </div>

      {/* テーブル */}
      <div className="ip-table-wrap">
        <table className="ip-table">
          <thead>
            <tr>
              <th style={{ width: 28 }} />
              <th>機関名</th>
              <th>ステータス</th>
              <th>参入日</th>
              <th>最終報告</th>
              <th>現在残高</th>
              <th>ピーク</th>
              <th>平均建値</th>
              <th>損益率 <span className="th-note">(空売)</span></th>
              <th>回数</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => {
              const color      = colorMap[s.institution] ?? '#94a3b8';
              const isSelected = selectedInstitution === s.institution;

              return (
                <tr
                  key={s.institution}
                  className={[
                    s.isExited   ? 'row-exited'   : '',
                    isSelected   ? 'row-selected'  : '',
                  ].join(' ')}
                  onClick={() => handleRowClick(s.institution)}
                  title="クリックしてマーカーを表示"
                >
                  {/* 選択インジケーター */}
                  <td className="cell-indicator">
                    {isSelected && <span className="selected-bar" style={{ background: color }} />}
                  </td>

                  <td>
                    <div className="inst-name-cell">
                      <span className="inst-dot" style={{ background: color }} />
                      <span className="inst-name">{s.institution}</span>
                    </div>
                  </td>

                  <td>
                    <span className={`status-badge ${s.isExited ? 'exited' : 'active'}`}>
                      {s.isExited ? '解消済' : 'アクティブ'}
                    </span>
                  </td>

                  <td className="cell-date">{s.firstDate}</td>
                  <td className="cell-date">{s.lastDate}</td>

                  <td>
                    <RatioBar value={s.latestRatio} maxPeak={maxPeak} />
                  </td>

                  <td className="cell-peak">{fmtRatio(s.peakRatio)}</td>
                  <td className="cell-price">{fmtPrice(s.avgEntryPrice)}</td>
                  <td><PnlBadge pct={s.isExited ? null : s.pnlPct} /></td>
                  <td className="cell-count">{s.entryCount}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="ip-note">
        ※ 平均建値は新規・売増報告日の終値を残高変化量で加重平均したものです。損益率は現在株価との比較（解消済みは非表示）。
      </p>
    </div>
  );
}
