'use client';

import MailItem from './MailItem';

export default function MailList({
  messages = [],
  predictions = {},
  selectedIds = new Set(),
  detailSelectedId = null,
  onToggleSelect,
  onSelectAll,
  onOpen,
  onQuickTeach,
  onRemove,
  loading = false,
  nextLink = null,
  onLoadMore = null
}) {
  const allSelected = messages.length > 0 && messages.every((m) => selectedIds.has(m.id));

  return (
    <div className="mail-list-container">
      {messages.length > 0 && (
        <div className="mail-list-header">
          <label className="select-all-label">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={(e) => onSelectAll(e.target.checked)}
            />
            <span>Selecionar todos ({messages.length})</span>
          </label>
          {selectedIds.size > 0 && (
            <span className="selection-count">{selectedIds.size} selecionado(s)</span>
          )}
        </div>
      )}

      {loading && messages.length === 0 ? (
        <div className="empty">Buscando e classificando mensagens…</div>
      ) : messages.length === 0 ? (
        <div className="empty">Nenhuma mensagem encontrada nesta visualização.</div>
      ) : (
        <div className="mail-items-scroll">
          {messages.map((m) => (
            <MailItem
              key={m.id}
              message={m}
              prediction={predictions[m.id]}
              selected={selectedIds.has(m.id)}
              isSelectedInDetail={detailSelectedId === m.id}
              onToggleSelect={onToggleSelect}
              onOpen={onOpen}
              onQuickTeach={onQuickTeach}
              onRemove={onRemove}
            />
          ))}

          {nextLink && (
            <div className="load-more-wrap">
              <button
                type="button"
                className="load-more-btn"
                onClick={onLoadMore}
                disabled={loading}
              >
                {loading ? 'Carregando mais…' : 'Carregar mais mensagens'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
