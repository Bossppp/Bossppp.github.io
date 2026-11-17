/**
 * The request tracer's user interface. All decisions live in resolver.js;
 * this file only turns a trace into DOM and keeps one run alive at a time.
 */

import { el } from '../dom.js';
import { lookupA } from './doh.js';
import { parseHostname } from './hostname.js';
import { NODE_LABELS, network as homeNetwork } from './network.js';
import { VANTAGES, finishForwarded, trace } from './resolver.js';

/** How each verdict is announced. `tone` picks the pill colour in styles.css. */
const VERDICTS = {
  proxied: { pill: 'Proxied', tone: 'ok' },
  blocked: { pill: 'Blocked', tone: 'blocked' },
  hidden: { pill: 'Hidden', tone: 'ok' },
  forwarded: { pill: 'Forwarded', tone: 'info' },
  unfiltered: { pill: 'Not filtered', tone: 'blocked' },
  unrouted: { pill: 'No such service', tone: 'neutral' },
  nxdomain: { pill: 'No such name', tone: 'neutral' },
  nodata: { pill: 'No address', tone: 'neutral' },
  tracing: { pill: 'Tracing', tone: 'neutral' },
};

/** Where each box sits, left to right. Used to pick the wires between two boxes. */
const ZONE = { device: 0, tailscale: 1, pihole: 1, npm: 1, kuma: 1, pve: 2, upstream: 3 };
const WIRES_BETWEEN = { '0-1': ['a'], '1-2': ['b'], '0-2': ['a', 'b'], '1-3': ['c'] };

/** @param {import('./resolver.js').Hop} hop */
function wiresFor(hop) {
  if (!hop.to) return [];
  const zones = [ZONE[hop.from], ZONE[hop.to]].sort();
  return WIRES_BETWEEN[zones.join('-')] ?? [];
}

/** Resolves after `ms`, or straight away if the run was cancelled. */
function pause(ms, signal) {
  return new Promise((resolve) => {
    if (ms <= 0 || signal.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => (clearTimeout(timer), resolve()), { once: true });
  });
}

/**
 * @param {HTMLElement} root  the `.lab` section
 * @param {{
 *   network?: import('./network.js').Network,
 *   lookup?: typeof lookupA,
 *   stepMs?: number,
 * }} [options]  injectable for tests and for other network models
 */
export function initTracer(root, { network = homeNetwork, lookup = lookupA, stepMs = 240 } = {}) {
  const form = root.querySelector('form');
  const input = form.elements.namedItem('host');
  const error = root.querySelector('.lab__error');
  const output = root.querySelector('.trace');
  const topology = root.querySelector('.topology');
  const presets = [...root.querySelectorAll('[data-host]')];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const pill = el('span', { class: 'verdict__pill' });
  const summary = el('span', { class: 'verdict__text' });
  const verdictLine = el('p', { class: 'verdict' }, pill, summary);
  const hopList = el('ol', { class: 'hops' });
  output.replaceChildren(verdictLine, hopList);

  /** Cancels the previous run: its timers, its DNS request and its rendering. */
  let controller = new AbortController();

  const vantage = () => {
    const chosen = new FormData(form).get('vantage');
    return VANTAGES.includes(chosen) ? chosen : 'home';
  };

  function showError(message) {
    error.textContent = message;
    error.hidden = !message;
    input.setAttribute('aria-invalid', String(Boolean(message)));
  }

  function showVerdict(key, text) {
    const { pill: label, tone } = VERDICTS[key];
    pill.textContent = label;
    summary.textContent = text;
    verdictLine.dataset.tone = tone;
  }

  function resetDiagram() {
    topology.dataset.vantage = vantage();
    for (const lit of topology.querySelectorAll('[data-active]')) lit.removeAttribute('data-active');
  }

  /** @param {import('./resolver.js').Hop} hop */
  function drawHop(hop, { pending = false } = {}) {
    const path = hop.to ? `${NODE_LABELS[hop.from]} → ${NODE_LABELS[hop.to]}` : NODE_LABELS[hop.from];
    const row = el(
      'li',
      { class: pending ? 'hop is-entering is-pending' : 'hop is-entering' },
      el('span', { class: 'hop__proto', text: hop.protocol }),
      el('span', { class: 'hop__path', text: path }),
      el('span', { class: 'hop__detail', text: hop.detail }),
    );
    hopList.append(row);

    for (const id of [hop.from, hop.to]) {
      topology.querySelector(`[data-node="${id}"]`)?.setAttribute('data-active', '');
    }
    for (const wire of wiresFor(hop)) {
      topology.querySelector(`.wire--${wire}`)?.setAttribute('data-active', '');
    }
    return row;
  }

  async function play(hops, delay, signal) {
    for (const hop of hops) {
      await pause(delay, signal);
      if (signal.aborted) return;
      drawHop(hop);
    }
  }

  /**
   * @param {string} typed
   * @param {{ animate?: boolean }} [options]
   */
  async function run(typed, { animate = true } = {}) {
    const parsed = parseHostname(typed);
    showError(parsed.ok ? '' : parsed.error);
    if (!parsed.ok) return;

    const { hostname } = parsed;
    const from = vantage();
    input.value = hostname;
    for (const preset of presets) {
      preset.setAttribute('aria-pressed', String(preset.dataset.host === hostname));
    }

    controller.abort();
    controller = new AbortController();
    const { signal } = controller;
    const delay = animate && !reducedMotion.matches ? stepMs : 0;

    resetDiagram();
    hopList.replaceChildren();
    showVerdict('tracing', hostname);

    const first = trace(hostname, network, from);
    await play(first.hops, delay, signal);
    if (signal.aborted) return;

    if (!first.awaitsUpstream) {
      showVerdict(first.verdict, first.summary);
      return;
    }

    const waiting = drawHop(
      { from: 'upstream', to: null, protocol: 'DNS', detail: 'Asking a real resolver over DNS-over-HTTPS' },
      { pending: true },
    );
    const answer = await lookup(hostname, { signal }).catch(() => ({ status: 'unavailable' }));
    if (signal.aborted) return; // a newer run owns the panel now
    waiting.remove();

    const rest = finishForwarded(first, hostname, answer, from);
    await play(rest.hops, delay, signal);
    if (signal.aborted) return;
    showVerdict(rest.verdict, rest.summary);
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    run(input.value);
  });
  form.addEventListener('change', (event) => {
    if (event.target.name === 'vantage') run(input.value);
  });
  for (const preset of presets) {
    preset.addEventListener('click', () => run(preset.dataset.host));
  }

  // Start with a finished trace, so the panel explains itself before anyone
  // touches it. Announce later changes to screen readers, but not this one.
  run(input.value, { animate: false }).then(() => summary.setAttribute('aria-live', 'polite'));
}
