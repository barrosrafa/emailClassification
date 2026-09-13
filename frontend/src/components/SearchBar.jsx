'use client';

import { useState, useMemo } from 'react';

export default function SearchBar({ onSearch, onSort, currentSort = 'date-desc' }) {
  const [query, setQuery] = useState('');

  const handleQueryChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    onSearch(val);
  };

  return (
    <div className="search-bar">
      <input
        type="text"
        placeholder="Pesquisar por assunto, remetente ou texto..."
        value={query}
        onChange={handleQueryChange}
        className="search-input"
      />
      <select
        value={currentSort}
        onChange={(e) => onSort(e.target.value)}
        className="sort-select"
      >
        <option value="date-desc">Mais recentes</option>
        <option value="date-asc">Mais antigos</option>
        <option value="sender-asc">Remetente (A-Z)</option>
        <option value="sender-desc">Remetente (Z-A)</option>
      </select>
    </div>
  );
}
