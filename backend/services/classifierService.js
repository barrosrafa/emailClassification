const fs = require('fs');
const path = require('path');
const { tf, LABELS, MAX_SEQUENCE_LENGTH, normalize, tokenize, messageText, metadataVector, createModel, tensors, stratifiedSplit, classWeights, datasetHash } = require('./modelUtils');

const DATA_DIR = path.resolve(__dirname, '../data');
const MODEL_DIR = path.join(DATA_DIR, 'modelo-email');
const FEEDBACK_FILE = path.join(DATA_DIR, 'feedback.json');
const EXPERIMENT_FILE = path.join(DATA_DIR, 'experiments.json');
let modelPromise = null;
let trainingPromise = null;

const SEED = [
  ['reuniao de equipe amanha para discutir projeto', 0], ['relatorio mensal de vendas prazo entrega', 0], ['aprovacao do orcamento do projeto', 0], ['cliente solicitou alteracao no prazo', 0], ['atencao importante sobre reuniao diretoria', 0],
  ['voce ganhou um premio clique aqui para resgatar', 1], ['urgente atualize seus dados bancarios agora', 1], ['ganhe dinheiro facil trabalhando em casa', 1], ['seu boleto vence hoje clique para pagar', 1], ['parabens voce foi sorteado responda', 1],
  ['promocao exclusiva desconto de 50 por cento aproveite', 2], ['oferta limitada inscreva se newsletter', 2], ['confira novidades da semana em nossa loja', 2], ['curso online com certificado matricula aberta', 2], ['desconto especial para clientes cadastre se', 2],
  ['voce tem uma nova notificacao no facebook', 3], ['alguem curtiu sua foto no instagram', 3], ['novo seguidor no twitter confira perfil', 3], ['comentario na sua publicacao do linkedin', 3], ['mensagem direta no instagram responda', 3]
].map(([text, label]) => ({ text, label }));

function ensureDataDir() { fs.mkdirSync(DATA_DIR, { recursive: true }); if (!fs.existsSync(FEEDBACK_FILE)) fs.writeFileSync(FEEDBACK_FILE, '[]\n'); if (!fs.existsSync(EXPERIMENT_FILE)) fs.writeFileSync(EXPERIMENT_FILE, '[]\n'); }
function readJson(file, fallback = []) { ensureDataDir(); try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function readFeedback() { return readJson(FEEDBACK_FILE); }
function writeFeedback(items) { ensureDataDir(); fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(items, null, 2) + '\n'); }
function writeExperiment(metadata) { const items = readJson(EXPERIMENT_FILE); items.push(metadata); fs.writeFileSync(EXPERIMENT_FILE, JSON.stringify(items, null, 2) + '\n'); }
function trainingData(extra = []) { return [...SEED, ...readFeedback().map(item => ({ text: item.text, label: item.label })), ...extra].filter(item => Number.isInteger(Number(item.label)) && Number(item.label) >= 0 && Number(item.label) < LABELS.length); }
function trainingCallbacks() { return [tf.callbacks.earlyStopping({ monitor: 'val_loss', patience: 5, restoreBestWeight: true })]; }

async function trainModel(extra = [], epochs = 18) {
  if (trainingPromise) return trainingPromise;
  trainingPromise = (async () => {
    ensureDataDir();
    const data = trainingData(extra);
    const split = stratifiedSplit(data);
    const train = split.train.length ? split.train : data;
    const validation = split.validation.length ? split.validation : train;
    const modelJson = path.join(MODEL_DIR, 'model.json');
    let model;
    let incremental = false;
    if (fs.existsSync(modelJson)) { try { model = await tf.loadLayersModel(`file://${modelJson}`); incremental = true; model.compile({ optimizer: tf.train.adam(1e-4, undefined, undefined, 1.0), loss: 'categoricalCrossentropy', metrics: ['accuracy'] }); } catch { model = null; } }
    if (!model) model = createModel();
    const trainTensors = tensors(train); const valTensors = tensors(validation);
    const history = await model.fit([trainTensors.xs, trainTensors.meta], trainTensors.ys, { validationData: [[valTensors.xs, valTensors.meta], valTensors.ys], epochs, batchSize: Math.min(32, Math.max(1, train.length)), shuffle: true, classWeight: classWeights(train), callbacks: trainingCallbacks(), verbose: 0 });
    Object.values(trainTensors).forEach(t => t.dispose()); Object.values(valTensors).forEach(t => t.dispose());
    await model.save(`file://${MODEL_DIR}`);
    const metrics = { loss: history.history.loss?.at(-1), accuracy: history.history.acc?.at(-1) ?? history.history.accuracy?.at(-1), valLoss: history.history.val_loss?.at(-1), valAccuracy: history.history.val_acc?.at(-1) ?? history.history.val_accuracy?.at(-1) };
    writeExperiment({ version: `model-${Date.now()}`, trainedAt: new Date().toISOString(), incremental, samples: data.length, epochs: history.epoch.length, seed: 42, datasetHash: datasetHash(data), metrics });
    if (modelPromise) { const old = await modelPromise.catch(() => null); if (old && old !== model) try { old.dispose(); } catch {} }
    modelPromise = Promise.resolve(model);
    return { samples: data.length, incremental, metrics };
  })().finally(() => { trainingPromise = null; });
  return trainingPromise;
}
async function getModel() {
  ensureDataDir();
  if (!modelPromise) { modelPromise = (async () => { const file = path.join(MODEL_DIR, 'model.json'); if (fs.existsSync(file)) { try { return await tf.loadLayersModel(`file://${file}`); } catch { fs.rmSync(MODEL_DIR, { recursive: true, force: true }); } } await trainModel([], 24); return tf.loadLayersModel(`file://${file}`); })().catch(err => { modelPromise = null; throw err; }); }
  return modelPromise;
}
async function predict(items) {
  const model = await getModel(); const xs = tf.tensor2d(items.map(item => tokenize(messageText(item))), [items.length, MAX_SEQUENCE_LENGTH]); const meta = tf.tensor2d(items.map(metadataVector)); const output = model.predict([xs, meta]); const values = await output.array(); xs.dispose(); meta.dispose(); output.dispose(); return values;
}
function detailsFrom(values) { const details = LABELS.map((category, i) => ({ category, probability: values[i] })); details.sort((a, b) => b.probability - a.probability); return { category: details[0].category, confidence: details[0].probability, details }; }
async function classifyNlp(text, object = {}) { return detailsFrom((await predict([{ ...object, text }]))[0]); }
function fuseScores(nlpDetails, metaScores, nlpWeight = 0.7, metaWeight = 0.3) { const fused = LABELS.map(cat => ({ category: cat, score: (nlpDetails.find(d => d.category === cat)?.probability ?? 0.25) * nlpWeight + (metaScores[cat] ?? 0) * metaWeight })); const total = fused.reduce((s, i) => s + i.score, 0) || 1; return { ...detailsFrom(fused.map(i => i.score / total)), metadataSignals: metaScores }; }
async function classify(input) { const object = typeof input === 'object' && input !== null ? input : {}; const result = await classifyNlp(messageText(input), object); if (object.from || object.internetMessageHeaders || object.body) { const { analyzeMetadata, aggregateSignals } = require('./metadataAnalyzer'); return fuseScores(result.details, aggregateSignals(analyzeMetadata(object))); } return result; }
async function classifyBatch(items = []) { const values = await predict(items); return Object.fromEntries(items.map((item, i) => [typeof item === 'object' && item.id ? item.id : i, detailsFrom(values[i])])); }
async function learn({ messageId, text, label }) { if (!messageId || !text || !LABELS.includes(label)) throw new Error('Dados de aprendizado inválidos'); const feedback = readFeedback().filter(item => item.messageId !== messageId); feedback.push({ messageId, text: String(text).slice(0, 12000), label: LABELS.indexOf(label), labelName: label, updatedAt: new Date().toISOString() }); writeFeedback(feedback); return retrain(8, [{ text, label: LABELS.indexOf(label) }]); }
async function retrain(epochs = 8, extra = []) { return trainModel(extra, epochs); }
async function dailyTrain() { const result = await retrain(10); return { ...result, feedback: readFeedback().length, trainedAt: new Date().toISOString() }; }
function stats() { return { feedback: readFeedback().length, labels: LABELS, experiments: readJson(EXPERIMENT_FILE).length }; }
function isPromotionalCategory(category) { return category === 'spam' || category === 'promocoes'; }
module.exports = { LABELS, classify, classifyBatch, learn, dailyTrain, stats, isPromotionalCategory, tokenize, normalize, _paths: { DATA_DIR, MODEL_DIR, FEEDBACK_FILE, EXPERIMENT_FILE } };
ensureDataDir();
const interval = Number(process.env.DAILY_TRAIN_INTERVAL_MS || 24 * 60 * 60 * 1000); setTimeout(() => dailyTrain().catch(error => console.error('[ML] Treinamento diário:', error.message)), interval).unref();
if (process.env.TRAIN_ON_START === 'true') retrain(10).catch(error => console.error('[ML] Treino inicial:', error.message));
