export default function FilterControls({
  institutions,
  filterInstitution,
  onFilterChange,
  resultCount,
  totalCount,
}) {
  return (
    <div className="filter-controls">
      <div className="filter-left">
        <label htmlFor="inst-filter">機関で絞り込み:</label>
        <select
          id="inst-filter"
          value={filterInstitution}
          onChange={(e) => onFilterChange(e.target.value)}
          className="filter-select"
        >
          <option value="">すべての機関 ({totalCount}件)</option>
          {institutions.map((inst) => (
            <option key={inst} value={inst}>
              {inst}
            </option>
          ))}
        </select>
      </div>
      <div className="filter-right">
        <span className="result-count">
          表示: <strong>{resultCount}</strong> / {totalCount} 件
        </span>
        {filterInstitution && (
          <button
            className="clear-filter-btn"
            onClick={() => onFilterChange('')}
          >
            フィルター解除
          </button>
        )}
      </div>
    </div>
  );
}
