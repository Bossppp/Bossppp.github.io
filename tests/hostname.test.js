import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseHostname } from '../js/lab/hostname.js';

test('accepts a plain hostname', () => {
  assert.deepEqual(parseHostname('pve.lab.example.com'), { ok: true, hostname: 'pve.lab.example.com' });
});

test('normalises case, whitespace and a trailing dot', () => {
  assert.equal(parseHostname('  GitHub.COM.  ').hostname, 'github.com');
});

test('keeps only the host from a pasted URL', () => {
  assert.equal(parseHostname('https://user:secret@example.com:8443/path?q=1#top').hostname, 'example.com');
});

test('converts international names to punycode', () => {
  assert.equal(parseHostname('ไทย.example.com').hostname, 'xn--o3cw4h.example.com');
});

test('rejects input with a reason the visitor can act on', () => {
  const cases = {
    '': /Type a hostname/,
    '   ': /Type a hostname/,
    'pve': /Add a domain/,
    '10.0.10.2': /IP address/,
    'http://[::1]/': /IP address/,
    'bad_label.example.com': /letters, digits and hyphens/,
    '-leading.example.com': /letters, digits and hyphens/,
    'two words.example.com': /does not look like a hostname/,
    [`${'a'.repeat(64)}.example.com`]: /letters, digits and hyphens/,
    [`${'a.'.repeat(130)}com`]: /253 characters/,
  };
  for (const [input, reason] of Object.entries(cases)) {
    const result = parseHostname(input);
    assert.equal(result.ok, false, `expected "${input}" to be rejected`);
    assert.match(result.error, reason);
  }
});

test('accepts labels at the 63-character limit', () => {
  assert.equal(parseHostname(`${'a'.repeat(63)}.example.com`).ok, true);
});
