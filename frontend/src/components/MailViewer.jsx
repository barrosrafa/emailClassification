'use client';

import DOMPurify from 'dompurify';
import FeedbackSelector from './FeedbackSelector';
import AttachmentList from './AttachmentList';

const formatDate = (value) =>
  value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(value)) : '';

const sender = (message) =>
  message?.from?.emailAddress?.name
    ? `${message.from.emailAddress.name} <${message.from.emailAddress.address || ''}>`
    : message?.from?.emailAddress?.address || 'Remetente desconhecido';

export default function MailViewer({
  message,
  prediction,
  onTeach,
  onRemove,
  onMove,
  onToggleRead,
  loadingAction = false
}) {
  if (!message) {
    return (
      <section className="detail">
        <div className="empty detail-empty">Selecione uma mensagem para ler.</div>
      </section>
    );
  }

  const currentCategory = prediction?.category || message.classification?.category || 'principal';

  return (
    <section className="detail">
      <div className="detail-top">
        <div className="eyebrow">
          MENSAGEM · Categoria: <strong className="category-tag">{currentCategory.toUpperCase()}</strong>
          {prediction?.confidence && ` (${Math.round(prediction.confidence * 100)}%)`}
        </div>
        <h1>{message.subject || '(sem assunto)'}</h1>
        <p className="sender-meta">
          De <strong>{sender(message)}</strong> · {formatDate(message.receivedDateTime)}
        </p>

        {/* Barra de Ações Rápidas do E-mail */}
        <div className="mail-quick-actions">
          <button
            type="button"
            className="action-btn"
            onClick={() => onToggleRead(message.id, !message.isRead)}
            disabled={loadingAction}
          >
            {message.isRead ? '✉️ Marcar como não lido' : '📖 Marcar como lido'}
          </button>
          <button
            type="button"
            className="action-btn"
            onClick={() => onMove(message.id, 'archive')}
            disabled={loadingAction}
          >
            📂 Mover para Arquivo
          </button>
          <button
            type="button"
            className="action-btn"
            onClick={() => onMove(message.id, 'junkemail')}
            disabled={loadingAction}
          >
            🗑️ Mover para Lixo
          </button>
          <button
            type="button"
            className="action-btn danger-btn"
            onClick={() => onRemove(message.id)}
            disabled={loadingAction}
          >
            Excluir permanentemente
          </button>
        </div>
      </div>

      {/* Lista de Anexos */}
      {message.hasAttachments && <AttachmentList messageId={message.id} />}

      {/* Corpo Sanitizado */}
      <div
        className="body"
        dangerouslySetInnerHTML={{
          __html: DOMPurify.sanitize(message.body?.content || message.bodyPreview || '<p>Sem conteúdo.</p>')
        }}
      />

      {/* Feedback Bidirecional com 4 Categorias */}
      <div className="detail-feedback-section">
        <FeedbackSelector
          currentLabel={currentCategory}
          onSelect={(label) => onTeach(message, label)}
          disabled={loadingAction}
        />
      </div>
    </section>
  );
}
