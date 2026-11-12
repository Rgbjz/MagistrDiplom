import DOMPurify from 'isomorphic-dompurify';

/**
 * Lesson content is HTML written by teachers. Keep formatting, links, images,
 * code and tables; drop scripts, event handlers, iframes and inline styles.
 */
const ALLOWED_TAGS = [
  'p', 'br', 'hr', 'span', 'div', 'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup', 'mark', 'small',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'blockquote', 'pre', 'code', 'kbd',
  'a', 'img', 'figure', 'figcaption',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
];

const ALLOWED_ATTR = ['href', 'title', 'alt', 'src', 'width', 'height', 'colspan', 'rowspan', 'target', 'rel', 'lang'];

let hooked = false;

function ensureHook() {
  if (hooked) return;
  hooked = true;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    // Long code lines scroll sideways; keyboard users need to reach the box.
    if (node.tagName === 'PRE') {
      node.setAttribute('tabindex', '0');
      return;
    }
    if (node.tagName !== 'A') return;
    const href = node.getAttribute('href') ?? '';
    if (/^https?:\/\//i.test(href)) {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    } else {
      node.removeAttribute('target');
    }
  });
}

export function sanitizeHtml(html: string): string {
  ensureHook();
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|\/|#)/i,
  });
}
