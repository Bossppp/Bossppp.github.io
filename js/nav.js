/**
 * Marks the nav link of the section currently being read.
 *
 * A section counts as current while it crosses a thin band a third of the
 * way down the viewport. Sections never overlap, so at most one is in the
 * band. The last section is too short to ever reach it, so reaching the end
 * of the page (the footer coming into view) marks the last link instead.
 *
 * @param {HTMLElement | null} nav
 * @param {Element | null} pageEnd  an element at the very bottom of the page
 */
export function initScrollSpy(nav, pageEnd) {
  if (!nav || !('IntersectionObserver' in window)) return;

  /** @type {Map<Element, HTMLAnchorElement>} */
  const linkFor = new Map();
  for (const link of nav.querySelectorAll('a[href^="#"]')) {
    const section = document.getElementById(link.hash.slice(1));
    if (section) linkFor.set(section, link);
  }
  const links = [...linkFor.values()];

  /** @type {HTMLAnchorElement | null} */
  let inBand = null;
  let atEnd = false;

  function render() {
    const current = atEnd ? links.at(-1) : inBand;
    for (const link of links) {
      if (link === current) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    }
  }

  const band = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const link = linkFor.get(entry.target);
        if (entry.isIntersecting) inBand = link;
        else if (inBand === link) inBand = null;
      }
      render();
    },
    { rootMargin: '-33% 0px -66% 0px' },
  );
  for (const section of linkFor.keys()) band.observe(section);

  if (pageEnd) {
    new IntersectionObserver(([entry]) => {
      atEnd = entry.isIntersecting;
      render();
    }).observe(pageEnd);
  }
}
