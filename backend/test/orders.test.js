import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

// D3 regression: invalid checkout input is refused before the database and names the fields to correct.
async function postOrder(body) {
  const server = createApp().listen(0);
  try {
    await new Promise((resolve) => server.once('listening', resolve));
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/orders`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    return { status: response.status, body: await response.json() };
  } finally {
    server.close();
  }
}

test('an order with an email the browser accepts but the server refuses names the email field', async () => {
  const { status, body } = await postOrder({
    customerName: 'Juan Dela Cruz', email: 'juan@example', address: '123 Mabini Street, Sample City', items: [{ productId: 3, quantity: 1 }]
  });
  assert.equal(status, 422);
  assert.equal(body.error.code, 'INVALID_ORDER');
  assert.equal(body.error.message, 'Check the email address.');
  assert.ok(body.error.details.fieldErrors.email);
});

test('an order with several invalid fields names each of them', async () => {
  const { status, body } = await postOrder({ customerName: 'J', email: 'juan@example.com', address: 'short', items: [] });
  assert.equal(status, 422);
  assert.equal(body.error.message, 'Check the full name, delivery address, cart items.');
});
