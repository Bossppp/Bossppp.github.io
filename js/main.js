// Entry point. The page is complete without this file; everything here is
// an enhancement layered on top of the HTML.

import { initCopyButtons } from './copy.js';
import { initTracer } from './lab/tracer.js';
import { initLightbox } from './lightbox.js';
import { initScrollSpy } from './nav.js';
import { initThemeToggle } from './theme.js';
import { initTimeline } from './timeline.js';

const $ = (selector) => document.querySelector(selector);

const features = {
  theme: () => initThemeToggle($('#theme-toggle')),
  nav: () => initScrollSpy($('.topbar__nav'), $('.footer')),
  copy: () => initCopyButtons(),
  lightbox: () => initLightbox($('#lightbox')),
  timeline: () => $('#degree-strip') && initTimeline($('#degree-strip')),
  tracer: () => $('#tracer') && initTracer($('#tracer')),
};

// Each feature starts on its own, so one failing never takes the others down.
for (const [name, start] of Object.entries(features)) {
  try {
    start();
  } catch (error) {
    console.error(`[${name}] failed to start`, error);
  }
}
