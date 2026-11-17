/** A plain left click, not "open in new tab". */
const isPlainClick = (event) =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

/**
 * Opens project images in a native <dialog>.
 *
 * Every link inside a `[data-gallery]` element is one image of that gallery.
 * The links work without JavaScript; this only upgrades them, and leaves
 * modified clicks (new tab, new window) alone.
 *
 * @param {HTMLDialogElement | null} dialog
 */
export function initLightbox(dialog) {
  if (!dialog || typeof dialog.showModal !== 'function') return;

  const caption = dialog.querySelector('figcaption');
  // Created here and only attached while open: an <img> with no src is not valid markup.
  const image = document.createElement('img');
  const count = dialog.querySelector('.lightbox__count');
  const pager = dialog.querySelectorAll('[data-action="prev"], [data-action="next"], .lightbox__count');

  /** @type {HTMLAnchorElement[]} */
  let links = [];
  let index = 0;

  function show(position) {
    index = (position + links.length) % links.length; // wraps in both directions
    const link = links[index];
    image.src = link.href;
    caption.before(image);
    image.alt = link.querySelector('img')?.alt ?? link.dataset.caption ?? '';
    caption.textContent = link.dataset.caption ?? '';
    count.textContent = `${index + 1} / ${links.length}`;
    for (const control of pager) control.hidden = links.length < 2;
  }

  document.addEventListener('click', (event) => {
    const link = event.target.closest('[data-gallery] a[href]');
    if (!link || !isPlainClick(event)) return;
    event.preventDefault();
    links = [...link.closest('[data-gallery]').querySelectorAll('a[href]')];
    show(links.indexOf(link));
    dialog.showModal();
  });

  dialog.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'prev') show(index - 1);
    else if (action === 'next') show(index + 1);
    else if (action === 'close' || event.target === dialog) dialog.close(); // target is the dialog itself on a backdrop click
  });

  dialog.addEventListener('keydown', (event) => {
    if (links.length < 2) return;
    if (event.key === 'ArrowLeft') show(index - 1);
    if (event.key === 'ArrowRight') show(index + 1);
  });

  // Drop the large image when the viewer closes.
  dialog.addEventListener('close', () => {
    image.remove();
    image.removeAttribute('src');
  });
}
