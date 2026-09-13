'use client';

export default function FilterBar({ activeTab, onTabChange, counts = {} }) {
  const tabs = [
    { id: 'all', label: 'Todas', count: counts.all || 0 },
    { id: 'principal', label: 'Principais', count: counts.principal || 0 },
    { id: 'promocoes', label: 'Promoções', count: counts.promocoes || 0 },
    { id: 'redes_sociais', label: 'Redes Sociais', count: counts.redes_sociais || 0 },
    { id: 'unread', label: 'Não Lidos', count: counts.unread || 0 },
  ];

  return (
    <nav className="filter-bar">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label}
          {tab.count > 0 && <span className="badge">{tab.count}</span>}
        </button>
      ))}
    </nav>
  );
}
