const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { normalize, tokenize } = require('../services/classifierService');

describe('normalize', () => {
  it('converte para minúsculas e remove acentos', () => {
    assert.strictEqual(normalize('Promoção EXCLUSIVA'), 'promocao exclusiva');
  });

  it('remove caracteres especiais', () => {
    assert.strictEqual(normalize('Clique aqui! <a href="#">link</a>'), 'clique aqui a href link a');
  });
});

describe('tokenize', () => {
  it('retorna sequência de exatamente MAX_SEQUENCE_LENGTH', () => {
    const tokens = tokenize('reuniao de equipe');
    assert.strictEqual(tokens.length, 30);
  });

  it('adiciona token <START> no início', () => {
    const tokens = tokenize('reuniao');
    assert.strictEqual(tokens[0], 1); // <START>
  });

  it('usa <UNKNOWN> para palavras fora do vocabulário', () => {
    const tokens = tokenize('palavraquenaoexiste');
    assert.ok(tokens.includes(2)); // <UNKNOWN>
  });
});
