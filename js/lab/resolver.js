/**
 * Decides what happens to a request for one hostname, depending on where the
 * device is: at home, away on the VPN, or on the public internet.
 *
 * Pure functions only: no DOM, no network, no clock. The same input always
 * gives the same trace, which is what makes this easy to test
 * (see tests/resolver.test.js).
 */

import { NODE_LABELS } from './network.js';

/**
 * @typedef {import('./network.js').Network} Network
 * @typedef {import('./network.js').NodeId} NodeId
 * @typedef {'home' | 'tailscale' | 'public'} Vantage
 * @typedef {{ from: NodeId, to: NodeId | null, protocol: 'DNS' | 'VPN' | 'TLS' | 'HTTP' | 'PROXY' | 'TCP', detail: string }} Hop
 * @typedef {'proxied' | 'unrouted' | 'blocked' | 'hidden' | 'forwarded' | 'unfiltered' | 'nxdomain' | 'nodata'} Verdict
 * @typedef {{ verdict: Verdict, summary: string, hops: Hop[], awaitsUpstream?: boolean }} Trace
 * @typedef {{ kind: 'exact' | 'regex', rule: string }} BlockRule
 * @typedef {import('./doh.js').Answer} Answer
 */

/** @type {readonly Vantage[]} */
export const VANTAGES = Object.freeze(['home', 'tailscale', 'public']);

/** The address Pi-hole hands out for blocked names (its default "null" blocking mode). */
export const SINKHOLE = '0.0.0.0';

/** @returns {Hop} */
const hop = (from, to, protocol, detail) => ({ from, to, protocol, detail });

/**
 * True for the internal domain itself and for anything beneath it.
 * The dot matters: "notlab.example.com" is not under "lab.example.com".
 *
 * @param {string} hostname
 * @param {string} domain
 */
export function isUnder(hostname, domain) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

/**
 * @param {string} hostname
 * @param {Network['blocklist']} blocklist
 * @returns {BlockRule | null}
 */
export function findBlockRule(hostname, blocklist) {
  if (blocklist.exact.has(hostname)) return { kind: 'exact', rule: hostname };
  const pattern = blocklist.patterns.find((candidate) => candidate.test(hostname));
  return pattern ? { kind: 'regex', rule: pattern.source } : null;
}

/**
 * Follows one request as far as it can go without asking the real internet.
 *
 * Internal and blocked names are settled here. A public name comes back with
 * `awaitsUpstream`, and `finishForwarded` completes the trace once a real
 * DNS answer is in.
 *
 * @param {string} hostname  already validated, see hostname.js
 * @param {Network} network
 * @param {Vantage} [vantage]
 * @returns {Trace}
 */
export function trace(hostname, network, vantage = 'home') {
  if (vantage === 'public') return traceFromOutside(hostname, network);

  /** @type {Hop[]} */
  const hops = [];
  if (vantage === 'tailscale') {
    hops.push(hop('device', 'tailscale', 'VPN', 'WireGuard tunnel to the subnet router. No port is forwarded.'));
  }
  hops.push(hop('device', 'pihole', 'DNS', `A ${hostname}?`));

  if (isUnder(hostname, network.internalDomain)) {
    return traceInternal(hostname, network, hops);
  }

  const rule = findBlockRule(hostname, network.blocklist);
  if (rule) {
    const reason = rule.kind === 'exact' ? 'On the blocklist' : `Matches deny rule ${rule.rule}`;
    hops.push(
      hop('pihole', 'device', 'DNS', `${reason}. Answer: ${SINKHOLE}`),
      hop('device', null, 'TCP', `Nothing listens on ${SINKHOLE}. The request ends here.`),
    );
    return {
      verdict: 'blocked',
      summary: `${hostname} is blocked. Pi-hole answers ${SINKHOLE}, so nothing reaches the tracker.`,
      hops,
    };
  }

  hops.push(hop('pihole', 'upstream', 'DNS', 'Not internal and not blocked, so forwarded'));
  return {
    verdict: 'forwarded',
    summary: `${hostname} is not one of mine and not blocked. Pi-hole asks a public resolver.`,
    hops,
    awaitsUpstream: true,
  };
}

/**
 * On the LAN or the VPN: the wildcard record sends the name to the proxy.
 *
 * @param {string} hostname
 * @param {Network} network
 * @param {Hop[]} hops
 * @returns {Trace}
 */
function traceInternal(hostname, network, hops) {
  const { internalDomain, proxyAddress, services } = network;
  hops.push(
    hop('pihole', 'device', 'DNS', `Wildcard *.${internalDomain} answers ${proxyAddress}`),
    hop('device', 'npm', 'TLS', `Handshake on :443 with the *.${internalDomain} certificate`),
  );

  const service = services.get(hostname);
  if (!service) {
    hops.push(hop('npm', 'device', 'HTTP', 'No proxy host has this name, so it gets the default response'));
    return {
      verdict: 'unrouted',
      summary: `${hostname} resolves to the proxy, but no service is set up under that name.`,
      hops,
    };
  }

  hops.push(
    hop('npm', service.node, 'PROXY', `Proxy host matched, passed to ${service.target}`),
    hop(service.node, 'device', 'HTTP', '200 OK, back through the proxy over HTTPS'),
  );
  return {
    verdict: 'proxied',
    summary: `${hostname} never leaves the network. The reverse proxy hands it to ${NODE_LABELS[service.node]} over HTTPS.`,
    hops,
  };
}

/**
 * Off the network with no VPN: the lab is not involved at all.
 *
 * @param {string} hostname
 * @param {Network} network
 * @returns {Trace}
 */
function traceFromOutside(hostname, network) {
  const hops = [hop('device', 'upstream', 'DNS', `A ${hostname}?`)];

  if (isUnder(hostname, network.internalDomain)) {
    hops.push(hop('upstream', 'device', 'DNS', 'NXDOMAIN: public DNS has no record of this name'));
    return {
      verdict: 'hidden',
      summary: `From outside, ${hostname} does not exist. The name only resolves on the LAN or the VPN.`,
      hops,
    };
  }

  const unfiltered = findBlockRule(hostname, network.blocklist) !== null;
  return {
    verdict: unfiltered ? 'unfiltered' : 'forwarded',
    summary: unfiltered
      ? `${hostname} is on my blocklist, but away from the lab nothing filters it.`
      : `${hostname} is looked up by whatever resolver the current network provides.`,
    hops,
    awaitsUpstream: true,
  };
}

/**
 * Completes a trace that was waiting on a real DNS answer.
 *
 * @param {Trace} pending   the trace returned by `trace` with `awaitsUpstream`
 * @param {string} hostname
 * @param {Answer} answer
 * @param {Vantage} [vantage]
 * @returns {Trace}  only the hops that come after the pending ones
 */
export function finishForwarded(pending, hostname, answer, vantage = 'home') {
  // At home and on the VPN the answer comes back through Pi-hole.
  const deliver = (detail) =>
    vantage === 'public'
      ? [hop('upstream', 'device', 'DNS', detail)]
      : [hop('upstream', 'pihole', 'DNS', detail), hop('pihole', 'device', 'DNS', 'Answer passed on and cached')];

  switch (answer.status) {
    case 'ok': {
      const [first, ...rest] = answer.addresses;
      const others = rest.length ? ` and ${rest.length} more` : '';
      return {
        verdict: pending.verdict,
        summary: pending.summary,
        hops: [
          ...deliver(`${first}${others}, TTL ${answer.ttl}s (live answer in ${answer.ms} ms)`),
          hop('device', null, 'TCP', `Connects straight to ${first}. The lab is not in the path.`),
        ],
      };
    }
    case 'nxdomain':
      return {
        verdict: 'nxdomain',
        summary: `${hostname} does not exist. The public resolver says so.`,
        hops: deliver('NXDOMAIN: no such name'),
      };
    case 'nodata':
      return {
        verdict: 'nodata',
        summary: `${hostname} exists but has no IPv4 address to connect to.`,
        hops: deliver('No A record for this name'),
      };
    default:
      return {
        verdict: pending.verdict,
        summary: `${pending.summary} The live lookup did not get through from this browser.`,
        hops: [hop('upstream', null, 'DNS', 'No live answer: the lookup was blocked or timed out')],
      };
  }
}
