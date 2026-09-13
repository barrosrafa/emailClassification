const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const request = async (path, options = {}) => {
  const response = await fetch(`${API}${path}`, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Falha na comunicação com o servidor');
  return data;
};
export const status = () => request('/auth/status');
export const startDeviceCode = () => request('/auth/device-code', { method: 'POST' });
export const logout = () => request('/auth/logout', { method: 'POST' });
export const listMessages = () => request('/mail');
export const getMessage = (id) => request(`/mail/${encodeURIComponent(id)}`);
export const deleteMessage = (id) => request(`/mail/${encodeURIComponent(id)}`, { method: 'DELETE' });
