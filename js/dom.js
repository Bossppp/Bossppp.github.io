/**
 * Tiny element builder. Text always goes through textContent, so nothing a
 * visitor types can end up parsed as HTML.
 *
 * @param {string} tag
 * @param {{ class?: string, text?: string, data?: Record<string, string>, [attribute: string]: unknown }} [props]
 * @param {...(Node | string)} children
 * @returns {HTMLElement}
 */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = String(value);
    else if (key === 'text') node.textContent = String(value);
    else if (key === 'data') Object.assign(node.dataset, value);
    else node.setAttribute(key, String(value));
  }
  node.append(...children);
  return node;
}
