'use client';

import { useEffect } from 'react';

export default function Toast({ toast, onDismiss, onUndo }) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      onDismiss();
    }, toast.duration || 8000);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return null;

  return (
    <div className={`toast-banner ${toast.type || 'info'}`}>
      <span className="toast-message">{toast.message}</span>
      <div className="toast-actions">
        {toast.undoAction && (
          <button type="button" className="toast-undo" onClick={() => onUndo(toast)}>
            Desfazer
          </button>
        )}
        <button type="button" className="toast-close" onClick={onDismiss}>
          ×
        </button>
      </div>
    </div>
  );
}
