import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api.js';

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => vi.unstubAllGlobals());

// D2 regression: every failure must end in an Error with a message a customer can act on.
describe('api request failures', () => {
  it('turns a network failure into a readable message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(api.getProducts()).rejects.toMatchObject({
      message: 'Could not reach the ShopSmart server. Check your connection and try again.',
      code: 'NETWORK_ERROR'
    });
  });

  it('shows the server message from a JSON error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(409, { error: { code: 'INSUFFICIENT_STOCK', message: 'Only 3 unit(s) of Keyboard are available.' } })));
    await expect(api.createOrder({})).rejects.toMatchObject({ message: 'Only 3 unit(s) of Keyboard are available.', status: 409, code: 'INSUFFICIENT_STOCK' });
  });

  it('falls back to the status when the error body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Bad gateway', { status: 502 })));
    await expect(api.askAssistant('keyboard')).rejects.toMatchObject({ message: 'Request failed with status 502.', status: 502 });
  });

  it('returns the data of a successful response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { status: 'ok' })));
    await expect(api.getProduct(1)).resolves.toEqual({ status: 'ok' });
  });
});
