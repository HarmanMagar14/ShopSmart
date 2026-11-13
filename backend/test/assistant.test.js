import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { redactQuestion } from '../src/services/aiProvider.js';
import { answerQuestion, buildAssistantResponse, parseBudget, rankProducts, verifyDraft } from '../src/services/assistant.js';

const products = [
  { id: 1, name: 'Keyboard', category: 'Accessories', description: 'Mechanical keyboard', price: 1800, stock: 2 },
  { id: 2, name: 'Mouse', category: 'Accessories', description: 'Wireless mouse', price: 600, stock: 3 }
];

const catalog = [
  ...products,
  { id: 3, name: '1080p Webcam', category: 'Video', description: 'Full HD webcam for calls', price: 1450, stock: 6 },
  { id: 4, name: 'Sold Out Speaker', category: 'Audio', description: 'Portable speaker', price: 500, stock: 0 }
];

const keyboardDraft = async () => ({ answer: 'The Keyboard costs ₱1,800 and is in stock.', productIds: [1] });

test('parseBudget extracts a peso budget', () => assert.equal(parseBudget('below ₱2,000'), 2000));
test('parseBudget does not read a model number as a budget', () => assert.equal(parseBudget('1080p webcam'), null));
test('parseBudget does not read a minimum as a budget', () => assert.equal(parseBudget('keyboard over ₱1,000'), null));
// D1 regression: "up to 16 inches" is a size, not a ₱16 budget that filters out every product.
test('parseBudget ignores a number followed by a unit', () => {
  assert.equal(parseBudget('Do you have a laptop stand that fits up to 16 inches?'), null);
  assert.equal(parseBudget('headset under 2 hours of charging'), null);
});
test('parseBudget still reads a budget after the same words', () => {
  assert.equal(parseBudget('laptop stand up to ₱1,500'), 1500);
  assert.equal(parseBudget('something within 1500 pesos'), 1500);
  assert.equal(parseBudget('keyboard under 2000'), 2000);
});
test('rankProducts finds a product when the question states a size', () => {
  const withStand = [...catalog, { id: 5, name: 'Laptop Stand', category: 'Study', description: 'Foldable aluminum stand for laptops up to 16 inches.', price: 1200, stock: 9 }];
  assert.deepEqual(rankProducts(withStand, 'Do you have a laptop stand that fits up to 16 inches?').map((p) => p.id), [5]);
});
test('rankProducts respects the budget',() => assert.deepEqual(rankProducts(products, 'mouse below 700').map((p) => p.id), [2]));
test('rankProducts finds a product named with a model number', () => assert.deepEqual(rankProducts(catalog, '1080p webcam').map((p) => p.id), [3]));
test('rankProducts ignores common words', () => assert.deepEqual(rankProducts(catalog, 'Do you sell a refrigerator for the kitchen?'), []));
test('rankProducts answers a budget question without a product name', () => assert.deepEqual(rankProducts(catalog, 'anything under ₱1,000?').map((p) => p.id), [2]));
test('rankProducts excludes a product with no stock', () => assert.deepEqual(rankProducts(catalog, 'portable speaker'), []));
test('assistant response contains traceable sources', () => assert.equal(buildAssistantResponse(products, 'keyboard').sources[0].id, 1));

test('a catalog match returns the verified draft with catalog facts', async () => {
  const result = await answerQuestion(catalog, 'Which keyboard is below ₱2,000?', keyboardDraft);
  assert.equal(result.answerSource, 'ai');
  assert.equal(result.answer, 'The Keyboard costs ₱1,800 and is in stock.');
  assert.deepEqual(result.recommendedProducts, [{ id: 1, name: 'Keyboard', price: 1800, category: 'Accessories' }]);
  assert.deepEqual(result.sources, [{ type: 'product', id: 1, name: 'Keyboard' }]);
});

test('the provider receives only the public fields of selected products', async () => {
  let received;
  await answerQuestion(catalog, 'keyboard', async (_question, facts) => { received = facts; return keyboardDraft(); });
  assert.deepEqual(received, [{ id: 1, name: 'Keyboard', description: 'Mechanical keyboard', category: 'Accessories', price: 1800, stock: 2 }]);
});

test('no match gives an honest answer without calling the provider', async () => {
  let called = false;
  const result = await answerQuestion(catalog, 'Do you sell a refrigerator?', async () => { called = true; return {}; });
  assert.equal(called, false);
  assert.match(result.answer, /could not find/);
  assert.deepEqual(result.recommendedProducts, []);
  assert.deepEqual(result.sources, []);
});

const rejectedDrafts = {
  'an invented product id': { answer: 'Try the Keyboard.', productIds: [99] },
  'an unselected product id': { answer: 'Try the Keyboard.', productIds: [2] },
  'an invented price': { answer: 'The Keyboard costs ₱1,000.', productIds: [1] },
  'a correct number in the wrong currency': { answer: 'The Keyboard costs $1800.', productIds: [1] },
  'a correct number named in dollars': { answer: 'The Keyboard costs 1800 dollars.', productIds: [1] },
  'an invented specification number': { answer: 'The Keyboard has a 5 year warranty.', productIds: [1] },
  'a product that was not selected': { answer: 'The Keyboard pairs well with the Mouse.', productIds: [1] },
  'a false availability claim': { answer: 'The Keyboard is out of stock.', productIds: [1] },
  'a missing answer': { productIds: [1] },
  'no product ids': { answer: 'The Keyboard is good.', productIds: [] },
  'output that is not an object': 'not json'
};

for (const [name, draft] of Object.entries(rejectedDrafts)) {
  test(`verification falls back on ${name}`, async () => {
    const result = await answerQuestion(catalog, 'Which keyboard is below ₱2,000?', async () => draft);
    assert.equal(result.answerSource, 'rules');
    assert.match(result.answer, /Keyboard \(₱1,800, 2 in stock\)/);
    assert.deepEqual(result.sources.map((source) => source.id), [1]);
  });
}

test('verifyDraft accepts the budget the customer asked about', () => {
  const selected = rankProducts(catalog, 'keyboard below ₱2,000');
  const verified = verifyDraft({ answer: 'The Keyboard is below ₱2,000 at ₱1,800.', productIds: [1] }, selected, 'keyboard below ₱2,000', catalog);
  assert.deepEqual(verified.products.map((product) => product.id), [1]);
});

for (const reason of ['timeout', 'rate_limit', 'invalid_format', 'unavailable', 'not_configured']) {
  test(`a ${reason} provider failure falls back to the rules`, async () => {
    const failing = async () => { throw Object.assign(new Error(reason), { reason }); };
    const result = await answerQuestion(catalog, 'keyboard', failing);
    assert.equal(result.answerSource, 'rules');
    assert.deepEqual(result.recommendedProducts.map((product) => product.id), [1]);
  });
}

test('contact details are removed from the question sent to the provider', () => {
  assert.equal(redactQuestion('keyboard for ana@example.com or 0917 123 4567'), 'keyboard for [email removed] or [phone removed]');
});

test('an invalid question is rejected with HTTP 422', async () => {
  const server = createApp().listen(0);
  try {
    await new Promise((resolve) => server.once('listening', resolve));
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/assistant/questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'hi' })
    });
    assert.equal(response.status, 422);
    assert.equal((await response.json()).error.code, 'INVALID_QUESTION');
  } finally {
    server.close();
  }
});
