const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const auth = require('./services/authService');
const graph = require('./services/graphService');

const app = express();
const port = Number(process.env.PORT || 3001);

const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  process.env.FRONTEND_ORIGIN
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(null, true); // Permissivo em ambiente local para evitar bloqueios indesejados
  },
  credentials: true
}));

app.use(express.json({ limit: '100kb' }));

const asyncRoute = (handler) => (req, res) => Promise.resolve(handler(req, res)).catch((error) => {
  console.error(`[${req.method} ${req.path}]`, error.message);
  res.status(error.statusCode || 500).json({ error: error.message || 'Erro interno' });
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/auth/status', (_req, res) => res.json({ authenticated: auth.isAuthenticated(), account: auth.getAccount()?.username || null }));

app.post('/api/auth/device-code', asyncRoute(async (_req, res) => {
  const codeInfo = await auth.startDeviceCodeFlow();
  res.json(codeInfo);
}));

app.post('/api/auth/logout', (_req, res) => { auth.signOut(); res.json({ success: true }); });
app.get('/api/mail', asyncRoute(async (req, res) => res.json(await graph.listMessages(req.query.top))));
app.get('/api/mail/:id', asyncRoute(async (req, res) => res.json(await graph.getMessage(req.params.id))));
app.delete('/api/mail/:id', asyncRoute(async (req, res) => { await graph.deleteMessage(req.params.id); res.json({ success: true }); }));

app.listen(port, '0.0.0.0', () => console.log(`Backend rodando em http://localhost:${port}`));
