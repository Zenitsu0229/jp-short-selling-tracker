function SortIcon({ column, sortConfig }) {
  if (sortConfig.key !== column) return <span className="sort-icon">↕</span>;
  return (
    <span className="sort-icon active">
      {sortConfig.direction === 'asc' ? '↑' : '↓'}
    </span>
  );
}

function getRatioClass(ratio) {
  const val = parseFloat(ratio);
  if (isNaN(val)) return '';
  if (val >= 1.0) return 'ratio-high';
  if (val >= 0.5) return 'ratio-mid';
  return 'ratio-low';
}

function getChangeClass(val) {
  if (!val || val === '0%' || val === '0') return '';
  if (val.startsWith('+') || (!val.startsWith('-') && parseFloat(val) > 0)) return 'change-pos';
  if (val.startsWith('-')) return 'change-neg';
  return '';
}

export default function ShortSellTable({ records, sortConfig, onSort }) {
  if (records.length === 0) {
    return <div className="no-data">該当するデータがありません</div>;
  }

  const columns = [
    { key: 'date', label: '計算日', sortable: true },
    { key: 'institution', label: '空売り機関', sortable: true },
    { key: 'ratio', label: '残高割合', sortable: true },
    { key: 'ratioChange', label: '増減率', sortable: false },
    { key: 'quantity', label: '残高数量', sortable: false },
    { key: 'quantityChange', label: '増減量', sortable: false },
    { key: 'remark', label: '備考', sortable: false },
  ];

  return (
    <div className="table-wrap">
      <table className="short-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                onClick={col.sortable ? () => onSort(col.key) : undefined}
                className={col.sortable ? 'sortable' : ''}
              >
                {col.label}
                {col.sortable && (
                  <SortIcon column={col.key} sortConfig={sortConfig} />
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((rec, idx) => (
            <tr key={idx}>
              <td className="cell-date">{rec.date}</td>
              <td className="cell-institution">{rec.institution}</td>
              <td className={`cell-ratio ${getRatioClass(rec.ratio)}`}>
                {rec.ratio}
              </td>
              <td className={`cell-change ${getChangeClass(rec.ratioChange)}`}>
                {rec.ratioChange}
              </td>
              <td className="cell-quantity">{rec.quantity}</td>
              <td className={`cell-qchange ${getChangeClass(rec.quantityChange)}`}>
                {rec.quantityChange}
              </td>
              <td className="cell-remark">{rec.remark}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
