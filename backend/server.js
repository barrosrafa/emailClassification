process.noDeprecation = true;
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const auth = require('./services/authService');
const graph = require('./services/graphService');
const classifier = require('./services/classifierService');
const trainingQueue = require('./services/trainingQueue');
const autoClean = require('./services/autoCleanService');

const app = express();
const port = Number(process.env.PORT || 3001);
const allowedOrigins = ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5173', 'http://127.0.0.1:5173', process.env.FRONTEND_ORIGIN].filter(Boolean);

app.use(cors({ origin: (origin, callback) => callback(null, !origin || allowedOrigins.includes(origin) || true), credentials: true }));
app.use(express.json({ limit: '2mb' }));

const asyncRoute = (handler) => (req, res) =>
  Promise.resolve(handler(req, res)).catch((error) => {
    console.error(`[${req.method} ${req.path}]`, error.message);
    res.status(error.statusCode || 500).json({ error: error.message || 'Erro interno' });
  });

// 1. Rotas de Autenticação e Saúde
app.get('/api/health', (_req, res) => res.json({ ok: true, timestamp: new Date().toISOString() }));

app.get('/api/auth/status', (_req, res) =>
  res.json({
    authenticated: auth.isAuthenticated(),
    account: auth.getAccount()?.username || null,
    userId: auth.getUserId()
  })
);

app.post('/api/auth/device-code', asyncRoute(async (_req, res) => res.json(await auth.startDeviceCodeFlow())));
app.post('/api/auth/logout', (_req, res) => { auth.signOut(); res.json({ success: true }); });

// 2. Rotas de Pastas e Mensagens (Microsoft Graph)
app.get('/api/mail/folders', asyncRoute(async (_req, res) => res.json(await graph.listFolders())));

app.get('/api/mail', asyncRoute(async (req, res) => {
  const { folder, top, nextLink } = req.query;
  const result = await graph.listMessages({ folder, top, nextLink });
  res.json(result);
}));

app.get('/api/mail/:id', asyncRoute(async (req, res) => res.json(await graph.getMessage(req.params.id))));

app.delete('/api/mail/:id', asyncRoute(async (req, res) => {
  await graph.deleteMessage(req.params.id);
  res.json({ success: true, id: req.params.id });
}));

app.post('/api/mail/:id/move', asyncRoute(async (req, res) => {
  const destinationId = req.body.destinationId || 'archive';
  const result = await graph.moveMessage(req.params.id, destinationId);
  res.json({ success: true, result });
}));

app.patch('/api/mail/:id/read', asyncRoute(async (req, res) => {
  const isRead = req.body.isRead !== undefined ? Boolean(req.body.isRead) : true;
  const result = await graph.markAsRead(req.params.id, isRead);
  res.json({ success: true, result });
}));

// Anexos
app.get('/api/mail/:id/attachments', asyncRoute(async (req, res) => {
  res.json(await graph.listAttachments(req.params.id));
}));

app.get('/api/mail/:id/attachments/:attachmentId', asyncRoute(async (req, res) => {
  const attachment = await graph.getAttachment(req.params.id, req.params.attachmentId);
  if (attachment.contentBytes) {
    const buffer = Buffer.from(attachment.contentBytes, 'base64');
    res.setHeader('Content-Type', attachment.contentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(attachment.name)}"`);
    return res.send(buffer);
  }
  res.json(attachment);
}));

// Deleção em lote com $batch do Graph
app.post('/api/mail/batch-delete', asyncRoute(async (req, res) => {
  const messageIds = req.body.ids || [];
  if (!Array.isArray(messageIds) || !messageIds.length) {
    return res.status(400).json({ error: 'Nenhum ID fornecido para exclusão em lote' });
  }
  const results = await graph.batchDeleteMessages(messageIds);
  res.json({ success: true, count: messageIds.length, results });
}));

app.post('/api/mail/delete-promotional', asyncRoute(async (_req, res) => {
  const listResult = await graph.listMessages({ folder: 'inbox', top: 100 });
  const messages = listResult.messages || [];
  const batchPredictions = await classifier.classifyBatch(
    messages.map((message) => ({
      id: message.id,
      text: `${message.subject || ''}\n${message.bodyPreview || ''}`,
      from: message.from,
      internetMessageHeaders: message.internetMessageHeaders
    }))
  );
  const promotional = messages.filter((message) => classifier.isPromotionalCategory(batchPredictions[message.id]?.category));
  const idsToDelete = promotional.map((m) => m.id);
  if (idsToDelete.length) {
    await graph.batchDeleteMessages(idsToDelete);
  }
  res.json({ success: true, deleted: idsToDelete.length, ids: idsToDelete });
}));

// 3. Classificação e Aprendizado
app.post('/api/classify', asyncRoute(async (req, res) => {
  const input = req.body.message || req.body.text || req.body;
  res.json(await classifier.classify(input));
}));

app.post('/api/classify-batch', asyncRoute(async (req, res) => {
  res.json(await classifier.classifyBatch(req.body.items || []));
}));

app.post('/api/learn', asyncRoute(async (req, res) => {
  const { messageId, text, label, sender } = req.body;
  const result = await classifier.learn({ messageId, text, label, sender });
  // Enfileira também na fila assíncrona
  trainingQueue.enqueue({ messageId, text, label });
  res.json(result);
}));

app.get('/api/learning/status', (_req, res) => {
  const mlStats = classifier.stats();
  const queueStats = trainingQueue.status();
  res.json({ ...mlStats, queue: queueStats });
});

app.post('/api/learning/run', asyncRoute(async (_req, res) => {
  const result = await classifier.dailyTrain();
  res.json(result);
}));

// 4. Limpeza Automática (Auto-Clean)
app.post('/api/auto-clean/run', asyncRoute(async (req, res) => {
  const options = {
    dryRun: req.body.dryRun,
    action: req.body.action,
    minDaysOld: req.body.minDaysOld
  };
  const result = await autoClean.runAutoClean(options);
  res.json(result);
}));

app.listen(port, '0.0.0.0', () => console.log(`Backend rodando em http://localhost:${port}`));
