import sanitizeHtmlLib, { IOptions } from 'sanitize-html';

export const SANITIZE_HTML_OPTIONS: IOptions = {
  allowedTags: [
    'p',
    'br',
    'b',
    'i',
    'em',
    'strong',
    'u',
    'ul',
    'ol',
    'li',
    'code',
    'pre',
    'blockquote',
    'a',
    'h1',
    'h2',
    'h3',
    'h4',
  ],
  allowedAttributes: {
    a: ['href', 'name', 'target', 'rel'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: {
    a: ['http', 'https', 'mailto'],
  },
  allowedSchemesAppliedToAttributes: ['href'],
  allowProtocolRelative: false,
  nonTextTags: [
    'script',
    'style',
    'iframe',
    'noembed',
    'noframes',
    'noscript',
    'textarea',
    'object',
    'embed',
    'svg',
    'math',
  ],
  transformTags: {
    a: (tagName, attribs) => {
      // Ensure target="_blank" always includes rel="noopener noreferrer"
      if (attribs.target === '_blank') {
        attribs.rel = 'noopener noreferrer';
      }
      return {
        tagName: 'a',
        attribs,
      };
    },
  },
};

/**
 * Robust, parser-based HTML sanitization adhering to Phase 6.4-A security requirements.
 * Replaces fragile regex replacement with allowlist-based tokenized parsing.
 * Discards executable scripts, styles, objects, iframes, SVG constructs,
 * event-handler attributes (on*), and non-whitelisted URL schemes (javascript:, vbscript:, data:).
 */
export function sanitizeHtml(input: string, options?: IOptions): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  return sanitizeHtmlLib(input, options || SANITIZE_HTML_OPTIONS);
}
