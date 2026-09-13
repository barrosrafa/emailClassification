'use client';

import { useEffect, useState } from 'react';
import * as api from '../services/api';

export default function AttachmentList({ messageId }) {
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!messageId) return;
    setLoading(true);
    api.listAttachments(messageId)
      .then((data) => setAttachments(Array.isArray(data) ? data : []))
      .catch(() => setAttachments([]))
      .finally(() => setLoading(false));
  }, [messageId]);

  if (loading) return <div className="attachments-loading">Carregando anexos…</div>;
  if (!attachments.length) return null;

  return (
    <div className="attachments">
      <h4>Anexos ({attachments.length})</h4>
      <div className="attachment-pills">
        {attachments.map((att) => (
          <a
            key={att.id}
            href={api.downloadAttachmentUrl(messageId, att.id)}
            target="_blank"
            rel="noreferrer"
            download={att.name}
            className="attachment-pill"
          >
            📎 <span className="name">{att.name}</span>
            <span className="size">({(att.size / 1024).toFixed(1)} KB)</span>
          </a>
        ))}
      </div>
    </div>
  );
}
