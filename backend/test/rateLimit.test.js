import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

// D2 regression: the assistant limit must answer in the same JSON error shape as every other route,
// so the frontend can show its message instead of "Request failed with status 429."
// Kept in its own file because node --test runs each file in a separate process with a fresh limiter.
test('the assistant rate limit returns a JSON error the frontend can display', async () => {
  const server = createApp().listen(0);
  try {
    await new Promise((resolve) => server.once('listening', resolve));
    const url = `http://127.0.0.1:${server.address().port}/api/assistant/questions`;
    let response;
    // Invalid questions are rejected before the database, but still count toward the limit of 20.
    for (let attempt = 1; attempt <= 21; attempt += 1) {
      response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: 'x' }) });
      if (attempt <= 20) { assert.equal(response.status, 422); await response.body?.cancel(); }
    }
    assert.equal(response.status, 429);
    assert.match(response.headers.get('content-type'), /application\/json/);
    const body = await response.json();
    assert.equal(body.error.code, 'RATE_LIMITED');
    assert.match(body.error.message, /wait a minute/);
  } finally {
    server.close();
  }
});
