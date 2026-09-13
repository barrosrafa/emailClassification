'use client';

import { useCallback, useEffect, useState } from 'react';
import DOMPurify from 'dompurify';
import * as api from '../src/services/api';

const formatDate = (value) => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '';
const sender = (message) => message.from?.emailAddress?.name || message.from?.emailAddress?.address || 'Remetente desconhecido';

function AuthPanel({ onAuthenticated }) {
  const [loading, setLoading] = useState(false), [info, setInfo] = useState(null), [error, setError] = useState('');
  const login = async () => { setLoading(true); setError(''); try { const result = await api.startDeviceCode(); setInfo(result); if (result.userCode) { const timer = setInterval(async () => { const s = await api.status(); if (s.authenticated) { clearInterval(timer); setInfo(null); onAuthenticated(); } }, 2500); setTimeout(() => clearInterval(timer), 900000); } } catch (e) { setError(e.message); } finally { setLoading(false); } };
  return <section className="auth-card"><div className="eyebrow">OUTLOOK / HOTMAIL</div><h1>Caixa de entrada, sem ruído.</h1><p>Conecte sua conta Microsoft com OAuth seguro. O token permanece no servidor e nunca chega ao navegador.</p><button className="primary" onClick={login} disabled={loading}>{loading ? 'Gerando código…' : 'Conectar conta Microsoft'}</button>{info?.userCode && <div className="code-box"><strong>{info.userCode}</strong><span>{info.message}</span><a href={info.verificationUri} target="_blank" rel="noreferrer">Abrir microsoft.com/devicelogin</a></div>}{error && <p className="error">{error}</p>}</section>;
}

export default function Page() {
  const [auth, setAuth] = useState(null), [messages, setMessages] = useState([]), [selected, setSelected] = useState(null), [loading, setLoading] = useState(false), [error, setError] = useState('');
  const load = useCallback(async () => { setLoading(true); setError(''); try { setMessages(await api.listMessages()); } catch (e) { setError(e.message); } finally { setLoading(false); } }, []);
  useEffect(() => { api.status().then(setAuth).catch(() => setAuth({ authenticated: false })); }, []);
  useEffect(() => { if (auth?.authenticated) load(); }, [auth, load]);
  const open = async (id) => { try { setSelected(await api.getMessage(id)); } catch (e) { setError(e.message); } };
  const remove = async (id) => { if (!window.confirm('Excluir este e-mail permanentemente?')) return; try { await api.deleteMessage(id); setMessages((all) => all.filter((m) => m.id !== id)); if (selected?.id === id) setSelected(null); } catch (e) { setError(e.message); } };
  if (!auth) return <div className="center">Carregando…</div>;
  if (!auth.authenticated) return <main className="landing"><div className="brand">mail<span>desk</span></div><AuthPanel onAuthenticated={() => api.status().then(setAuth)} /></main>;
  return <div className="app"><header><div className="brand">mail<span>desk</span></div><div className="account">{auth.account}<button onClick={async () => { await api.logout(); setAuth({ authenticated: false }); }}>Sair</button></div></header><div className="toolbar"><div><div className="eyebrow">CAIXA DE ENTRADA</div><h2>{messages.length} mensagens</h2></div><button className="refresh" onClick={load}>Atualizar</button></div>{error && <div className="notice">{error}</div>}<div className="content"><aside>{loading ? <div className="empty">Buscando mensagens…</div> : messages.length === 0 ? <div className="empty">Sua caixa está vazia.</div> : messages.map((m) => <article key={m.id} className={`mail ${!m.isRead ? 'unread' : ''} ${selected?.id === m.id ? 'selected' : ''}`} onClick={() => open(m.id)}><div className="mail-top"><strong>{sender(m)}</strong><time>{formatDate(m.receivedDateTime)}</time></div><h3>{m.subject || '(sem assunto)'}</h3><p>{m.bodyPreview || 'Sem prévia disponível'}</p><button aria-label="Excluir e-mail" onClick={(e) => { e.stopPropagation(); remove(m.id); }}>×</button></article>)}</aside><section className="detail">{selected ? <><div className="detail-top"><div className="eyebrow">MENSAGEM</div><h1>{selected.subject || '(sem assunto)'}</h1><p>De <strong>{sender(selected)}</strong> · {formatDate(selected.receivedDateTime)}</p></div><div className="body" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selected.body?.content || '<p>Sem conteúdo.</p>') }} /><button className="danger" onClick={() => remove(selected.id)}>Excluir e-mail</button></> : <div className="empty detail-empty">Selecione uma mensagem para ler.</div>}</section></div></div>;
}
