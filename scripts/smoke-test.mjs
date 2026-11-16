// ShopSmart API customer-journey smoke test.
// Usage: node scripts/smoke-test.mjs [apiBase] [section...]
//   apiBase  default http://localhost:3000/api (staging: https://shopsmart-nos5.onrender.com/api)
//   section  any of: browse checkout assistant ratelimit (default: all except ratelimit)
// WARNING: "checkout" creates real (fictional) orders and lowers stock in the target database.
// "ratelimit" uses up this client's 20-questions-per-minute assistant budget.
const base = process.argv[2] || 'http://localhost:3000/api';
const sections = new Set(process.argv.slice(3));
const want = (name) => (sections.size === 0 ? name !== 'ratelimit' : sections.has(name));
const customer = { customerName: 'Juan Dela Cruz', email: 'juan.delacruz@example.com', address: '123 Mabini Street, Barangay Uno, Sample City' };

async function call(label, path, options = {}) {
  const started = Date.now();
  let status, body;
  try {
    const response = await fetch(base + path, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
    status = response.status;
    const text = await response.text();
    try { body = JSON.parse(text); } catch { body = `TEXT: ${text}`; }
  } catch (error) { status = 'NETWORK'; body = String(error); }
  console.log(`\n### ${label}\n${options.method || 'GET'} ${path} -> ${status} (${Date.now() - started} ms)`);
  console.log(typeof body === 'string' ? body : JSON.stringify(body, null, 1).slice(0, 1500));
  return { status, body };
}
const post = (label, path, data) => call(label, path, { method: 'POST', body: JSON.stringify(data) });
const products = async () => (await (await fetch(`${base}/products`)).json()).products;
const stockMap = async () => Object.fromEntries((await products()).map((p) => [p.id, p.stock]));

// Free hosting may be asleep; wait up to 90 s for the health check.
for (let i = 0; i < 90; i++) { try { if ((await fetch(`${base}/health`)).ok) break; } catch { /* waiting */ } await new Promise((r) => setTimeout(r, 1000)); }

if (want('browse')) {
  await call('Health', '/health');
  const all = await call('All products', '/products');
  if (Array.isArray(all.body?.products)) console.log('names:', all.body.products.map((p) => `${p.id}:${p.name}(stock ${p.stock}, ₱${p.price})`).join(' | '));
  await call('Search keyboard', '/products?search=keyboard');
  await call('Search description word "microphone"', '/products?search=microphone');
  await call('Search no results', '/products?search=zzzz');
  await call('Product by id', '/products/2');
  await call('Invalid product id', '/products/abc');
  await call('Missing product', '/products/9999');
}

if (want('checkout')) {
  console.log('\nstock before:', JSON.stringify(await stockMap()));
  await post('Valid simulated order (fictional): lamp x1 + stand x2', '/orders', { ...customer, items: [{ productId: 3, quantity: 1 }, { productId: 5, quantity: 2 }] });
  console.log('stock after:', JSON.stringify(await stockMap()));
  await post('Invalid email + short address', '/orders', { ...customer, email: 'juan@example', address: 'short', items: [{ productId: 3, quantity: 1 }] });
  await post('Empty cart', '/orders', { ...customer, items: [] });
  // Stock rule: ask for one more than the current stock of the lowest-stock product (validation allows up to 20).
  const lowest = (await products()).sort((a, b) => a.stock - b.stock)[0];
  const before = JSON.stringify(await stockMap());
  await post(`Above stock: ${lowest.name} x${lowest.stock + 1} (stock ${lowest.stock})`, '/orders', { ...customer, items: [{ productId: lowest.id, quantity: lowest.stock + 1 }] });
  await post(`Mixed order, one line above stock: lamp x1 + ${lowest.name} x${lowest.stock + 1}`, '/orders', { ...customer, items: [{ productId: 3, quantity: 1 }, ...(lowest.id === 3 ? [] : [{ productId: lowest.id, quantity: lowest.stock + 1 }])] });
  console.log('stock unchanged after refusals:', before === JSON.stringify(await stockMap()));
}

if (want('assistant')) {
  await post('Assistant: supported question', '/assistant/questions', { question: 'Which keyboard is below ₱2,000?' });
  await post('Assistant: no match', '/assistant/questions', { question: 'Do you sell a refrigerator for the kitchen?' });
  await post('Assistant: size number after a budget word (D1)', '/assistant/questions', { question: 'Do you have a laptop stand that fits up to 16 inches?' });
  await post('Assistant: invalid question', '/assistant/questions', { question: 'hi' });
}

if (want('ratelimit')) {
  let last;
  for (let i = 1; i <= 22; i++) {
    const response = await fetch(`${base}/assistant/questions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: 'x' }) });
    last = { request: i, status: response.status, type: response.headers.get('content-type'), body: await response.text() };
    if (response.status === 429) break;
  }
  console.log('\n### Rate limit (D2)\n', JSON.stringify(last));
}
