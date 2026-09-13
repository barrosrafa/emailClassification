const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

const request = async (path, options = {}) => {
  const response = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Falha na comunicação com o servidor');
  return data;
};

// Autenticação
export const status = () => request('/auth/status');
export const startDeviceCode = () => request('/auth/device-code', { method: 'POST' });
export const logout = () => request('/auth/logout', { method: 'POST' });

// E-mails (Microsoft Graph)
export const listFolders = () => request('/mail/folders');

export const listMessages = ({ folder = 'inbox', top = 50, nextLink = null } = {}) => {
  const query = new URLSearchParams();
  if (folder) query.set('folder', folder);
  if (top) query.set('top', String(top));
  if (nextLink) query.set('nextLink', nextLink);
  return request(`/mail?${query.toString()}`);
};

export const getMessage = (id) => request(`/mail/${encodeURIComponent(id)}`);
export const deleteMessage = (id) => request(`/mail/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const moveMessage = (id, destinationId = 'archive') =>
  request(`/mail/${encodeURIComponent(id)}/move`, { method: 'POST', body: JSON.stringify({ destinationId }) });
export const markAsRead = (id, isRead = true) =>
  request(`/mail/${encodeURIComponent(id)}/read`, { method: 'PATCH', body: JSON.stringify({ isRead }) });

export const batchDeleteMessages = (ids = []) =>
  request('/mail/batch-delete', { method: 'POST', body: JSON.stringify({ ids }) });
export const deletePromotionalMessages = () =>
  request('/mail/delete-promotional', { method: 'POST' });

// Anexos
export const listAttachments = (messageId) => request(`/mail/${encodeURIComponent(messageId)}/attachments`);
export const downloadAttachmentUrl = (messageId, attachmentId) =>
  `${API}/mail/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`;

// Classificação & ML
export const classify = (payload) =>
  request('/classify', { method: 'POST', body: JSON.stringify(typeof payload === 'string' ? { text: payload } : payload) });
export const classifyBatch = (items) =>
  request('/classify-batch', { method: 'POST', body: JSON.stringify({ items }) });
export const learn = (payload) =>
  request('/learn', { method: 'POST', body: JSON.stringify(payload) });
export const learningStatus = () => request('/learning/status');
export const runLearning = () => request('/learning/run', { method: 'POST' });

// Auto-clean
export const runAutoClean = (options = {}) =>
  request('/auto-clean/run', { method: 'POST', body: JSON.stringify(options) });
