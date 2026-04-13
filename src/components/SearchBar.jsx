import { useState } from 'react';

export default function SearchBar({ onSearch, loading }) {
  const [code, setCode] = useState('');
  const [inputError, setInputError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (!/^\d{4,5}$/.test(trimmed)) {
      setInputError('4〜5桁の数字で入力してください');
      return;
    }
    setInputError('');
    onSearch(trimmed);
  };

  const handleChange = (e) => {
    setCode(e.target.value);
    if (inputError) setInputError('');
  };

  return (
    <form className="search-bar" onSubmit={handleSubmit}>
      <div className="search-input-wrap">
        <input
          type="text"
          className={`search-input ${inputError ? 'input-error' : ''}`}
          value={code}
          onChange={handleChange}
          placeholder="銘柄コードを入力 (例: 7203)"
          maxLength={5}
          disabled={loading}
          autoFocus
        />
        <button
          type="submit"
          className="search-btn"
          disabled={loading || !code.trim()}
        >
          {loading ? '検索中...' : '検索'}
        </button>
      </div>
      {inputError && <p className="input-error-msg">{inputError}</p>}
      <div className="search-examples">
        例:{' '}
        {['7203 (トヨタ)', '9984 (ソフトバンクG)', '6758 (ソニー)', '8306 (三菱UFJ)'].map(
          (ex) => {
            const c = ex.split(' ')[0];
            return (
              <button
                key={c}
                type="button"
                className="example-btn"
                onClick={() => {
                  setCode(c);
                  setInputError('');
                  onSearch(c);
                }}
                disabled={loading}
              >
                {ex}
              </button>
            );
          }
        )}
      </div>
    </form>
  );
}
