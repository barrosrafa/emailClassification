const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { analyzeMetadata, aggregateSignals } = require('../services/metadataAnalyzer');
const { TfIdfStrategy, HybridStrategy } = require('../services/classifierStrategy');

describe('metadataAnalyzer', () => {
  it('detecta remetente promocional (mailchimp)', () => {
    const msg = { from: { emailAddress: { address: 'promo@store.mailchimp.com' } } };
    const signals = analyzeMetadata(msg);
    assert.ok(signals.some(s => s.category === 'promocoes' && s.source === 'sender'));
  });

  it('detecta header List-Unsubscribe como promocional', () => {
    const msg = {
      internetMessageHeaders: [
        { name: 'List-Unsubscribe', value: '<mailto:unsub@example.com>' }
      ]
    };
    const signals = analyzeMetadata(msg);
    assert.ok(signals.some(s => s.category === 'promocoes' && s.source === 'header:list-unsubscribe'));
  });

  it('detecta remetente de rede social (LinkedIn)', () => {
    const msg = { from: { emailAddress: { address: 'updates@linkedin.com' } } };
    const signals = analyzeMetadata(msg);
    assert.ok(signals.some(s => s.category === 'redes_sociais'));
  });

  it('agrega sinais calculando o score máximo por categoria', () => {
    const signals = [
      { category: 'promocoes', weight: 0.6 },
      { category: 'promocoes', weight: 0.85 }
    ];
    const scores = aggregateSignals(signals);
    assert.strictEqual(scores.promocoes, 0.85);
    assert.strictEqual(scores.principal, 0);
  });
});

describe('classifierStrategy - TfIdfStrategy', () => {
  it('classifica texto com base no vocabulário dinâmico e TF-IDF', async () => {
    const docs = [
      { text: 'reuniao projeto entrega equipe prazo', label: 'principal' },
      { text: 'desconto cupom oferta exclusiva compre agora', label: 'promocoes' },
      { text: 'novo seguidor curtiu foto no instagram', label: 'redes_sociais' },
      { text: 'urgente atualize sua senha bancaria premio', label: 'spam' }
    ];
    const strategy = new TfIdfStrategy(docs);
    const result = await strategy.classify('oferta exclusiva com desconto de hoje');
    assert.strictEqual(result.category, 'promocoes');
    assert.ok(result.confidence > 0.4);
  });
});

describe('classifierStrategy - HybridStrategy', () => {
  it('funde sinais heurísticos de metadados e scores NLP', async () => {
    const mockNlp = {
      classify: async () => ({
        category: 'principal',
        confidence: 0.6,
        details: [
          { category: 'principal', probability: 0.6 },
          { category: 'promocoes', probability: 0.4 },
          { category: 'spam', probability: 0.0 },
          { category: 'redes_sociais', probability: 0.0 }
        ]
      })
    };

    const hybrid = new HybridStrategy(mockNlp, 0.6, 0.4);
    // Mensagem com header promocional forte (0.85)
    const msg = {
      text: 'Olá equipe, segue o relatório',
      internetMessageHeaders: [{ name: 'List-Unsubscribe', value: '<http://unsub.com>' }]
    };

    const res = await hybrid.classify(msg);
    assert.ok(res.details.length === 4);
    assert.ok(res.category);
  });
});
