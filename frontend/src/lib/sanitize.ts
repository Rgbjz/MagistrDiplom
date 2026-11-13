import sanitize from 'sanitize-html';

/**
 * Lesson content is HTML written by teachers. Keep formatting, links, images,
 * code and tables; drop scripts, event handlers, iframes and inline styles.
 *
 * sanitize-html is plain JS (no DOM), so the same rules run during server
 * rendering and in the browser and both produce identical markup.
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

const SAFE_URL = /^(?:https?:|mailto:|\/|#)/i;

const OPTIONS: sanitize.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: { '*': ALLOWED_ATTR },
  // URL checks are done in exclusiveFilter/transformTags below, so relative
  // links ("/…", "#…") pass and every other scheme is dropped.
  allowedSchemes: ['http', 'https', 'mailto'],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  transformTags: {
    // Long code lines scroll sideways; keyboard users need to reach the box.
    pre: (tagName, attribs) => ({ tagName, attribs: { ...attribs, tabindex: '0' } }),
    a: (tagName, attribs) => {
      const rest = { ...attribs };
      delete rest.target;
      delete rest.rel;
      const href = attribs.href ?? '';
      if (href && !SAFE_URL.test(href)) delete rest.href;
      return /^https?:\/\//i.test(href)
        ? { tagName, attribs: { ...rest, target: '_blank', rel: 'noopener noreferrer' } }
        : { tagName, attribs: rest };
    },
    img: (tagName, attribs) => {
      const { src, ...rest } = attribs;
      return { tagName, attribs: src && SAFE_URL.test(src) ? { ...rest, src } : rest };
    },
  },
};

export function sanitizeHtml(html: string): string {
  return sanitize(html, {
    ...OPTIONS,
    // tabindex is added by transformTags, not accepted from the input.
    allowedAttributes: { ...OPTIONS.allowedAttributes, pre: ['tabindex'] },
  });
}
