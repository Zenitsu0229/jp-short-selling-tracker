import { useState, useCallback } from 'react';
import SearchBar from './components/SearchBar';
import ShortSellTable from './components/ShortSellTable';
import FilterControls from './components/FilterControls';
import CandlestickChart from './components/CandlestickChart';
import InstitutionPanel from './components/InstitutionPanel';
import SqueezePanel from './components/SqueezePanel';
import { fetchShortSelling } from './api/karauri';
import { fetchOHLCV } from './api/yahoo';
import { calcInstitutionStats } from './utils/analysis';
import { calcSqueezeMetrics } from './utils/squeezeMetrics';
import './App.css';

export default function App() {
  const [loading,      setLoading]      = useState(false);
  const [chartLoading, setChartLoading] = useState(false);
  const [error,        setError]        = useState('');
  const [chartError,   setChartError]   = useState('');
  const [data,         setData]         = useState(null);   // { stockName, stockCode, records }
  const [candles,      setCandles]      = useState([]);
  const [filterInst,   setFilterInst]   = useState('');
  const [sortConfig,   setSortConfig]   = useState({ key: 'date', direction: 'desc' });
  const [chartRange,        setChartRange]        = useState('2y');
  const [currentCode,       setCurrentCode]       = useState('');
  const [selectedInstitution, setSelectedInstitution] = useState(null);

  const loadChart = useCallback(async (code, range) => {
    setChartLoading(true);
    setChartError('');
    try {
      const ohlcv = await fetchOHLCV(code, range);
      setCandles(ohlcv);
    } catch (e) {
      setChartError(e.message);
      setCandles([]);
    } finally {
      setChartLoading(false);
    }
  }, []);

  const handleSearch = async (code) => {
    setLoading(true);
    setError('');
    setData(null);
    setCandles([]);
    setFilterInst('');
    setSelectedInstitution(null);
    setCurrentCode(code);

    try {
      const [shortData] = await Promise.all([
        fetchShortSelling(code),
        loadChart(code, chartRange),
      ]);
      setData(shortData);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRangeChange = (range) => {
    setChartRange(range);
    if (currentCode) loadChart(currentCode, range);
  };

  // 機関一覧・平均建値などの統計
  const institutionStats = data && candles.length
    ? calcInstitutionStats(data.records, candles)
    : [];

  // 踏み上げ分析指標
  const squeezeMetrics = data && candles.length && institutionStats.length
    ? calcSqueezeMetrics(data.records, candles, institutionStats)
    : null;

  // フィルター対象の records
  const filteredRecords = data
    ? data.records
        .filter((r) => !filterInst || r.institution === filterInst)
        .sort((a, b) => {
          const dir = sortConfig.direction === 'asc' ? 1 : -1;
          if (sortConfig.key === 'date')
            return a.date.localeCompare(b.date) * dir;
          if (sortConfig.key === 'ratio')
            return (parseFloat(a.ratio) - parseFloat(b.ratio)) * dir;
          if (sortConfig.key === 'institution')
            return a.institution.localeCompare(b.institution, 'ja') * dir;
          return 0;
        })
    : [];

  // チャートマーカー用 records（フィルター反映）
  const chartRecords = data
    ? data.records.filter((r) => !filterInst || r.institution === filterInst)
    : [];

  // テーブルフィルター用 機関一覧
  const institutions = data
    ? [...new Set(data.records.map((r) => r.institution).filter(Boolean))]
    : [];

  const handleSort = (key) => {
    setSortConfig((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'desc' }
    );
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-brand">
          <div className="header-logo">S</div>
          <h1>空売り残高トラッカー</h1>
          <div className="header-divider" />
          <span className="subtitle">
            データ元:{' '}
            <a href="https://karauri.net/" target="_blank" rel="noreferrer">karauri.net</a>
          </span>
        </div>
        <span className="header-badge">BETA</span>
      </header>

      <main className="app-main">
        <SearchBar onSearch={handleSearch} loading={loading} />

        {error && <div className="error-box">{error}</div>}

        {loading && (
          <div className="loading">
            <div className="spinner" />
            <span>データを取得中...</span>
          </div>
        )}

        {data && (
          <>
            {/* 銘柄タイトル */}
            <div className="stock-info">
              <div>
                <h2>
                  {data.stockName}
                  <span className="stock-code"> {data.stockCode}</span>
                </h2>
                <p className="stock-sub">
                  空売り報告 {data.records.length} 件 / {institutions.length} 機関
                </p>
              </div>
              <div className="stock-meta-pills">
                <div className="meta-pill">
                  <span className="meta-pill-label">Reports</span>
                  <span className="meta-pill-value">{data.records.length}</span>
                </div>
                <div className="meta-pill">
                  <span className="meta-pill-label">Institutions</span>
                  <span className="meta-pill-value">{institutions.length}</span>
                </div>
              </div>
            </div>

            {/* 踏み上げ分析パネル */}
            <SqueezePanel metrics={squeezeMetrics} />

            {/* チャートエリア */}
            <div className="chart-outer">
              {chartLoading && (
                <div className="chart-overlay">
                  <div className="spinner" />
                  <span>株価データ取得中...</span>
                </div>
              )}
              {chartError && (
                <div className="error-box">チャート: {chartError}</div>
              )}
              {candles.length > 0 && (
                <CandlestickChart
                  candles={candles}
                  records={data.records}
                  selectedInstitution={selectedInstitution}
                  range={chartRange}
                  onRangeChange={handleRangeChange}
                />
              )}
            </div>

            {/* 機関一覧パネル */}
            {institutionStats.length > 0 && (
              <InstitutionPanel
                stats={institutionStats}
                records={data.records}
                selectedInstitution={selectedInstitution}
                onSelect={setSelectedInstitution}
              />
            )}

            {/* 空売りデータテーブル */}
            {data.records.length === 0 ? (
              <div className="no-data">空売り残高データがありません</div>
            ) : (
              <>
                <FilterControls
                  institutions={institutions}
                  filterInstitution={filterInst}
                  onFilterChange={setFilterInst}
                  resultCount={filteredRecords.length}
                  totalCount={data.records.length}
                />
                <ShortSellTable
                  records={filteredRecords}
                  sortConfig={sortConfig}
                  onSort={handleSort}
                />
              </>
            )}

            {data.warning && <div className="warning-box">{data.warning}</div>}
          </>
        )}
      </main>
    </div>
  );
}
