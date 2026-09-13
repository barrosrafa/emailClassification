/**
 * classifierStrategy.js
 * Implementação do padrão Strategy para classificação de e-mails:
 * - TfIdfStrategy: Modelo leve com vocabulário dinâmico, TF-IDF e N-grams (1-3)
 * - TensorFlowStrategy: Modelo neural LSTM / TensorFlow.js
 * - HybridStrategy: Fusão ponderada de sinais heurísticos de metadados + modelo NLP
 */

const { analyzeMetadata, aggregateSignals } = require('./metadataAnalyzer');

const LABELS = ['principal', 'spam', 'promocoes', 'redes_sociais'];

class ClassifierStrategy {
  async classify(_input) {
    throw new Error('Método classify() deve ser implementado pela estratégia.');
  }
}

/**
 * Estratégia baseada em TF-IDF e N-grams (1 a 3) com vocabulário dinâmico.
 */
class TfIdfStrategy extends ClassifierStrategy {
  constructor(corpus = []) {
    super();
    this.documents = [];
    this.vocab = new Set();
    this.idf = {};
    this.categoryScores = {};
    if (corpus.length) this.fit(corpus);
  }

  tokenizeAndNgrams(text = '', nMax = 3) {
    const clean = String(text)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    const tokens = [...clean];
    for (let n = 2; n <= nMax; n++) {
      for (let i = 0; i <= clean.length - n; i++) {
        tokens.push(clean.slice(i, i + n).join(' '));
      }
    }
    return tokens;
  }

  fit(labeledDocs = []) {
    this.documents = labeledDocs;
    this.vocab = new Set();
    const docCount = labeledDocs.length || 1;
    const docFreq = {};
    const categoryWordFreq = { principal: {}, spam: {}, promocoes: {}, redes_sociais: {} };
    const categoryTotals = { principal: 0, spam: 0, promocoes: 0, redes_sociais: 0 };

    for (const doc of labeledDocs) {
      const tokens = this.tokenizeAndNgrams(doc.text);
      const uniqueInDoc = new Set(tokens);
      for (const token of uniqueInDoc) {
        docFreq[token] = (docFreq[token] || 0) + 1;
        this.vocab.add(token);
      }
      for (const token of tokens) {
        if (categoryWordFreq[doc.label]) {
          categoryWordFreq[doc.label][token] = (categoryWordFreq[doc.label][token] || 0) + 1;
          categoryTotals[doc.label]++;
        }
      }
    }

    this.idf = {};
    for (const token of this.vocab) {
      this.idf[token] = Math.log((docCount + 1) / ((docFreq[token] || 0) + 1)) + 1;
    }

    this.categoryWordFreq = categoryWordFreq;
    this.categoryTotals = categoryTotals;
  }

  async classify(input) {
    const text = typeof input === 'string' ? input : (input.text || `${input.subject || ''} ${input.bodyPreview || ''}`);
    const tokens = this.tokenizeAndNgrams(text);
    if (!tokens.length || !this.documents.length) {
      return {
        category: 'principal',
        confidence: 0.25,
        details: LABELS.map(cat => ({ category: cat, probability: 0.25 }))
      };
    }

    const logProbs = {};
    for (const cat of LABELS) {
      const totalWords = this.categoryTotals[cat] || 1;
      const vocabSize = this.vocab.size || 1;
      let logSum = 0;
      for (const token of tokens) {
        const count = (this.categoryWordFreq[cat] && this.categoryWordFreq[cat][token]) || 0;
        const idfWeight = this.idf[token] || 1;
        const smoothedProb = (count + 1) / (totalWords + vocabSize);
        logSum += Math.log(smoothedProb) * idfWeight;
      }
      logProbs[cat] = logSum;
    }

    // Normalização Softmax para probabilidade
    const maxLog = Math.max(...Object.values(logProbs));
    const exps = {};
    let sumExp = 0;
    for (const cat of LABELS) {
      exps[cat] = Math.exp(logProbs[cat] - maxLog);
      sumExp += exps[cat];
    }

    const details = LABELS.map(cat => ({
      category: cat,
      probability: sumExp > 0 ? exps[cat] / sumExp : 0.25
    }));
    details.sort((a, b) => b.probability - a.probability);

    return {
      category: details[0].category,
      confidence: details[0].probability,
      details
    };
  }
}

/**
 * Estratégia neural utilizando TensorFlow.js (LSTM).
 */
class TensorFlowStrategy extends ClassifierStrategy {
  constructor(classifierService) {
    super();
    this.classifierService = classifierService;
  }

  async classify(input) {
    const text = typeof input === 'string' ? input : (input.text || `${input.subject || ''}\n${input.bodyPreview || ''}`);
    return this.classifierService.classify(text);
  }
}

/**
 * Estratégia Híbrida: Combina regras heurísticas de metadados + modelo NLP.
 * Pesos padrão: 70% modelo NLP, 30% metadados.
 */
class HybridStrategy extends ClassifierStrategy {
  constructor(nlpClassifier, nlpWeight = 0.7, heuristicWeight = 0.3) {
    super();
    this.nlpClassifier = nlpClassifier;
    this.nlpWeight = nlpWeight;
    this.heuristicWeight = heuristicWeight;
  }

  fuseResults(metadataScores, nlpResult) {
    const details = LABELS.map(cat => {
      const nlpProb = nlpResult.details?.find(d => d.category === cat)?.probability ?? 0.25;
      const metaProb = metadataScores[cat] ?? 0;
      // Combinação linear ponderada
      const fusedScore = (nlpProb * this.nlpWeight) + (metaProb * this.heuristicWeight);
      return { category: cat, score: fusedScore };
    });

    // Normaliza para que as probabilidades somem 1.0
    const totalScore = details.reduce((sum, item) => sum + item.score, 0) || 1;
    const finalDetails = details.map(item => ({
      category: item.category,
      probability: item.score / totalScore
    }));

    finalDetails.sort((a, b) => b.probability - a.probability);
    const top = finalDetails[0];

    return {
      category: top.category,
      confidence: top.probability,
      details: finalDetails,
      metadataSignals: metadataScores
    };
  }

  async classify(messageOrText) {
    const isObject = typeof messageOrText === 'object' && messageOrText !== null;
    const rawMessage = isObject ? messageOrText : { bodyPreview: messageOrText };
    const text = isObject
      ? (messageOrText.text || `${messageOrText.subject || ''}\n${messageOrText.bodyPreview || ''}\n${messageOrText.body?.content || ''}`)
      : String(messageOrText);

    // 1. Camada de regras heurísticas
    const signals = analyzeMetadata(rawMessage);
    const metadataScores = aggregateSignals(signals);

    // 2. Camada NLP
    const nlpResult = await this.nlpClassifier.classify(text);

    // 3. Fusão de resultados
    return this.fuseResults(metadataScores, nlpResult);
  }
}

module.exports = {
  LABELS,
  ClassifierStrategy,
  TfIdfStrategy,
  TensorFlowStrategy,
  HybridStrategy
};
