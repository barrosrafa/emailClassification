require('dotenv').config();
const express = require('express');
const cors = require('cors');
const auth = require('./services/authService');
const graph = require('./services/graphService');

const app = express();
const port = Number(process.env.PORT || 3001);
const origin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
app.use(cors({ origin }));
app.use(express.json({ limit: '100kb' }));

const asyncRoute = (handler) => (req, res) => Promise.resolve(handler(req, res)).catch((error) => {
  console.error(`[${req.method} ${req.path}]`, error.message);
  res.status(error.statusCode || 500).json({ error: error.message || 'Erro interno' });
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/auth/status', (_req, res) => res.json({ authenticated: auth.isAuthenticated(), account: auth.getAccount()?.username || null }));

app.post('/api/auth/device-code', asyncRoute(async (_req, res) => {
  let codeInfo = null;
  const flow = auth.startDeviceCodeFlow((info) => { codeInfo = info; });
  // MSAL invokes the callback before the promise resolves; wait one turn for it.
  await new Promise((resolve) => setImmediate(resolve));
  if (!codeInfo) return res.status(202).json({ pending: true, message: 'Código de dispositivo gerado. Aguarde a conclusão do login.' });
  res.json(codeInfo);
  flow.catch(() => {});
}));

app.post('/api/auth/logout', (_req, res) => { auth.signOut(); res.json({ success: true }); });
app.get('/api/mail', asyncRoute(async (req, res) => res.json(await graph.listMessages(req.query.top))));
app.get('/api/mail/:id', asyncRoute(async (req, res) => res.json(await graph.getMessage(req.params.id))));
app.delete('/api/mail/:id', asyncRoute(async (req, res) => { await graph.deleteMessage(req.params.id); res.json({ success: true }); }));

app.listen(port, '0.0.0.0', () => console.log(`Backend rodando em http://localhost:${port}`));
