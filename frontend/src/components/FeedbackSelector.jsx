'use client';

export default function FeedbackSelector({ currentLabel, onSelect, disabled = false }) {
  const options = [
    { value: 'principal', label: 'Principal', icon: '🏠' },
    { value: 'spam', label: 'Spam', icon: '⚠️' },
    { value: 'promocoes', label: 'Promoções', icon: '🏷️' },
    { value: 'redes_sociais', label: 'Redes Sociais', icon: '📱' },
  ];

  return (
    <div className="feedback-selector">
      <span className="selector-title">Ensinar categoria correta:</span>
      <div className="selector-buttons">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`feedback-btn ${currentLabel === opt.value ? 'active' : ''}`}
            onClick={() => onSelect(opt.value)}
            disabled={disabled}
          >
            <span className="icon">{opt.icon}</span> {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
