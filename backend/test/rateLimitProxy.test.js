import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

// Behind Render's proxy every request arrives from the proxy, so the limit must be keyed on the
// visitor address in X-Forwarded-For. Own file: node --test gives each file a fresh limiter.
test('behind the Render proxy each visitor has a separate assistant limit', async () => {
  process.env.RENDER = 'true';
  const server = createApp().listen(0);
  try {
    await new Promise((resolve) => server.once('listening', resolve));
    const url = `http://127.0.0.1:${server.address().port}/api/assistant/questions`;
    const ask = (visitor) => fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': visitor },
      body: JSON.stringify({ question: 'x' })
    });
    for (let attempt = 1; attempt <= 20; attempt += 1) await (await ask('203.0.113.1')).body?.cancel();
    assert.equal((await ask('203.0.113.1')).status, 429);
    assert.equal((await ask('203.0.113.2')).status, 422);
  } finally {
    server.close();
    delete process.env.RENDER;
  }
});
