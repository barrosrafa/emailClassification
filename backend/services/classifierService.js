const fs = require('fs');
const path = require('path');
const tf = require('@tensorflow/tfjs-node');

const DATA_DIR = path.resolve(__dirname, '../data');
const MODEL_DIR = path.join(DATA_DIR, 'modelo-email');
const FEEDBACK_FILE = path.join(DATA_DIR, 'feedback.json');
const MAX_SEQUENCE_LENGTH = 30;
const LABELS = ['principal', 'spam', 'promocoes', 'redes_sociais'];
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

const SEED = [
  ['reuniao de equipe amanha para discutir projeto', 0], ['relatorio mensal de vendas prazo entrega', 0],
  ['aprovacao do orcamento do projeto', 0], ['cliente solicitou alteracao no prazo', 0],
  ['atencao importante sobre reuniao diretoria', 0], ['voce ganhou um premio clique aqui para resgatar', 1],
  ['urgente atualize seus dados bancarios agora', 1], ['ganhe dinheiro facil trabalhando em casa', 1],
  ['seu boleto vence hoje clique para pagar', 1], ['parabens voce foi sorteado responda', 1],
  ['promocao exclusiva desconto de 50 por cento aproveite', 2], ['oferta limitada inscreva se newsletter', 2],
  ['confira novidades da semana em nossa loja', 2], ['curso online com certificado matricula aberta', 2],
  ['desconto especial para clientes cadastre se', 2], ['voce tem uma nova notificacao no facebook', 3],
  ['alguem curtiu sua foto no instagram', 3], ['novo seguidor no twitter confira perfil', 3],
  ['comentario na sua publicacao do linkedin', 3], ['mensagem direta no instagram responda', 3]
].map(([text, label]) => ({ text, label }));

let modelPromise = null;
let trainingPromise = null;

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FEEDBACK_FILE)) fs.writeFileSync(FEEDBACK_FILE, '[]\n');
}

function normalize(text = '') {
  return String(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ');
}

function tokenize(text) {
  const words = normalize(text).split(/\s+/).filter(Boolean);
  const tokens = [VOCAB['<START>']];
  for (const word of words) {
    tokens.push(VOCAB[word] ?? VOCAB['<UNKNOWN>']);
    if (tokens.length >= MAX_SEQUENCE_LENGTH) break;
  }
  while (tokens.length < MAX_SEQUENCE_LENGTH) tokens.push(VOCAB['<PAD>']);
  return tokens;
}

function readFeedback() {
  ensureDataDir();
  try { return JSON.parse(fs.readFileSync(FEEDBACK_FILE, 'utf8')); } catch { return []; }
}

function writeFeedback(items) {
  ensureDataDir();
  fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(items, null, 2) + '\n');
}

function createModel() {
  const model = tf.sequential();
  model.add(tf.layers.embedding({ inputDim: Object.keys(VOCAB).length, outputDim: 32, inputLength: MAX_SEQUENCE_LENGTH }));
  model.add(tf.layers.lstm({ units: 32 }));
  model.add(tf.layers.dropout({ rate: 0.3 }));
  model.add(tf.layers.dense({ units: 16, activation: 'relu' }));
  model.add(tf.layers.dense({ units: LABELS.length, activation: 'softmax' }));
  model.compile({ optimizer: tf.train.adam(0.001), loss: 'categoricalCrossentropy', metrics: ['accuracy'] });
  return model;
}

async function trainModel(extra = [], epochs = 18) {
  const data = [...SEED, ...readFeedback().map(item => ({ text: item.text, label: item.label })), ...extra];
  const xs = tf.tensor2d(data.map(item => tokenize(item.text)));
  const ys = tf.tensor2d(data.map(item => LABELS.map((_, index) => index === item.label ? 1 : 0)));
  const model = createModel();
  await model.fit(xs, ys, { epochs, batchSize: Math.min(8, data.length), shuffle: true, verbose: 0 });
  xs.dispose(); ys.dispose();
  ensureDataDir();
  await model.save(`file://${MODEL_DIR}`);
  if (modelPromise) { const old = await modelPromise; old.dispose(); }
  modelPromise = Promise.resolve(model);
  return { samples: data.length };
}

async function getModel() {
  ensureDataDir();
  if (!modelPromise) {
    if (fs.existsSync(path.join(MODEL_DIR, 'model.json'))) {
      modelPromise = tf.loadLayersModel(`file://${MODEL_DIR}/model.json`);
    } else {
      await trainModel([], 24);
    }
  }
  return modelPromise;
}

async function classify(text) {
  const model = await getModel();
  const input = tf.tensor2d([tokenize(text)]);
  const output = model.predict(input);
  const values = Array.from(await output.data());
  input.dispose(); output.dispose();
  const details = LABELS.map((category, index) => ({ category, probability: values[index] }));
  details.sort((a, b) => b.probability - a.probability);
  const top = details[0];
  return { category: top.category, confidence: top.probability, details };
}

async function learn({ messageId, text, label }) {
  if (!messageId || !text || !LABELS.includes(label)) throw new Error('Dados de aprendizado inválidos');
  const feedback = readFeedback().filter(item => item.messageId !== messageId);
  feedback.push({ messageId, text: String(text).slice(0, 12000), label: LABELS.indexOf(label), labelName: label, updatedAt: new Date().toISOString() });
  writeFeedback(feedback);
  return retrain(8);
}

async function retrain(epochs = 8) {
  if (trainingPromise) return trainingPromise;
  trainingPromise = trainModel([], epochs).finally(() => { trainingPromise = null; });
  return trainingPromise;
}

async function dailyTrain() {
  const result = await retrain(10);
  return { ...result, feedback: readFeedback().length, trainedAt: new Date().toISOString() };
}

function stats() {
  const feedback = readFeedback();
  return { feedback: feedback.length, labels: LABELS };
}

function isPromotionalCategory(category) {
  return category === 'spam' || category === 'promocoes';
}

module.exports = { LABELS, classify, learn, dailyTrain, stats, isPromotionalCategory };

// Treinamento diário: exemplos confirmados pelo usuário são a fonte de verdade.
const interval = Number(process.env.DAILY_TRAIN_INTERVAL_MS || 24 * 60 * 60 * 1000);
const firstDailyRun = setTimeout(() => dailyTrain().catch(error => console.error('[ML] Treinamento diário:', error.message)), interval);
firstDailyRun.unref();
setInterval(() => dailyTrain().catch(error => console.error('[ML] Treinamento diário:', error.message)), interval).unref();
ensureDataDir();
if (process.env.TRAIN_ON_START === 'true') retrain(10).catch(error => console.error('[ML] Treino inicial:', error.message));

// Mantém o processo vivo sem agendar trabalho caro por minuto; em produção, use um scheduler externo diário.
module.exports.tokenize = tokenize;
module.exports.normalize = normalize;
module.exports._paths = { DATA_DIR, MODEL_DIR, FEEDBACK_FILE };
