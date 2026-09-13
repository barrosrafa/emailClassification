const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const auth = require('./services/authService');
const graph = require('./services/graphService');
const classifier = require('./services/classifierService');

const app = express();
const port = Number(process.env.PORT || 3001);
const allowedOrigins = ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5173', 'http://127.0.0.1:5173', process.env.FRONTEND_ORIGIN].filter(Boolean);

app.use(cors({ origin: (origin, callback) => callback(null, !origin || allowedOrigins.includes(origin) || true), credentials: true }));
app.use(express.json({ limit: '100kb' }));
const asyncRoute = (handler) => (req, res) => Promise.resolve(handler(req, res)).catch((error) => { console.error(`[${req.method} ${req.path}]`, error.message); res.status(error.statusCode || 500).json({ error: error.message || 'Erro interno' }); });

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/auth/status', (_req, res) => res.json({ authenticated: auth.isAuthenticated(), account: auth.getAccount()?.username || null }));
app.post('/api/auth/device-code', asyncRoute(async (_req, res) => res.json(await auth.startDeviceCodeFlow())));
app.post('/api/auth/logout', (_req, res) => { auth.signOut(); res.json({ success: true }); });
app.get('/api/mail', asyncRoute(async (req, res) => res.json(await graph.listMessages(req.query.top))));
app.get('/api/mail/:id', asyncRoute(async (req, res) => res.json(await graph.getMessage(req.params.id))));
app.delete('/api/mail/:id', asyncRoute(async (req, res) => { await graph.deleteMessage(req.params.id); res.json({ success: true }); }));
app.post('/api/mail/delete-promotional', asyncRoute(async (_req, res) => {
  const messages = await graph.listMessages(100);
  const classified = await Promise.all(messages.map(async (message) => ({
    message,
    prediction: await classifier.classify(`${message.subject || ''}\n${message.bodyPreview || ''}`)
  })));
  const promotional = classified.filter(({ prediction }) => classifier.isPromotionalCategory(prediction.category));
  await Promise.all(promotional.map(({ message }) => graph.deleteMessage(message.id)));
  res.json({ success: true, deleted: promotional.length, ids: promotional.map(({ message }) => message.id) });
}));

app.post('/api/classify', asyncRoute(async (req, res) => res.json(await classifier.classify(req.body.text || ''))));
app.post('/api/learn', asyncRoute(async (req, res) => res.json(await classifier.learn(req.body))));
app.get('/api/learning/status', (_req, res) => res.json(classifier.stats()));
app.post('/api/learning/run', asyncRoute(async (_req, res) => res.json(await classifier.dailyTrain())));

app.listen(port, '0.0.0.0', () => console.log(`Backend rodando em http://localhost:${port}`));
