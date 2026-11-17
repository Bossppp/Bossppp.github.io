/**
 * The homelab as data: a model of my network for the request tracer.
 *
 * The shape is real. The domain and addresses are examples, because the real
 * ones are meant to stay off the public internet.
 */

/** Display names for the boxes in the diagram (`data-node` in index.html). */
export const NODE_LABELS = Object.freeze({
  device: 'Your device',
  tailscale: 'Tailscale',
  pihole: 'Pi-hole',
  npm: 'Nginx Proxy Manager',
  kuma: 'Uptime Kuma',
  pve: 'Proxmox VE',
  upstream: 'Public resolver',
});

/**
 * @typedef {keyof typeof NODE_LABELS} NodeId
 * @typedef {{ node: NodeId, target: string }} Service
 * @typedef {{ exact: Set<string>, patterns: RegExp[] }} Blocklist
 * @typedef {{
 *   internalDomain: string,
 *   proxyAddress: string,
 *   services: Map<string, Service>,
 *   blocklist: Blocklist,
 * }} Network
 */

/** @type {Network} */
export const network = {
  // Split-horizon DNS: on the LAN or the VPN, Pi-hole answers every name
  // under this domain with the proxy's address. Public DNS has no such record.
  internalDomain: 'lab.example.com',

  // The Raspberry Pi. Nginx Proxy Manager listens here on port 443 and holds
  // the wildcard certificate for the internal domain.
  proxyAddress: '10.0.10.2',

  // One proxy host per service. A name under the internal domain that is not
  // listed here still resolves to the proxy, which then has nowhere to send it.
  services: new Map([
    ['pve.lab.example.com', { node: 'pve', target: 'https://10.0.10.10:8006' }],
    ['kuma.lab.example.com', { node: 'kuma', target: 'http://uptime-kuma:3001' }],
    ['pihole.lab.example.com', { node: 'pihole', target: 'http://pihole:80' }],
  ]),

  // A short sample. A real Pi-hole list has a few hundred thousand entries.
  blocklist: {
    // Gravity lists match one exact name each.
    exact: new Set([
      'doubleclick.net',
      'ad.doubleclick.net',
      'googlesyndication.com',
      'pagead2.googlesyndication.com',
      'googleadservices.com',
      'google-analytics.com',
      'www.google-analytics.com',
    ]),
    // Regex deny rules catch whole families, here every subdomain of one tracker.
    patterns: [/(^|\.)doubleclick\.net$/],
  },
};
