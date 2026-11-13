import { z } from 'zod';
import { draftWithGemini } from './aiProvider.js';

const MAX_RECOMMENDATIONS = 3;

const STOPWORDS = new Set([
  'about', 'above', 'affordable', 'all', 'and', 'any', 'anything', 'are', 'available', 'below', 'best', 'budget', 'but', 'buy',
  'can', 'cheap', 'cheaper', 'cheapest', 'cost', 'costs', 'did', 'does', 'find', 'for', 'from', 'get', 'give', 'good', 'got',
  'has', 'have', 'help', 'how', 'item', 'items', 'less', 'like', 'look', 'looking', 'more', 'most', 'much', 'need', 'nice', 'not',
  'our', 'over', 'peso', 'pesos', 'php', 'please', 'price', 'prices', 'product', 'products', 'recommend', 'sell', 'selling',
  'shop', 'should', 'show', 'some', 'something', 'stock', 'store', 'suggest', 'tell', 'than', 'that', 'the', 'there', 'thing',
  'things', 'this', 'under', 'want', 'was', 'what', 'when', 'where', 'which', 'who', 'with', 'within', 'would', 'you', 'your'
]);

const draftSchema = z.object({
  answer: z.string().trim().min(1).max(600),
  productIds: z.array(z.number().int().positive()).min(1)
});

// A number followed by a unit ("up to 16 inches", "under 2 hours") is a specification, not a peso amount.
const UNIT = String.raw`[\s-]*(?:inch(?:es)?|cm|mm|m|ft|kg|g|gb|tb|mb|hz|khz|w|watts?|mah|v|hours?|hrs?|mins?|minutes?|days?|weeks?|months?|years?|pcs|pieces?|units?|items?|p|k|x)\b`;
// The lookaheads stop backtracking from capturing part of a number, such as the "1" of "16 inches".
const LIMIT_AMOUNT = new RegExp(String.raw`(?:below|under|less than|cheaper than|up to|within|at most|budget(?:\s+of|\s+is)?)\s*(?:₱|php\s*)?(\d+(?:\.\d{1,2})?)(?!\d|\.\d)(?!${UNIT})`);

export function parseBudget(question) {
  const normalized = question.replaceAll(',', '').toLowerCase()
    // "over ₱1,000" is a minimum, so it must not be read as a spending limit.
    .replace(/(?:over|above|more than|at least|greater than)\s*(?:₱|php\s*)?\d+(?:\.\d{1,2})?/g, ' ');
  const match = normalized.match(LIMIT_AMOUNT)
    || normalized.match(/(?:₱|php\s*)(\d+)/)
    || normalized.match(/(\d+)\s*(?:pesos?|php)\b/);
  return match ? Number(match[1]) : null;
}

function toWords(text) {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function singular(word) {
  return word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word;
}

function searchTerms(question) {
  const terms = toWords(question)
    .filter((word) => word.length > 2 && !/^\d+$/.test(word) && !STOPWORDS.has(word))
    .map(singular);
  return [...new Set(terms)];
}

export function rankProducts(products, question) {
  const terms = searchTerms(question);
  const budget = parseBudget(question);
  const eligible = products
    .filter((product) => product.stock > 0 && (budget === null || Number(product.price) <= budget))
    .map((product) => {
      const words = new Set(toWords(`${product.name} ${product.category} ${product.description}`).map(singular));
      return { ...product, score: terms.filter((term) => words.has(term)).length };
    })
    .sort((a, b) => b.score - a.score || Number(a.price) - Number(b.price));
  if (terms.length === 0) return eligible;
  // A question that names something must match it; otherwise the honest answer is no match.
  return eligible.filter((product) => product.score > 0 && product.score === eligible[0].score);
}

function formatPeso(price) {
  return `₱${Number(price).toLocaleString('en-PH')}`;
}

// recommendedProducts and sources always come from catalog records, never from model output.
function buildResponse(answer, products, answerSource) {
  return {
    answer,
    recommendedProducts: products.map(({ id, name, price, category }) => ({ id, name, price: Number(price), category })),
    sources: products.map(({ id, name }) => ({ type: 'product', id, name })),
    answerSource
  };
}

export function buildAssistantResponse(products, question) {
  const ranked = rankProducts(products, question).slice(0, MAX_RECOMMENDATIONS);
  if (ranked.length === 0) {
    return buildResponse('I could not find an in-stock product matching that request.', [], 'rules');
  }
  const summary = ranked.map((product) => `${product.name} (${formatPeso(product.price)}, ${product.stock} in stock)`).join(', ');
  return buildResponse(`Based on the current ShopSmart catalog, consider: ${summary}.`, ranked, 'rules');
}

function numbersIn(text) {
  return (String(text).match(/\d[\d,]*(?:\.\d+)?/g) || []).map((value) => String(Number(value.replaceAll(',', ''))));
}

// A draft is only a suggestion. Return the checked answer and products, or null to reject the draft.
export function verifyDraft(draft, selected, question, catalog = selected) {
  const parsed = draftSchema.safeParse(draft);
  if (!parsed.success) return null;
  const { answer, productIds } = parsed.data;

  const selectedById = new Map(selected.map((product) => [product.id, product]));
  if (!productIds.every((id) => selectedById.has(id))) return null;

  // Catalog prices are in pesos, so any other currency misstates the price.
  if (/[$€£¥]|\b(?:usd|eur|dollars?|euros?)\b/i.test(answer)) return null;

  const budget = parseBudget(question);
  const prices = new Set(selected.map((product) => String(Number(product.price))));
  if (budget !== null) prices.add(String(budget));
  const claimedPrices = [...answer.matchAll(/(?:₱|php\s*)\s*(\d[\d,]*(?:\.\d+)?)/gi)].map((match) => numbersIn(match[1])[0]);
  if (!claimedPrices.every((price) => prices.has(price))) return null;

  const knownNumbers = new Set([
    ...numbersIn(question),
    ...selected.flatMap((product) => [
      ...numbersIn(`${product.name} ${product.description} ${product.category}`),
      String(Number(product.price)),
      String(product.stock)
    ])
  ]);
  if (!numbersIn(answer).every((value) => knownNumbers.has(value))) return null;

  const lowered = answer.toLowerCase();
  const namesOtherProduct = catalog.some((product) => !selectedById.has(product.id) && lowered.includes(product.name.toLowerCase()));
  if (namesOtherProduct) return null;

  // Every selected product is in stock, so a claim that one is not contradicts the catalog.
  if (/out of stock|sold out|unavailable|not available|no stock/.test(lowered)) return null;

  return { answer, products: [...new Set(productIds)].map((id) => selectedById.get(id)) };
}

export async function answerQuestion(products, question, draft = draftWithGemini) {
  const selected = rankProducts(products, question).slice(0, MAX_RECOMMENDATIONS);
  // With nothing to recommend there are no facts to phrase, so the provider is not called.
  if (selected.length === 0) return buildAssistantResponse(products, question);

  const facts = selected.map(({ id, name, description, category, price, stock }) => ({
    id, name, description, category, price: Number(price), stock
  }));

  try {
    const verified = verifyDraft(await draft(question, facts), selected, question, products);
    if (verified) return buildResponse(verified.answer, verified.products, 'ai');
    console.warn('Assistant draft rejected by verification; using rule-based answer.');
  } catch (error) {
    console.warn(`Assistant provider failed (${error.reason || 'unavailable'}); using rule-based answer.`);
  }
  return buildAssistantResponse(products, question);
}
