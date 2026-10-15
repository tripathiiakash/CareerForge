import {
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import sanitizeHtmlLib, { IOptions } from 'sanitize-html';
import { parseDocument, DomUtils } from 'htmlparser2';

export interface ExtractedLink {
  url: string;
  text: string;
}

export interface HtmlResumeParseResult {
  text: string;
  links: ExtractedLink[];
}

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

const HTML_SANITIZE_OPTIONS: IOptions = {
  allowedTags: [
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'p',
    'div',
    'span',
    'a',
    'ul',
    'ol',
    'li',
    'table',
    'tbody',
    'thead',
    'tfoot',
    'tr',
    'td',
    'th',
    'br',
    'hr',
    'section',
    'article',
    'header',
    'footer',
    'main',
    'aside',
    'b',
    'strong',
    'i',
    'em',
    'code',
    'pre',
    'blockquote',
    'dl',
    'dt',
    'dd',
  ],
  allowedAttributes: {
    a: ['href'],
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
    'textarea',
    'option',
    'noscript',
    'head',
    'iframe',
    'noembed',
    'noframes',
    'object',
    'embed',
    'form',
    'svg',
    'canvas',
    'video',
    'audio',
    'math',
  ],
};

@Injectable()
export class HtmlParserService {
  private readonly logger = new Logger(HtmlParserService.name);

  /**
   * Parses an uploaded HTML resume buffer server-side without executing scripts or rendering in a browser.
   * Extracts readable text and preserves useful anchor links alongside their associated text.
   * Rejects dangerous URL schemes (e.g., javascript:, data:, vbscript:).
   */
  async extractResume(buffer: Buffer): Promise<HtmlResumeParseResult> {
    try {
      if (!buffer || buffer.length === 0) {
        throw new UnprocessableEntityException({
          code: 'EMPTY_HTML_CONTENT',
          message: 'The HTML resume contains no readable text.',
        });
      }

      // Detect binary content (null bytes indicate non-text binary data)
      if (buffer.includes(0)) {
        throw new UnprocessableEntityException({
          code: 'INVALID_HTML_FORMAT',
          message: 'The HTML file contains invalid binary content.',
        });
      }

      // Convert buffer to UTF-8 string and strip UTF-8 BOM if present
      let rawHtml = buffer.toString('utf8');
      if (rawHtml.charCodeAt(0) === 0xfeff) {
        rawHtml = rawHtml.slice(1);
      }

      // Basic structure validation: check for HTML markup tags
      if (!/<[a-z!][\s\S]*>/i.test(rawHtml)) {
        throw new UnprocessableEntityException({
          code: 'INVALID_HTML_FORMAT',
          message: 'The file does not contain valid HTML markup.',
        });
      }

      // Step 1: Sanitize untrusted HTML strictly
      const sanitizedHtml = sanitizeHtmlLib(rawHtml, HTML_SANITIZE_OPTIONS);

      // Step 2: Parse DOM tree
      const doc = parseDocument(sanitizedHtml);

      // Step 3: Extract and validate anchor links
      const links: ExtractedLink[] = [];
      const anchorTags = DomUtils.getElementsByTagName('a', doc);

      for (const a of anchorTags) {
        const rawHref = DomUtils.getAttributeValue(a, 'href');
        const anchorText = DomUtils.getText(a).trim();

        if (rawHref && this.isSafeUrl(rawHref)) {
          const cleanUrl = rawHref.trim();
          links.push({
            url: cleanUrl,
            text: anchorText || cleanUrl,
          });

          // In-place replace anchor element in DOM to preserve link URL in text
          const replacementText =
            anchorText && !anchorText.includes(cleanUrl)
              ? `${anchorText} [${cleanUrl}]`
              : cleanUrl || anchorText;

          DomUtils.replaceElement(a, {
            type: 'text',
            data: replacementText,
          } as any);
        } else {
          // Dangerous scheme (e.g. javascript:, data:) or missing href: keep only benign text
          DomUtils.replaceElement(a, {
            type: 'text',
            data: anchorText,
          } as any);
        }
      }

      // Step 4: Extract text with layout-preserving block spacing
      let text = this.domToText(doc);

      // Strip null bytes to protect database text column
      text = text.replace(/\u0000/g, '');
      text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      text = text.replace(/[ \t]+/g, ' ');
      text = text.replace(/\n\s*\n\s*\n+/g, '\n\n');
      text = text.trim();

      // Step 5: Append extracted profile links summary section if safe links are found
      if (links.length > 0) {
        const uniqueLinks = new Map<string, string>();
        for (const link of links) {
          if (!uniqueLinks.has(link.url)) {
            uniqueLinks.set(link.url, link.text);
          }
        }

        const linkSummaryLines: string[] = [];
        for (const [url, linkText] of uniqueLinks.entries()) {
          if (linkText && linkText !== url) {
            linkSummaryLines.push(`- ${linkText}: ${url}`);
          } else {
            linkSummaryLines.push(`- ${url}`);
          }
        }

        if (linkSummaryLines.length > 0) {
          text += `\n\nExtracted Profiles & Links:\n${linkSummaryLines.join('\n')}`;
        }
      }

      if (!text.trim()) {
        throw new UnprocessableEntityException({
          code: 'EMPTY_HTML_CONTENT',
          message: 'The HTML resume contains no readable text.',
        });
      }

      return { text, links };
    } catch (error: unknown) {
      if (error instanceof UnprocessableEntityException) {
        throw error;
      }
      this.logger.error('Failed to parse HTML document', error);
      throw new UnprocessableEntityException({
        code: 'INVALID_HTML_FORMAT',
        message: 'Failed to extract text from HTML resume.',
      });
    }
  }

  /**
   * Helper conforming to PdfParserService interface for direct worker consumption.
   */
  async extractText(buffer: Buffer): Promise<string> {
    const { text } = await this.extractResume(buffer);
    return text;
  }

  /**
   * Validates whether a URL uses an approved, safe scheme and is not protocol-relative or malicious.
   */
  private isSafeUrl(rawUrl?: string | null): boolean {
    if (!rawUrl || typeof rawUrl !== 'string') return false;
    const trimmed = rawUrl.trim();

    // Reject protocol-relative URLs (e.g., "//malicious.com") and control characters
    if (trimmed.startsWith('//') || /[\x00-\x1F\x7F]/.test(trimmed)) {
      return false;
    }

    try {
      const parsed = new URL(trimmed);
      return ALLOWED_PROTOCOLS.has(parsed.protocol.toLowerCase());
    } catch {
      return false;
    }
  }

  /**
   * Recursively walks DOM nodes to generate clean, readable text with spacing around block elements.
   */
  private domToText(node: any): string {
    if (!node) return '';
    if (DomUtils.isText(node)) {
      return node.data || '';
    }

    const blockTags = new Set([
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'p',
      'div',
      'li',
      'tr',
      'table',
      'section',
      'article',
      'header',
      'footer',
      'main',
      'aside',
      'blockquote',
      'hr',
      'br',
      'dt',
      'dd',
    ]);

    const isBlock =
      DomUtils.isTag(node) && blockTags.has(node.name?.toLowerCase());

    let childText = '';
    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        childText += this.domToText(child);
      }
    }

    if (isBlock) {
      return '\n' + childText + '\n';
    }
    return childText;
  }
}
