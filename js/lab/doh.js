/**
 * DNS-over-HTTPS client for the one lookup the tracer cannot fake: asking a
 * real resolver about a public name. Uses Cloudflare's JSON API.
 * https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests/dns-json/
 */

const ENDPOINT = 'https://cloudflare-dns.com/dns-query';
const TIMEOUT_MS = 4000;

// Values from the DNS spec (RFC 1035).
const RCODE = { NOERROR: 0, NXDOMAIN: 3 };
const TYPE_A = 1;

/**
 * @typedef {{ status: 'ok', addresses: string[], ttl: number, ms?: number }
 *         | { status: 'nxdomain' | 'nodata' | 'unavailable' }} Answer
 */

/**
 * Reduces a DNS JSON response to what the tracer shows.
 * Kept apart from the fetch so it can be tested with canned responses.
 *
 * @param {{ Status: number, Answer?: { type: number, TTL: number, data: string }[] }} body
 * @returns {Answer}
 */
export function parseAnswer(body) {
  if (body.Status === RCODE.NXDOMAIN) return { status: 'nxdomain' };
  if (body.Status !== RCODE.NOERROR) return { status: 'unavailable' };

  // A CNAME chain arrives in the same list. Only the A records are addresses.
  const records = (body.Answer ?? []).filter((record) => record.type === TYPE_A);
  if (records.length === 0) return { status: 'nodata' };

  return {
    status: 'ok',
    addresses: records.map((record) => record.data),
    ttl: Math.min(...records.map((record) => record.TTL)),
  };
}

/**
 * Looks up the A records of a hostname.
 *
 * Rejects if the request fails, times out, or `signal` aborts. The caller
 * decides what a failure means.
 *
 * @param {string} hostname
 * @param {{ signal?: AbortSignal, timeoutMs?: number, fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<Answer>}
 */
export async function lookupA(hostname, { signal, timeoutMs = TIMEOUT_MS, fetchImpl = fetch } = {}) {
  // One controller for both ways out: the caller giving up, or the clock.
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException('DNS lookup timed out', 'TimeoutError')), timeoutMs);

  const url = `${ENDPOINT}?name=${encodeURIComponent(hostname)}&type=A`;
  const started = performance.now();
  try {
    const response = await fetchImpl(url, {
      headers: { accept: 'application/dns-json' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Resolver replied ${response.status}`);
    const answer = parseAnswer(await response.json());
    return answer.status === 'ok' ? { ...answer, ms: Math.round(performance.now() - started) } : answer;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
