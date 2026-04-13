import { useEffect, useRef, useMemo } from 'react';
import {
  createChart,
  CrosshairMode,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createSeriesMarkers,
} from 'lightweight-charts';
import {
  buildColorMap,
  buildAggregateSeries,
  buildInstitutionMarkers,
} from '../utils/analysis';
import './CandlestickChart.css';

const RANGES = [
  { value: '6mo', label: '6M' },
  { value: '1y',  label: '1Y' },
  { value: '2y',  label: '2Y' },
  { value: '5y',  label: '5Y' },
  { value: 'max', label: 'ALL' },
];

export default function CandlestickChart({
  candles,
  records,
  selectedInstitution,
  range,
  onRangeChange,
}) {
  const containerRef    = useRef(null);
  const chartRef        = useRef(null);
  const candleSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const ratioSeriesRef  = useRef(null);
  const markersRef      = useRef(null);
  const tooltipRef      = useRef(null);

  const colorMap = useMemo(() => buildColorMap(records), [records]);

  // ── チャート初期化（マウント時のみ）────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: '#131722' },
        textColor:  '#9598a1',
        fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
        fontSize:   12,
      },
      grid: {
        vertLines: { color: '#1c2333' },
        horzLines: { color: '#1c2333' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#4b5563', labelBackgroundColor: '#374151' },
        horzLine: { color: '#4b5563', labelBackgroundColor: '#374151' },
      },
      rightPriceScale: {
        borderColor: '#1f2937',
        scaleMargins: { top: 0.05, bottom: 0.28 }, // ローソク足エリア
        textColor: '#9598a1',
      },
      timeScale: {
        borderColor: '#1f2937',
        timeVisible:    true,
        secondsVisible: false,
        rightOffset:    5,
        barSpacing:     6,
        minBarSpacing:  2,
      },
      localization: {
        priceFormatter: (p) => '¥' + Math.round(p).toLocaleString('ja-JP'),
        timeFormatter: (t) => {
          const d = new Date(t * 1000);
          return `${d.getUTCFullYear()}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${String(d.getUTCDate()).padStart(2,'0')}`;
        },
      },
    });

    // ── ローソク足 ───────────────────────────────────────
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor:       '#22c55e',
      downColor:     '#ef4444',
      borderVisible: false,
      wickUpColor:   '#22c55e',
      wickDownColor: '#ef4444',
    });

    // ── 出来高（最下部15%） ──────────────────────────────
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat:  { type: 'volume' },
      priceScaleId: 'vol',
    });
    chart.priceScale('vol').applyOptions({
      scaleMargins: { top: 0.87, bottom: 0.01 },
    });

    // ── 合算空売り残高折れ線（下部サブパネル）────────────
    const ratioSeries = chart.addSeries(LineSeries, {
      color:                '#f59e0b',
      lineWidth:            2,
      priceScaleId:         'ratio',
      priceFormat: {
        type:      'custom',
        formatter: (p) => p.toFixed(2) + '%',
        minMove:   0.001,
      },
      crosshairMarkerVisible:  true,
      crosshairMarkerRadius:   4,
      crosshairMarkerBorderColor: '#f59e0b',
      crosshairMarkerBackgroundColor: '#f59e0b',
      lastValueVisible:  true,
      priceLineVisible:  false,
    });
    chart.priceScale('ratio').applyOptions({
      scaleMargins: { top: 0.73, bottom: 0.13 }, // 折れ線エリア（出来高の上）
      borderColor:  '#1f2937',
      textColor:    '#f59e0b',
    });

    // ── マーカープリミティブ ─────────────────────────────
    const markersPrimitive = createSeriesMarkers(candleSeries, []);

    // ── OHLC ツールチップ ────────────────────────────────
    chart.subscribeCrosshairMove((param) => {
      const el = tooltipRef.current;
      if (!el) return;
      if (!param.time || !param.point) { el.style.opacity = '0'; return; }

      const c = param.seriesData.get(candleSeries);
      const r = param.seriesData.get(ratioSeries);
      if (!c) { el.style.opacity = '0'; return; }

      const d    = new Date(param.time * 1000);
      const date = `${d.getUTCFullYear()}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${String(d.getUTCDate()).padStart(2,'0')}`;
      const chg  = c.open ? ((c.close - c.open) / c.open * 100).toFixed(2) : '0.00';
      const col  = c.close >= c.open ? '#22c55e' : '#ef4444';
      const ratioHtml = r != null
        ? `<div class="tt-row tt-ratio"><span>合算残高</span><span style="color:#f59e0b;font-weight:700">${r.value.toFixed(2)}%</span></div>`
        : '';

      el.innerHTML = `
        <div class="tt-date">${date}</div>
        <div class="tt-row"><span>始値</span><span>¥${Math.round(c.open).toLocaleString()}</span></div>
        <div class="tt-row"><span>高値</span><span style="color:#22c55e">¥${Math.round(c.high).toLocaleString()}</span></div>
        <div class="tt-row"><span>安値</span><span style="color:#ef4444">¥${Math.round(c.low).toLocaleString()}</span></div>
        <div class="tt-row"><span>終値</span><span style="color:${col}">¥${Math.round(c.close).toLocaleString()}</span></div>
        <div class="tt-change" style="color:${col}">${chg >= 0 ? '+' : ''}${chg}%</div>
        ${ratioHtml}
      `;
      el.style.opacity = '1';
    });

    chartRef.current        = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    ratioSeriesRef.current  = ratioSeries;
    markersRef.current      = markersPrimitive;

    const ro = new ResizeObserver(() => {
      if (containerRef.current)
        chart.applyOptions({ width: containerRef.current.clientWidth });
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = candleSeriesRef.current = volumeSeriesRef.current =
        ratioSeriesRef.current = markersRef.current = null;
    };
  }, []);

  // ── ローソク足 + 出来高 + 合算折れ線 更新 ─────────────
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current || !ratioSeriesRef.current) return;
    if (!candles.length) return;

    candleSeriesRef.current.setData(candles);

    volumeSeriesRef.current.setData(
      candles.map((c) => ({
        time:  c.time,
        value: c.volume,
        color: c.close >= c.open ? '#22c55e22' : '#ef444422',
      }))
    );

    const aggSeries = buildAggregateSeries(records, candles);
    ratioSeriesRef.current.setData(aggSeries);

    chartRef.current.timeScale().fitContent();
  }, [candles, records]);

  // ── 機関選択によるマーカー更新 ───────────────────────
  useEffect(() => {
    if (!markersRef.current) return;
    const markers = buildInstitutionMarkers(selectedInstitution, records, candles);
    markersRef.current.setMarkers(markers);
  }, [selectedInstitution, records, candles]);

  return (
    <div className="cc-wrap">
      {/* ヘッダー */}
      <div className="cc-header">
        <div className="cc-header-left">
          <span className="cc-title">株価チャート</span>
          {selectedInstitution ? (
            <span className="cc-inst-badge" style={{ background: colorMap[selectedInstitution] + '33', color: colorMap[selectedInstitution], borderColor: colorMap[selectedInstitution] + '66' }}>
              {selectedInstitution} のマーカー表示中
            </span>
          ) : (
            <span className="cc-hint">↓ 機関をクリックするとエントリー/解消ポイントを表示</span>
          )}
        </div>
        <div className="cc-ranges">
          {RANGES.map((r) => (
            <button
              key={r.value}
              className={`cc-range-btn ${range === r.value ? 'active' : ''}`}
              onClick={() => onRangeChange(r.value)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* チャート本体 */}
      <div className="cc-chart-wrap">
        <div ref={containerRef} className="cc-chart" />
        <div ref={tooltipRef} className="cc-tooltip" style={{ opacity: 0 }} />
        {/* サブパネルラベル */}
        <div className="cc-sublabel-ratio">合算空売り残高%</div>
        <div className="cc-sublabel-vol">出来高</div>
      </div>

      {/* マーカー凡例（選択中のみ） */}
      {selectedInstitution && (
        <div className="cc-marker-legend">
          <span className="cc-marker-item entry">
            <span className="arrow-down">▼</span> 新規・売増（空売り増加）
          </span>
          <span className="cc-marker-item exit">
            <span className="arrow-up">▲</span> 返済・解消（ポジション縮小）
          </span>
        </div>
      )}
    </div>
  );
}
