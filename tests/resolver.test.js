import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { network } from '../js/lab/network.js';
import { SINKHOLE, findBlockRule, finishForwarded, isUnder, trace } from '../js/lab/resolver.js';

/** The boxes a trace passes through, in order. Hops with no target end at their source. */
const path = (result) => result.hops.map((hop) => (hop.to ? `${hop.from}>${hop.to}` : hop.from));

describe('isUnder', () => {
  test('matches the domain and its subdomains, on a label boundary', () => {
    assert.equal(isUnder('lab.example.com', 'lab.example.com'), true);
    assert.equal(isUnder('a.b.lab.example.com', 'lab.example.com'), true);
    assert.equal(isUnder('notlab.example.com', 'lab.example.com'), false);
    assert.equal(isUnder('lab.example.com.evil.net', 'lab.example.com'), false);
  });
});

describe('findBlockRule', () => {
  test('exact entries match only that name', () => {
    assert.deepEqual(findBlockRule('google-analytics.com', network.blocklist), {
      kind: 'exact',
      rule: 'google-analytics.com',
    });
    assert.equal(findBlockRule('docs.google-analytics.com', network.blocklist), null);
  });

  test('regex rules catch every subdomain, but not lookalikes', () => {
    assert.equal(findBlockRule('stats.g.doubleclick.net', network.blocklist)?.kind, 'regex');
    assert.equal(findBlockRule('notdoubleclick.net', network.blocklist), null);
  });
});

describe('on the home network', () => {
  test('a known service is proxied over HTTPS and never leaves the LAN', () => {
    const result = trace('pve.lab.example.com', network);
    assert.equal(result.verdict, 'proxied');
    assert.deepEqual(path(result), ['device>pihole', 'pihole>device', 'device>npm', 'npm>pve', 'pve>device']);
    assert.ok(!result.awaitsUpstream);
    assert.ok(!path(result).some((step) => step.includes('upstream')));
  });

  test('every configured service has a route', () => {
    for (const [hostname, service] of network.services) {
      const result = trace(hostname, network);
      assert.equal(result.verdict, 'proxied', hostname);
      assert.ok(path(result).includes(`npm>${service.node}`), hostname);
    }
  });

  test('an unknown name under the wildcard reaches the proxy and stops there', () => {
    const result = trace('typo.lab.example.com', network);
    assert.equal(result.verdict, 'unrouted');
    assert.deepEqual(path(result), ['device>pihole', 'pihole>device', 'device>npm', 'npm>device']);
  });

  test('a blocklisted name is answered with the sinkhole address', () => {
    const result = trace('ad.doubleclick.net', network);
    assert.equal(result.verdict, 'blocked');
    assert.deepEqual(path(result), ['device>pihole', 'pihole>device', 'device']);
    assert.ok(result.hops[1].detail.includes(SINKHOLE));
  });

  test('any other name is forwarded and waits for a real answer', () => {
    const result = trace('github.com', network);
    assert.equal(result.verdict, 'forwarded');
    assert.equal(result.awaitsUpstream, true);
    assert.deepEqual(path(result), ['device>pihole', 'pihole>upstream']);
  });
});

describe('away from home', () => {
  test('on Tailscale the same request works, through the tunnel', () => {
    const result = trace('kuma.lab.example.com', network, 'tailscale');
    assert.equal(result.verdict, 'proxied');
    assert.equal(path(result)[0], 'device>tailscale');
    assert.deepEqual(path(result).slice(1), path(trace('kuma.lab.example.com', network, 'home')));
  });

  test('with no VPN the internal domain does not exist', () => {
    const result = trace('pve.lab.example.com', network, 'public');
    assert.equal(result.verdict, 'hidden');
    assert.deepEqual(path(result), ['device>upstream', 'upstream>device']);
  });

  test('with no VPN nothing touches the lab, and nothing is filtered', () => {
    const result = trace('ad.doubleclick.net', network, 'public');
    assert.equal(result.verdict, 'unfiltered');
    assert.equal(result.awaitsUpstream, true);
    assert.deepEqual(path(result), ['device>upstream']);
  });
});

describe('finishForwarded', () => {
  const pending = trace('github.com', network);
  const ok = { status: 'ok', addresses: ['140.82.112.3', '140.82.112.4'], ttl: 60, ms: 21 };

  test('at home the answer comes back through Pi-hole', () => {
    const result = finishForwarded(pending, 'github.com', ok);
    assert.equal(result.verdict, 'forwarded');
    assert.deepEqual(path(result), ['upstream>pihole', 'pihole>device', 'device']);
    assert.match(result.hops[0].detail, /140\.82\.112\.3 and 1 more, TTL 60s/);
  });

  test('with no VPN the answer goes straight to the device', () => {
    const outside = trace('github.com', network, 'public');
    assert.deepEqual(path(finishForwarded(outside, 'github.com', ok, 'public')), ['upstream>device', 'device']);
  });

  test('a name that does not exist changes the verdict', () => {
    assert.equal(finishForwarded(pending, 'nope.invalid', { status: 'nxdomain' }).verdict, 'nxdomain');
    assert.equal(finishForwarded(pending, 'ipv6-only.example', { status: 'nodata' }).verdict, 'nodata');
  });

  test('a failed lookup keeps the verdict and says the answer is missing', () => {
    const result = finishForwarded(pending, 'github.com', { status: 'unavailable' });
    assert.equal(result.verdict, 'forwarded');
    assert.match(result.summary, /did not get through/);
    assert.deepEqual(path(result), ['upstream']);
  });
});
