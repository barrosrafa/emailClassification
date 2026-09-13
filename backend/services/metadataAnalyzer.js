/**
 * Analisador de metadados heurísticos para e-mails (Microsoft Graph).
 * Avalia remetente, cabeçalhos RFC822 (List-Unsubscribe, Precedence, X-Mailer) e densidade de links.
 */

const RULES = {
  senderPatterns: [
    { pattern: /@.*mailchimp\.com$/i, category: 'promocoes', weight: 0.9 },
    { pattern: /@news\./i, category: 'promocoes', weight: 0.85 },
    { pattern: /no-?reply@/i, category: 'promocoes', weight: 0.6 },
    { pattern: /newsletter|marketing|promo|oferta/i, category: 'promocoes', weight: 0.75 },
    { pattern: /@.*linkedin\.com$/i, category: 'redes_sociais', weight: 0.95 },
    { pattern: /@.*facebookmail\.com$/i, category: 'redes_sociais', weight: 0.95 },
    { pattern: /@.*twitter\.com|@.*x\.com$/i, category: 'redes_sociais', weight: 0.95 },
    { pattern: /@.*instagram\.com$/i, category: 'redes_sociais', weight: 0.95 },
    { pattern: /notificacoes?@.*github\.com$/i, category: 'redes_sociais', weight: 0.8 },
  ],
  headers: [
    { name: 'list-unsubscribe', category: 'promocoes', weight: 0.85 },
    { name: 'precedence', value: /bulk|list/i, category: 'promocoes', weight: 0.75 },
    { name: 'x-mailer', value: /mailchimp|sendgrid|campaign|hubspot|sendinblue|mailgun/i, category: 'promocoes', weight: 0.75 },
  ],
};

/** Vetor estável [0, 1] consumido pela entrada multimodal do TensorFlow. */
function metadataFeatureVector(message = {}) {
  const headers = Array.isArray(message.internetMessageHeaders) ? message.internetMessageHeaders : [];
  const getHeader = (name) => headers.find(h => String(h.name || '').toLowerCase() === name);
  const sender = String(message.from?.emailAddress?.address || '').toLowerCase();
  const content = String(message.body?.content || message.bodyPreview || '');
  const links = (content.match(/<a\s|https?:\/\//gi) || []).length;
  return [
    /@.*mailchimp\.com$|@news\.|newsletter|marketing|promo|oferta/i.test(sender) ? 1 : 0,
    /@.*linkedin\.com$|@.*facebookmail\.com$|@.*twitter\.com|@.*x\.com$|@.*instagram\.com$/i.test(sender) ? 1 : 0,
    getHeader('list-unsubscribe') ? 1 : 0,
    /bulk|list/i.test(getHeader('precedence')?.value || '') ? 1 : 0,
    /mailchimp|sendgrid|campaign|hubspot|sendinblue|mailgun/i.test(getHeader('x-mailer')?.value || '') ? 1 : 0,
    Math.min(links / 20, 1), Math.min(content.length / 5000, 1), /no-?reply@/i.test(sender) ? 1 : 0,
    /[!?]{2,}|URGENTE|GANHE|GRÁTIS/i.test(content) ? 1 : 0, sender ? 1 : 0,
    Math.min(headers.length / 20, 1), /unsubscribe|descadastre/i.test(content) ? 1 : 0
  ];
}

function analyzeMetadata(message = {}) {
  const signals = [];
  if (!message) return signals;

  // Avalia remetente
  const senderAddress = message.from?.emailAddress?.address || '';
  const senderName = message.from?.emailAddress?.name || '';
  const fullSender = `${senderName} <${senderAddress}>`.trim();

  for (const rule of RULES.senderPatterns) {
    if (rule.pattern.test(senderAddress) || rule.pattern.test(fullSender)) {
      signals.push({ category: rule.category, weight: rule.weight, source: 'sender' });
    }
  }

  // Avalia headers da mensagem
  const headers = Array.isArray(message.internetMessageHeaders) ? message.internetMessageHeaders : [];
  for (const rule of RULES.headers) {
    const header = headers.find(h => (h.name || '').toLowerCase() === rule.name);
    if (header && (!rule.value || rule.value.test(header.value || ''))) {
      signals.push({ category: rule.category, weight: rule.weight, source: `header:${rule.name}` });
    }
  }

  // Contagem de links no conteúdo HTML ou prévia
  const content = message.body?.content || message.bodyPreview || '';
  const linkMatches = content.match(/<a\s|https?:\/\//gi);
  const linkCount = linkMatches ? linkMatches.length : 0;
  if (linkCount > 10) {
    signals.push({ category: 'promocoes', weight: 0.5, source: 'link-count' });
  }

  return signals;
}

/**
 * Converte a lista de sinais em scores agregados por categoria entre 0 e 1.
 */
function aggregateSignals(signals = []) {
  const scores = { principal: 0, spam: 0, promocoes: 0, redes_sociais: 0 };
  for (const sig of signals) {
    if (scores[sig.category] !== undefined) {
      scores[sig.category] = Math.max(scores[sig.category], sig.weight);
    }
  }
  return scores;
}

module.exports = { RULES, analyzeMetadata, aggregateSignals, metadataFeatureVector };
