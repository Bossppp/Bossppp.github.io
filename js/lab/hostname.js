// One DNS label: letters, digits and hyphens, 1 to 63 characters, and no
// hyphen at either end (RFC 1123).
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const MAX_LENGTH = 253;

/**
 * @typedef {{ ok: true, hostname: string } | { ok: false, error: string }} ParsedHostname
 */

/**
 * Turns whatever was typed into a hostname the tracer can look up.
 *
 * People paste whole URLs, so the browser's own URL parser does the heavy
 * lifting: it lower-cases the name, converts international names to punycode,
 * and drops the scheme, credentials, port and path.
 *
 * @param {unknown} input
 * @returns {ParsedHostname}
 */
export function parseHostname(input) {
  const text = String(input ?? '').trim();
  if (!text) return fail('Type a hostname to trace.');

  let hostname;
  try {
    hostname = new URL(HAS_SCHEME.test(text) ? text : `http://${text}`).hostname;
  } catch {
    return fail('That does not look like a hostname.');
  }
  hostname = hostname.replace(/\.$/, ''); // "example.com." is the same name, fully qualified

  if (IPV4.test(hostname) || hostname.startsWith('[')) {
    return fail('That is an IP address, so there is no name to look up.');
  }
  if (hostname.length > MAX_LENGTH) {
    return fail(`Hostnames stop at ${MAX_LENGTH} characters.`);
  }

  const labels = hostname.split('.');
  if (!labels.every((label) => LABEL.test(label))) {
    return fail('Hostnames use letters, digits and hyphens, separated by dots.');
  }
  if (labels.length < 2) {
    return fail('Add a domain, for example pve.home.arpa.');
  }

  return { ok: true, hostname };
}

/** @returns {{ ok: false, error: string }} */
function fail(error) {
  return { ok: false, error };
}
