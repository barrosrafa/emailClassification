'use client';

import { useState } from 'react';
import * as api from '../services/api';

export default function AuthPanel({ onAuthenticated }) {
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');

  const login = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.startDeviceCode();
      if (!result?.userCode) throw new Error(result?.error || 'Código não retornado.');
      setInfo(result);

      const timer = setInterval(async () => {
        try {
          const s = await api.status();
          if (s.authenticated) {
            clearInterval(timer);
            setInfo(null);
            onAuthenticated();
          }
        } catch {
          // Ignora falhas temporárias no polling
        }
      }, 2500);

      setTimeout(() => clearInterval(timer), 900000);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="auth-card">
      <div className="eyebrow">OUTLOOK / HOTMAIL</div>
      <h1>Caixa de entrada, sem ruído.</h1>
      <p>Conecte sua conta Microsoft e ensine o classificador com um clique sempre que uma mensagem for propaganda.</p>
      <button className="primary" onClick={login} disabled={loading}>
        {loading ? 'Gerando código…' : 'Conectar conta Microsoft'}
      </button>

      {info?.userCode && (
        <div className="code-box">
          <strong>{info.userCode}</strong>
          <span>{info.message}</span>
          <a href={info.verificationUri} target="_blank" rel="noreferrer">
            Abrir {info.verificationUri}
          </a>
        </div>
      )}

      {error && <p className="error">{error}</p>}
    </section>
  );
}
