/**
 * autoCleanService.js
 * Serviço de limpeza automática periódica para e-mails de remetentes
 * já confirmados pelo usuário como 'promocoes' ou 'spam'.
 */

const fs = require('fs');
const path = require('path');
const graph = require('./graphService');
const auth = require('./authService');

const FEEDBACK_FILE = path.resolve(__dirname, '../data/feedback.json');

async function loadConfirmedPromotionalSenders() {
  const senders = new Set();
  try {
    if (fs.existsSync(FEEDBACK_FILE)) {
      const feedback = JSON.parse(fs.readFileSync(FEEDBACK_FILE, 'utf8'));
      for (const item of feedback) {
        if (item.labelName === 'promocoes' || item.labelName === 'spam' || item.label === 1 || item.label === 2) {
          if (item.sender) senders.add(item.sender.toLowerCase());
        }
      }
    }
  } catch (err) {
    console.warn('[AutoClean] Erro ao carregar senders confirmados:', err.message);
  }
  return senders;
}

async function runAutoClean(options = {}) {
  if (!auth.isAuthenticated()) {
    return { status: 'skipped', reason: 'Não autenticado no Microsoft Graph' };
  }

  const dryRun = options.dryRun ?? (process.env.AUTO_CLEAN_DRY_RUN === 'true');
  const action = options.action || process.env.AUTO_CLEAN_ACTION || 'move';
  const minDaysOld = Number(options.minDaysOld || process.env.AUTO_CLEAN_DAYS || 7);

  const confirmedSenders = await loadConfirmedPromotionalSenders();
  const listResult = await graph.listMessages({ folder: 'inbox', top: 100 });
  const messages = listResult.messages || [];

  const candidates = messages.filter(msg => {
    const sender = (msg.from?.emailAddress?.address || '').toLowerCase();
    const receivedAt = new Date(msg.receivedDateTime);
    const daysOld = (Date.now() - receivedAt.getTime()) / (1000 * 60 * 60 * 24);
    return confirmedSenders.has(sender) && daysOld >= minDaysOld;
  });

  if (dryRun) {
    return {
      dryRun: true,
      candidates: candidates.length,
      action,
      items: candidates.map(c => ({
        id: c.id,
        subject: c.subject,
        sender: c.from?.emailAddress?.address,
        receivedDateTime: c.receivedDateTime
      }))
    };
  }

  let processedCount = 0;
  for (const msg of candidates) {
    try {
      if (action === 'move') {
        await graph.moveMessage(msg.id, 'archive');
      } else if (action === 'delete') {
        await graph.deleteMessage(msg.id);
      }
      processedCount++;
    } catch (err) {
      console.error(`[AutoClean] Falha ao processar mensagem ${msg.id}:`, err.message);
    }
  }

  return {
    dryRun: false,
    processed: processedCount,
    totalCandidates: candidates.length,
    action,
    executedAt: new Date().toISOString()
  };
}

// Agendamento periódico de auto-clean (padrão: a cada 12 horas)
const interval = Number(process.env.AUTO_CLEAN_INTERVAL_MS || 12 * 60 * 60 * 1000);
const cleanTimer = setInterval(() => {
  runAutoClean().catch(err => console.error('[AutoClean Scheduled Error]:', err.message));
}, interval);
cleanTimer.unref();

module.exports = { runAutoClean, loadConfirmedPromotionalSenders };
