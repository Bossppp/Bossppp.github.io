const RESET_AFTER_MS = 2000;

/** Selects an element's text so the visitor can copy it by hand. */
function selectText(element) {
  const range = document.createRange();
  range.selectNodeContents(element);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

/**
 * Turns every `<button data-copy="#selector">` into a copy button for the
 * text of the element it points at. Buttons start hidden in the markup and
 * only appear when the Clipboard API exists.
 *
 * @param {ParentNode} [root]
 */
export function initCopyButtons(root = document) {
  if (!navigator.clipboard) return;

  for (const button of root.querySelectorAll('button[data-copy]')) {
    const source = root.querySelector(button.dataset.copy);
    if (!source) continue;

    const label = button.textContent;
    let timer;

    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(source.textContent.trim());
        button.textContent = 'Copied';
      } catch {
        // Permission denied. Leave the text selected so one shortcut finishes the job.
        selectText(source);
        button.textContent = 'Selected';
      }
      clearTimeout(timer);
      timer = setTimeout(() => (button.textContent = label), RESET_AFTER_MS);
    });

    button.hidden = false;
  }
}
