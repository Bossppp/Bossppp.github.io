import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { lookupA, parseAnswer } from '../js/lab/doh.js';

const A = 1;
const CNAME = 5;

describe('parseAnswer', () => {
  test('collects A records and reports the shortest TTL', () => {
    const answer = parseAnswer({
      Status: 0,
      Answer: [
        { type: CNAME, TTL: 3600, data: 'edge.example.net.' },
        { type: A, TTL: 300, data: '192.0.2.10' },
        { type: A, TTL: 60, data: '192.0.2.11' },
      ],
    });
    assert.deepEqual(answer, { status: 'ok', addresses: ['192.0.2.10', '192.0.2.11'], ttl: 60 });
  });

  test('tells a missing name from a name with no address', () => {
    assert.deepEqual(parseAnswer({ Status: 3 }), { status: 'nxdomain' });
    assert.deepEqual(parseAnswer({ Status: 0 }), { status: 'nodata' });
    assert.deepEqual(parseAnswer({ Status: 0, Answer: [{ type: CNAME, TTL: 60, data: 'x.' }] }), { status: 'nodata' });
  });

  test('treats resolver errors as unavailable', () => {
    assert.deepEqual(parseAnswer({ Status: 2 }), { status: 'unavailable' }); // SERVFAIL
  });
});

describe('lookupA', () => {
  const reply = (body, init) => async () => new Response(JSON.stringify(body), init);

  test('asks for the A record as DNS JSON', async () => {
    let requested;
    const fetchImpl = async (url, options) => {
      requested = { url, accept: options.headers.accept };
      return new Response(JSON.stringify({ Status: 0, Answer: [{ type: A, TTL: 30, data: '192.0.2.1' }] }));
    };
    const answer = await lookupA('example.com', { fetchImpl });

    assert.equal(requested.url, 'https://cloudflare-dns.com/dns-query?name=example.com&type=A');
    assert.equal(requested.accept, 'application/dns-json');
    assert.equal(answer.status, 'ok');
    assert.deepEqual(answer.addresses, ['192.0.2.1']);
    assert.equal(typeof answer.ms, 'number');
  });

  test('rejects on an HTTP error', async () => {
    await assert.rejects(lookupA('example.com', { fetchImpl: reply({}, { status: 500 }) }), /Resolver replied 500/);
  });

  test('gives up after the timeout', async () => {
    const never = (_url, { signal }) =>
      new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
    await assert.rejects(lookupA('example.com', { fetchImpl: never, timeoutMs: 10 }), { name: 'TimeoutError' });
  });

  test('stops when the caller aborts', async () => {
    const controller = new AbortController();
    const never = (_url, { signal }) =>
      new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
    const pending = lookupA('example.com', { fetchImpl: never, signal: controller.signal });
    controller.abort(new Error('superseded'));
    await assert.rejects(pending, /superseded/);
  });
});
