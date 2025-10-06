import test from 'node:test';
import assert from 'node:assert/strict';

import {
  sanitizeRecipeUrl,
  extractRecipeKeywords,
  hasEssentialKeywordCoverage,
} from './recipeUtils.js';

const ALLOWED_SAMPLE =
  'https://www.marmiton.org/recettes/recette_saute-de-cochon-aux-pommes-de-terre_12345';

test('sanitizeRecipeUrl keeps valid URL when keywords align', async () => {
  const originalFetch = global.fetch;
  const originalWarn = console.warn;
  global.fetch = async () => {
    throw new Error('fetch should not be called for matching URLs');
  };
  console.warn = () => {};

  try {
    const result = await sanitizeRecipeUrl(
      ALLOWED_SAMPLE,
      'Sauté de cochon aux pommes de terre'
    );
    assert.equal(result, ALLOWED_SAMPLE);
  } finally {
    global.fetch = originalFetch;
    console.warn = originalWarn;
  }
});

test('sanitizeRecipeUrl unwraps encoded Marmiton search parameter', async () => {
  const originalFetch = global.fetch;
  const originalWarn = console.warn;
  global.fetch = async () => {
    throw new Error('fetch should not be called when decoding search URL');
  };
  console.warn = () => {};

  const encoded =
    'https://www.marmiton.org/recettes/recherche.aspx?aqt=' +
    encodeURIComponent(ALLOWED_SAMPLE);

  try {
    const result = await sanitizeRecipeUrl(
      encoded,
      'Sauté de cochon aux pommes de terre'
    );
    assert.equal(result, ALLOWED_SAMPLE);
  } finally {
    global.fetch = originalFetch;
    console.warn = originalWarn;
  }
});

test('sanitizeRecipeUrl falls back when slug mismatches essential keywords', async () => {
  const originalFetch = global.fetch;
  const originalWarn = console.warn;
  global.fetch = async () => {
    throw new Error('network lookup should be skipped in tests');
  };
  console.warn = () => {};

  try {
    const result = await sanitizeRecipeUrl(
      'https://www.marmiton.org/recettes/recette_boeuf-saute-pommes-de-terre_228930.aspx',
      'Sauté de cochon aux pommes de terre'
    );
    assert.ok(result?.includes('recettes/recherche.aspx'));
    assert.ok(result?.includes('cochon'));
  } finally {
    global.fetch = originalFetch;
    console.warn = originalWarn;
  }
});

test('extractRecipeKeywords normalizes accents and strips stop words', () => {
  const keywords = extractRecipeKeywords('Sauté de cochon aux pommes de terre');
  assert.deepEqual(keywords, ['saute', 'cochon', 'pommes', 'terre']);
});

test('hasEssentialKeywordCoverage demands key ingredients', () => {
  const expected = ['cochon', 'pommes', 'terre'];
  const candidateOk = ['porc', 'pommes', 'terre'];
  const candidateMissing = ['boeuf', 'pommes'];

  assert.equal(hasEssentialKeywordCoverage(expected, candidateOk), true);
  assert.equal(hasEssentialKeywordCoverage(expected, candidateMissing), false);
});
