const crypto = require('crypto');
const tf = require('@tensorflow/tfjs-node');

const LABELS = ['principal', 'spam', 'promocoes', 'redes_sociais'];
const MAX_SEQUENCE_LENGTH = 30;
const METADATA_FEATURES = 12;
const VOCAB = {
  '<PAD>': 0, '<START>': 1, '<UNKNOWN>': 2,
  reuniao: 3, projeto: 4, relatorio: 5, prazo: 6, equipe: 7, cliente: 8, orcamento: 9,
  aprovacao: 10, promocao: 11, desconto: 12, oferta: 13, gratis: 14, clique: 15, link: 16,
  ganhe: 17, dinheiro: 18, urgente: 19, exclusivo: 20, limitado: 21, aproveite: 22,
  facebook: 23, instagram: 24, twitter: 25, linkedin: 26, notificacao: 27, curtida: 28,
  comentario: 29, seguidor: 30, segue: 31, novo: 32, post: 33, story: 34, voce: 35, tem: 36,
  uma: 37, mensagem: 38, responda: 39, confira: 40, semana: 41, hoje: 42, amanha: 43,
  importante: 44, atencao: 45, atualize: 46, conta: 47, senha: 48, seguranca: 49,
  verifique: 50, banco: 51, transacao: 52, pagamento: 53, fatura: 54, vencimento: 55,
  boleto: 56, newsletter: 57, inscreva: 58, cadastro: 59, beneficio: 60, parabens: 61,
  ganhador: 62, premio: 63, sorteio: 64, viagem: 65, passagem: 66, hospedagem: 67,
  reserva: 68, convite: 69, evento: 70, webinar: 71, treinamento: 72, curso: 73,
  certificado: 74, matricula: 75, vaga: 76, emprego: 77, oportunidade: 78, candidatura: 79,
  curriculo: 80, sua: 81, seus: 82, por: 83, cento: 84, receber: 85, agora: 86
};

function stripHtml(text) { return String(text || '').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '); }
function preprocessText(text = '') {
  let value = stripHtml(text).normalize('NFC');
  value = value.split(/\r?\n/).filter(line => !/^\s*>/.test(line)).join('\n');
  value = value.replace(/(^|\n)--?\s*$[\s\S]*$/m, '$1').replace(/https?:\/\/\S+|www\.\S+/gi, ' URL ');
  return value;
}
function normalize(text = '') { return String(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim(); }
function tokenize(text) {
  const words = normalize(preprocessText(text)).split(/\s+/).filter(Boolean);
  const tokens = [VOCAB['<START>']];
  for (const word of words) { tokens.push(VOCAB[word] ?? VOCAB['<UNKNOWN>']); if (tokens.length >= MAX_SEQUENCE_LENGTH) break; }
  while (tokens.length < MAX_SEQUENCE_LENGTH) tokens.push(VOCAB['<PAD>']);
  return tokens;
}
function messageText(item = {}) { return typeof item === 'string' ? item : (item.text || `${item.subject || ''}\n${item.bodyPreview || ''}\n${item.body?.content || ''}`); }
function metadataVector(message = {}) {
  const headers = Array.isArray(message.internetMessageHeaders) ? message.internetMessageHeaders : [];
  const header = name => headers.find(h => String(h.name || '').toLowerCase() === name);
  const sender = String(message.from?.emailAddress?.address || '').toLowerCase();
  const content = String(message.body?.content || message.bodyPreview || '');
  const linkCount = (content.match(/<a\s|https?:\/\//gi) || []).length;
  return [
    /@.*mailchimp\.com$|@news\.|newsletter|marketing|promo|oferta/i.test(sender) ? 1 : 0,
    /@.*linkedin\.com$|@.*facebookmail\.com$|@.*twitter\.com|@.*x\.com$|@.*instagram\.com$/i.test(sender) ? 1 : 0,
    header('list-unsubscribe') ? 1 : 0, /bulk|list/i.test(header('precedence')?.value || '') ? 1 : 0,
    /mailchimp|sendgrid|campaign|hubspot|sendinblue|mailgun/i.test(header('x-mailer')?.value || '') ? 1 : 0,
    Math.min(linkCount / 20, 1), Math.min(content.length / 5000, 1), /no-?reply@/i.test(sender) ? 1 : 0,
    /[!?]{2,}|URGENTE|GANHE|GRÁTIS/i.test(content) ? 1 : 0, sender ? 1 : 0, Math.min(headers.length / 20, 1), /unsubscribe|descadastre/i.test(content) ? 1 : 0
  ];
}
function toOneHot(label) { const index = typeof label === 'number' ? label : LABELS.indexOf(label); return LABELS.map((_, i) => i === index ? 1 : 0); }
function focalLoss(gamma = 2, alpha = 0.25) {
  return (yTrue, yPred) => tf.tidy(() => tf.mean(tf.mul(tf.scalar(-alpha), tf.mul(tf.pow(tf.sub(1, yPred), gamma), tf.mul(yTrue, tf.log(tf.add(yPred, tf.scalar(1e-7))))))));
}
function createModel() {
  const textInput = tf.input({ shape: [MAX_SEQUENCE_LENGTH], name: 'tokens', dtype: 'int32' });
  const embedding = tf.layers.embedding({ inputDim: Object.keys(VOCAB).length, outputDim: 64, maskZero: true, embeddingsRegularizer: tf.regularizers.l2({ l2: 1e-4 }), name: 'embedding' }).apply(textInput);
  const recurrent = tf.layers.bidirectional({ layer: tf.layers.lstm({ units: 32, returnSequences: true, recurrentDropout: 0.2, kernelRegularizer: tf.regularizers.l2({ l2: 1e-4 }) }), mergeMode: 'concat' }).apply(embedding);
  const pooled = tf.layers.globalMaxPooling1d().apply(recurrent);
  const metaInput = tf.input({ shape: [METADATA_FEATURES], name: 'metadata' });
  const merged = tf.layers.concatenate().apply([tf.layers.dropout({ rate: 0.3 }).apply(pooled), tf.layers.layerNormalization().apply(metaInput)]);
  const hidden = tf.layers.dense({ units: 64, activation: 'relu', kernelRegularizer: tf.regularizers.l2({ l2: 1e-4 }) }).apply(merged);
  const output = tf.layers.dense({ units: LABELS.length, activation: 'softmax', name: 'category' }).apply(tf.layers.dropout({ rate: 0.3 }).apply(hidden));
  const model = tf.model({ inputs: [textInput, metaInput], outputs: output });
  model.compile({ optimizer: tf.train.adam(1e-3, undefined, undefined, 1.0), loss: 'categoricalCrossentropy', metrics: ['accuracy'] });
  return model;
}
function stratifiedSplit(data, seed = 42) {
  const groups = new Map(); data.forEach(item => { const key = String(item.label); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(item); });
  const rng = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  for (const group of groups.values()) group.sort(() => rng() - 0.5);
  const train = [], validation = [], test = [];
  for (const group of groups.values()) group.forEach((item, i) => (i % 20 < 14 ? train : i % 20 < 17 ? validation : test).push(item));
  return { train, validation, test };
}
function classWeights(data) { const counts = LABELS.map(label => data.filter(item => Number(item.label) === LABELS.indexOf(label) || item.label === label).length); const total = data.length || 1; return Object.fromEntries(LABELS.map((label, i) => [i, counts[i] ? total / (LABELS.length * counts[i]) : 1])); }
function datasetHash(data) { return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex'); }
function tensors(data) { return { xs: tf.tensor2d(data.map(item => tokenize(messageText(item))), [data.length, MAX_SEQUENCE_LENGTH]), meta: tf.tensor2d(data.map(item => metadataVector(item)), [data.length, METADATA_FEATURES]), ys: tf.tensor2d(data.map(item => toOneHot(item.label)), [data.length, LABELS.length]) }; }
module.exports = { tf, LABELS, VOCAB, MAX_SEQUENCE_LENGTH, METADATA_FEATURES, normalize, preprocessText, tokenize, messageText, metadataVector, createModel, focalLoss, stratifiedSplit, classWeights, datasetHash, tensors, toOneHot };
