'use client';

const formatDate = (value) =>
  value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '';

const sender = (message) =>
  message.from?.emailAddress?.name || message.from?.emailAddress?.address || 'Remetente desconhecido';

const isRedCategory = (category) => category === 'spam' || category === 'promocoes';

export default function MailItem({
  message,
  prediction,
  selected,
  isSelectedInDetail,
  onToggleSelect,
  onOpen,
  onQuickTeach,
  onRemove
}) {
  const red = isRedCategory(prediction?.category);

  return (
    <article
      className={`mail ${!message.isRead ? 'unread' : ''} ${red ? 'promotional' : ''} ${
        isSelectedInDetail ? 'selected' : ''
      } ${selected ? 'checked' : ''}`}
      onClick={() => onOpen(message.id)}
    >
      <div className="mail-check-wrap" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={Boolean(selected)}
          onChange={() => onToggleSelect(message.id)}
          aria-label={`Selecionar e-mail: ${message.subject || 'sem assunto'}`}
        />
      </div>

      <div className="mail-content">
        <div className="mail-top">
          <strong title={sender(message)}>{sender(message)}</strong>
          <div className="mail-top-right">
            {message.hasAttachments && <span className="attachment-icon" title="Contém anexos">📎</span>}
            <time>{formatDate(message.receivedDateTime)}</time>
          </div>
        </div>

        <h3>{message.subject || '(sem assunto)'}</h3>
        <p>{message.bodyPreview || 'Sem prévia disponível'}</p>

        <div className="mail-bottom">
          <div className={`mail-label ${red ? 'promotional-label' : ''}`}>
            {prediction
              ? `${prediction.category}${prediction.confidence ? ` · ${Math.round(prediction.confidence * 100)}%` : ''}`
              : 'classificando…'}
          </div>

          <div className="mail-actions" onClick={(e) => e.stopPropagation()}>
            {red && onQuickTeach && (
              <button
                type="button"
                className="learn-small"
                onClick={() => onQuickTeach(message, 'promocoes')}
                title="Confirmar que é propaganda"
              >
                É propaganda
              </button>
            )}
            <button
              type="button"
              className="remove-btn"
              aria-label="Excluir e-mail"
              onClick={() => onRemove(message.id)}
            >
              ×
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
