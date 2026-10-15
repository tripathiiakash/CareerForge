const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  UnprocessableEntityException,
} = require('@nestjs/common');
const { UserRole } = require('@prisma/client');
const {
  HtmlParserService,
} = require('../dist/modules/resume/services/html-parser.service');
const { ResumeService } = require('../dist/modules/resume/resume.service');
const {
  ResumeController,
} = require('../dist/modules/resume/resume.controller');
const {
  ResumeExtractionWorker,
} = require('../dist/modules/resume/workers/resume-extraction.worker');

describe('Secure HTML Resume Upload & Processing Test Suite', () => {
  describe('1. HtmlParserService Unit Tests', () => {
    let parser;

    beforeEach(() => {
      parser = new HtmlParserService();
    });

    it('should parse valid HTML resume and extract readable text and useful links', async () => {
      const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head><title>Jane Doe - Resume</title></head>
        <body>
          <h1>Jane Doe</h1>
          <p>Senior Full-Stack Engineer with 5 years experience.</p>
          <h2>Profiles & Links</h2>
          <ul>
            <li>GitHub: <a href="https://github.com/janedoe">Jane Doe GitHub</a></li>
            <li>LinkedIn: <a href="https://linkedin.com/in/janedoe">Jane LinkedIn</a></li>
            <li>Portfolio: <a href="https://janedoe.dev">janedoe.dev</a></li>
            <li>Email: <a href="mailto:jane@example.com">jane@example.com</a></li>
          </ul>
          <h2>Technical Skills</h2>
          <p>TypeScript, Node.js, React, PostgreSQL, Docker.</p>
        </body>
        </html>
      `;

      const buffer = Buffer.from(html, 'utf8');
      const result = await parser.extractResume(buffer);

      assert.ok(result.text);
      assert.match(result.text, /Jane Doe/);
      assert.match(result.text, /Senior Full-Stack Engineer/);
      assert.match(result.text, /TypeScript, Node\.js/);

      // Verify links preserved alongside text
      assert.match(
        result.text,
        /Jane Doe GitHub \[https:\/\/github\.com\/janedoe\]/
      );
      assert.match(
        result.text,
        /Jane LinkedIn \[https:\/\/linkedin\.com\/in\/janedoe\]/
      );
      assert.match(result.text, /https:\/\/janedoe\.dev/);

      // Verify extracted links array
      assert.equal(result.links.length, 4);
      const urls = result.links.map((l) => l.url);
      assert.ok(urls.includes('https://github.com/janedoe'));
      assert.ok(urls.includes('https://linkedin.com/in/janedoe'));
      assert.ok(urls.includes('https://janedoe.dev'));
      assert.ok(urls.includes('mailto:jane@example.com'));

      // Verify plug-compatible extractText method
      const textOnly = await parser.extractText(buffer);
      assert.equal(textOnly, result.text);
    });

    it('should strip script injection and style tags without executing or leaking script content', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>body { display: none; background: red; }</style>
          <script>window.__pwned = true; document.location = 'http://attacker.com';</script>
        </head>
        <body>
          <h1>Alex Candidate</h1>
          <script type="text/javascript">alert('XSS Exploit');</script>
          <p onclick="alert(1)">Software Engineer</p>
          <iframe src="http://attacker.com/cookie-stealer"></iframe>
          <object data="http://attacker.com/exploit.swf"></object>
          <embed src="http://attacker.com/malware.exe">
        </body>
        </html>
      `;

      const buffer = Buffer.from(html, 'utf8');
      const result = await parser.extractResume(buffer);

      assert.match(result.text, /Alex Candidate/);
      assert.match(result.text, /Software Engineer/);
      // Script and style text must be completely eliminated
      assert.ok(!result.text.includes('__pwned'));
      assert.ok(!result.text.includes('XSS Exploit'));
      assert.ok(!result.text.includes('attacker.com'));
      assert.ok(!result.text.includes('background: red'));
    });

    it('should reject dangerous URL schemes (javascript:, data:, vbscript:, file:) and keep only benign anchor text', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <body>
          <h1>Hacker Resume</h1>
          <p>
            Bad link 1: <a href="javascript:alert(document.cookie)">Click for bonus</a>
            Bad link 2: <a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">Payload link</a>
            Bad link 3: <a href="vbscript:msgbox('hello')">VB link</a>
            Bad link 4: <a href="file:///etc/passwd">Local secret</a>
            Bad link 5: <a href="//attacker.com/steal">Protocol relative</a>
            Good link: <a href="https://github.com/gooduser">Valid GitHub</a>
          </p>
        </body>
        </html>
      `;

      const buffer = Buffer.from(html, 'utf8');
      const result = await parser.extractResume(buffer);

      // Dangerous schemes must not appear in links array
      assert.equal(result.links.length, 1);
      assert.equal(result.links[0].url, 'https://github.com/gooduser');
      assert.equal(result.links[0].text, 'Valid GitHub');

      // In extracted text, dangerous schemes must not be linked
      assert.ok(!result.text.includes('javascript:'));
      assert.ok(!result.text.includes('data:text/html'));
      assert.ok(!result.text.includes('vbscript:'));
      assert.ok(!result.text.includes('file:///'));
      assert.ok(!result.text.includes('//attacker.com'));

      // Benign anchor label remains in text
      assert.match(result.text, /Click for bonus/);
      assert.match(
        result.text,
        /Valid GitHub \[https:\/\/github\.com\/gooduser\]/
      );
    });

    it('should gracefully handle malformed HTML without crashing or throwing unhandled errors', async () => {
      const malformed = `
        <html><body>
          <h1>Unclosed header
          <p>Paragraph without closing tag
          <div><span>Nested unclosed elements
          <table><tr><td>Cell 1<td>Cell 2
          <a href="https://portfolio.me">My Site
        <!-- unclosed comment
      `;

      const buffer = Buffer.from(malformed, 'utf8');
      const result = await parser.extractResume(buffer);

      assert.ok(result.text);
      assert.match(result.text, /Unclosed header/);
      assert.match(result.text, /Paragraph without closing tag/);
      assert.match(result.text, /Cell 1/);
      assert.equal(result.links.length, 1);
      assert.equal(result.links[0].url, 'https://portfolio.me');
    });

    it('should throw EMPTY_HTML_CONTENT when HTML contains no readable text', async () => {
      const emptyHtml =
        '<!DOCTYPE html><html><head><title></title></head><body>   <div></div>   </body></html>';
      const buffer = Buffer.from(emptyHtml, 'utf8');

      await assert.rejects(
        () => parser.extractResume(buffer),
        (err) => {
          assert.ok(err instanceof UnprocessableEntityException);
          const resp = err.getResponse();
          assert.equal(resp.code, 'EMPTY_HTML_CONTENT');
          return true;
        }
      );
    });

    it('should throw INVALID_HTML_FORMAT when HTML contains null bytes / binary content', async () => {
      const binaryContent = Buffer.from(
        '<html><body>Hello\u0000World</body></html>',
        'utf8'
      );

      await assert.rejects(
        () => parser.extractResume(binaryContent),
        (err) => {
          assert.ok(err instanceof UnprocessableEntityException);
          const resp = err.getResponse();
          assert.equal(resp.code, 'INVALID_HTML_FORMAT');
          return true;
        }
      );
    });

    it('should throw INVALID_HTML_FORMAT when content lacks HTML markup', async () => {
      const plainText = Buffer.from(
        'This is a plain text resume without any HTML tags at all.',
        'utf8'
      );

      await assert.rejects(
        () => parser.extractResume(plainText),
        (err) => {
          assert.ok(err instanceof UnprocessableEntityException);
          const resp = err.getResponse();
          assert.equal(resp.code, 'INVALID_HTML_FORMAT');
          return true;
        }
      );
    });
  });

  describe('2. ResumeService File Validation Unit Tests', () => {
    let service;
    const validPdfBuffer = Buffer.from(
      '%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF'
    );
    const validHtmlBuffer = Buffer.from(
      '<!DOCTYPE html><html><body><h1>Resume</h1><p>Experience</p></body></html>'
    );

    beforeEach(() => {
      service = new ResumeService(null, null, null, null, null);
    });

    it('should accept valid HTML file (.html extension)', () => {
      assert.doesNotThrow(() => {
        service.validateUploadedResume({
          buffer: validHtmlBuffer,
          originalname: 'my_resume.html',
          mimetype: 'text/html',
          size: validHtmlBuffer.length,
        });
      });
    });

    it('should accept valid HTML file with .htm extension', () => {
      assert.doesNotThrow(() => {
        service.validateUploadedResume({
          buffer: validHtmlBuffer,
          originalname: 'my_resume.htm',
          mimetype: 'text/html',
          size: validHtmlBuffer.length,
        });
      });
    });

    it('should accept valid PDF file (regression check)', () => {
      assert.doesNotThrow(() => {
        service.validateUploadedResume({
          buffer: validPdfBuffer,
          originalname: 'my_resume.pdf',
          mimetype: 'application/pdf',
          size: validPdfBuffer.length,
        });
      });
    });

    it('should maintain backward compatibility with validateUploadedPdf alias', () => {
      assert.doesNotThrow(() => {
        service.validateUploadedPdf({
          buffer: validPdfBuffer,
          originalname: 'my_resume.pdf',
          mimetype: 'application/pdf',
          size: validPdfBuffer.length,
        });
      });
    });

    it('should reject missing or empty file', () => {
      assert.throws(
        () => service.validateUploadedResume(null),
        (err) => {
          assert.ok(err instanceof BadRequestException);
          assert.equal(err.getResponse().code, 'VALIDATION_ERROR');
          assert.match(err.getResponse().message, /No file uploaded/);
          return true;
        }
      );

      assert.throws(
        () =>
          service.validateUploadedResume({
            buffer: Buffer.alloc(0),
            originalname: 'empty.html',
            mimetype: 'text/html',
            size: 0,
          }),
        (err) => {
          assert.ok(err instanceof BadRequestException);
          assert.equal(err.getResponse().code, 'VALIDATION_ERROR');
          return true;
        }
      );
    });

    it('should reject file exceeding 5MB limit with HTTP 413 Payload Too Large', () => {
      const oversizedSize = 5 * 1024 * 1024 + 1;
      assert.throws(
        () =>
          service.validateUploadedResume({
            buffer: validHtmlBuffer,
            originalname: 'big.html',
            mimetype: 'text/html',
            size: oversizedSize,
          }),
        (err) => {
          assert.ok(err instanceof HttpException);
          assert.equal(err.getStatus(), HttpStatus.PAYLOAD_TOO_LARGE);
          assert.match(err.getResponse().message, /exceeds 5MB size limit/);
          return true;
        }
      );
    });

    it('should reject unsupported file extensions (e.g. .docx, .png, .txt)', () => {
      for (const ext of ['.docx', '.png', '.txt', '.json', '.exe']) {
        assert.throws(
          () =>
            service.validateUploadedResume({
              buffer: validHtmlBuffer,
              originalname: `resume${ext}`,
              mimetype: 'application/octet-stream',
              size: validHtmlBuffer.length,
            }),
          (err) => {
            assert.ok(err instanceof BadRequestException);
            assert.match(err.getResponse().message, /invalid extension/);
            return true;
          }
        );
      }
    });

    it('should reject MIME type mismatch for .html file', () => {
      assert.throws(
        () =>
          service.validateUploadedResume({
            buffer: validHtmlBuffer,
            originalname: 'resume.html',
            mimetype: 'application/pdf',
            size: validHtmlBuffer.length,
          }),
        (err) => {
          assert.ok(err instanceof BadRequestException);
          assert.match(
            err.getResponse().message,
            /MIME type mismatch for HTML/
          );
          return true;
        }
      );
    });

    it('should reject MIME type mismatch for .pdf file', () => {
      assert.throws(
        () =>
          service.validateUploadedResume({
            buffer: validPdfBuffer,
            originalname: 'resume.pdf',
            mimetype: 'text/html',
            size: validPdfBuffer.length,
          }),
        (err) => {
          assert.ok(err instanceof BadRequestException);
          assert.match(err.getResponse().message, /MIME type mismatch for PDF/);
          return true;
        }
      );
    });

    it('should reject disguised PDF uploaded as HTML (.html extension with %PDF- content)', () => {
      assert.throws(
        () =>
          service.validateUploadedResume({
            buffer: validPdfBuffer,
            originalname: 'disguised.html',
            mimetype: 'text/html',
            size: validPdfBuffer.length,
          }),
        (err) => {
          assert.ok(err instanceof BadRequestException);
          assert.match(err.getResponse().message, /detected PDF content/);
          return true;
        }
      );
    });

    it('should reject binary file disguised as HTML (contains null bytes)', () => {
      const binaryDisguised = Buffer.from(
        'GIF89a\x00\x00\x01\x00<html><body>Disguised</body></html>'
      );
      assert.throws(
        () =>
          service.validateUploadedResume({
            buffer: binaryDisguised,
            originalname: 'malware.html',
            mimetype: 'text/html',
            size: binaryDisguised.length,
          }),
        (err) => {
          assert.ok(err instanceof BadRequestException);
          assert.match(err.getResponse().message, /invalid binary content/);
          return true;
        }
      );
    });

    it('should reject plain text disguised as HTML (missing HTML structure)', () => {
      const plainText = Buffer.from(
        'John Doe Senior Developer Experience with JavaScript Node.js'
      );
      assert.throws(
        () =>
          service.validateUploadedResume({
            buffer: plainText,
            originalname: 'fake.html',
            mimetype: 'text/html',
            size: plainText.length,
          }),
        (err) => {
          assert.ok(err instanceof BadRequestException);
          assert.match(err.getResponse().message, /valid HTML content/);
          return true;
        }
      );
    });
  });

  describe('3. ResumeService Upload, Ownership & Download Security', () => {
    let service;
    let mockPrisma;
    let mockStudentService;
    let mockStorageService;
    let mockQueueService;
    let mockApplicationService;

    const studentUserA = 'student-user-a';
    const studentUserB = 'student-user-b';
    const recruiterUser = 'recruiter-user-1';
    const resumeIdHtml = '11111111-1111-4111-8111-111111111111';
    const resumeIdPdf = '22222222-2222-4222-8222-222222222222';
    const htmlKey = '55555555-5555-4555-8555-555555555555.html';
    const pdfKey = '66666666-6666-4666-8666-666666666666.pdf';

    beforeEach(() => {
      mockStudentService = {
        getProfileByUserId: async (uid) => ({ id: `profile-${uid}` }),
      };
      mockStorageService = {
        uploadFile: async (input) => {
          const ext = input.originalName.endsWith('.html') ? '.html' : '.pdf';
          return {
            fileKey: `stored-uuid${ext}`,
            fileUrl: `http://localhost:4000/api/v1/resumes/file/stored-uuid${ext}`,
          };
        },
        getFileBuffer: async (key) => Buffer.from(`Buffer for ${key}`),
        deleteFile: async () => {},
      };
      mockQueueService = {
        send: async () => {},
      };
      mockApplicationService = {
        hasRecruiterAccessToResume: async (rId, rUid) =>
          rId === resumeIdHtml && rUid === recruiterUser,
      };

      const resumesDb = [
        {
          id: resumeIdHtml,
          file_key: htmlKey,
          file_url: `http://localhost:4000/api/v1/resumes/file/${htmlKey}`,
          is_primary: true,
          student: {
            id: 'profile-student-user-a',
            user_id: studentUserA,
            first_name: 'Jane',
            last_name: 'Developer',
          },
        },
        {
          id: resumeIdPdf,
          file_key: pdfKey,
          file_url: `http://localhost:4000/api/v1/resumes/file/${pdfKey}`,
          is_primary: false,
          student: {
            id: 'profile-student-user-a',
            user_id: studentUserA,
            first_name: 'Jane',
            last_name: 'Developer',
          },
        },
      ];

      mockPrisma = {
        resume: {
          findFirst: async ({ where }) => {
            const targetId = where.id;
            return resumesDb.find((r) => r.id === targetId) || null;
          },
          updateMany: async () => ({ count: 1 }),
          create: async ({ data }) => ({
            id: 'new-resume-uuid',
            file_key: data.file_key,
            file_url: data.file_url,
            is_primary: data.is_primary,
          }),
        },
        $transaction: async (cb) => cb(mockPrisma),
      };

      service = new ResumeService(
        mockPrisma,
        mockStudentService,
        mockStorageService,
        mockQueueService,
        mockApplicationService
      );
    });

    it('should upload HTML resume, preserve extension, and queue extraction job', async () => {
      let enqueued = null;
      mockQueueService.send = async (queue, data) => {
        enqueued = { queue, data };
      };

      const validHtmlBuffer = Buffer.from(
        '<!DOCTYPE html><html><body><h1>Resume</h1></body></html>'
      );
      const result = await service.uploadResume(studentUserA, {
        buffer: validHtmlBuffer,
        originalname: 'my_portfolio_resume.html',
        mimetype: 'text/html',
        size: validHtmlBuffer.length,
      });

      assert.ok(result.id);
      assert.ok(result.file_url.endsWith('.html'));
      assert.equal(result.is_primary, true);
      assert.ok(enqueued);
      assert.equal(enqueued.queue, 'resume-text-extraction');
    });

    it('should enforce student ownership when accessing HTML resume (IDOR/BOLA prevention)', async () => {
      // Student A accessing own resume: allowed
      const resultA = await service.getResumeFile(
        studentUserA,
        UserRole.STUDENT,
        resumeIdHtml
      );
      assert.ok(resultA.buffer);
      assert.equal(resultA.fileName, 'Jane_Developer_Resume.html');
      assert.equal(resultA.isHtml, true);

      // Student B accessing Student A's HTML resume: rejected with 403 Forbidden
      await assert.rejects(
        () =>
          service.getResumeFile(studentUserB, UserRole.STUDENT, resumeIdHtml),
        (err) => {
          assert.ok(err instanceof ForbiddenException);
          assert.match(err.getResponse().message, /belongs to another student/);
          return true;
        }
      );
    });

    it('should enforce recruiter authorization for candidate HTML resumes', async () => {
      // Recruiter who received application: allowed
      const resultRecruiter = await service.getResumeFile(
        recruiterUser,
        UserRole.RECRUITER,
        resumeIdHtml
      );
      assert.ok(resultRecruiter.buffer);
      assert.equal(resultRecruiter.isHtml, true);

      // Other recruiter: rejected with 403 Forbidden
      await assert.rejects(
        () =>
          service.getResumeFile(
            'unauthorized-recruiter',
            UserRole.RECRUITER,
            resumeIdHtml
          ),
        (err) => {
          assert.ok(err instanceof ForbiddenException);
          assert.match(
            err.getResponse().message,
            /does not belong to your job postings/
          );
          return true;
        }
      );
    });

    it('should correctly flag PDF resumes as isHtml: false and format .pdf filename', async () => {
      const resultPdf = await service.getResumeFile(
        studentUserA,
        UserRole.STUDENT,
        resumeIdPdf
      );
      assert.ok(resultPdf.buffer);
      assert.equal(resultPdf.fileName, 'Jane_Developer_Resume.pdf');
      assert.equal(resultPdf.isHtml, false);
    });
  });

  describe('4. ResumeController Download Security Headers', () => {
    let controller;
    let mockResumeService;

    beforeEach(() => {
      mockResumeService = {
        getResumeFile: async (userId, userRole, id) => {
          if (id === 'html-id') {
            return {
              buffer: Buffer.from('<html><body>Jane Doe</body></html>'),
              fileName: 'Jane_Doe_Resume.html',
              isHtml: true,
            };
          }
          return {
            buffer: Buffer.from('%PDF-1.4 mock content'),
            fileName: 'Jane_Doe_Resume.pdf',
            isHtml: false,
          };
        },
      };

      controller = new ResumeController(mockResumeService, null);
    });

    it('should serve HTML resumes strictly as download attachment with safe security headers', async () => {
      const headers = {};
      let sentBuffer = null;

      const mockRes = {
        setHeader: (key, val) => {
          headers[key] = val;
        },
        send: (buf) => {
          sentBuffer = buf;
        },
      };

      await controller.getResumeFile(
        'user-1',
        UserRole.STUDENT,
        'html-id',
        mockRes
      );

      // Verify safe download headers per Requirement 7
      assert.equal(
        headers['Content-Disposition'],
        'attachment; filename="Jane_Doe_Resume.html"'
      );
      assert.equal(headers['Content-Type'], 'text/html; charset=utf-8');
      assert.equal(headers['X-Content-Type-Options'], 'nosniff');
      assert.equal(headers['X-Frame-Options'], 'DENY');
      assert.equal(
        headers['Content-Security-Policy'],
        "default-src 'none'; style-src 'unsafe-inline'; sandbox"
      );
      assert.equal(
        headers['Cache-Control'],
        'private, no-cache, no-store, must-revalidate'
      );
      assert.ok(sentBuffer);
    });

    it('should serve PDF resumes with inline disposition (PDF regression check)', async () => {
      const headers = {};
      let sentBuffer = null;

      const mockRes = {
        setHeader: (key, val) => {
          headers[key] = val;
        },
        send: (buf) => {
          sentBuffer = buf;
        },
      };

      await controller.getResumeFile(
        'user-1',
        UserRole.STUDENT,
        'pdf-id',
        mockRes
      );

      assert.equal(
        headers['Content-Disposition'],
        'inline; filename="Jane_Doe_Resume.pdf"'
      );
      assert.equal(headers['Content-Type'], 'application/pdf');
      assert.equal(headers['X-Content-Type-Options'], 'nosniff');
      assert.ok(!headers['Content-Security-Policy']);
      assert.ok(sentBuffer);
    });
  });

  describe('5. ResumeExtractionWorker HTML Text & Links Extraction', () => {
    let worker;
    let mockPrisma;
    let mockStorage;
    let mockHtmlParser;
    let mockPdfParser;

    beforeEach(() => {
      mockHtmlParser = {
        extractText: async (buf) =>
          'Jane Doe - Full Stack Developer [https://github.com/janedoe]',
      };
      mockPdfParser = {
        extractText: async (buf) => 'Jane Doe - PDF Extracted Text',
      };
      mockStorage = {
        getFileBuffer: async (key) => Buffer.from('mock resume content'),
      };
      mockPrisma = {
        resume: {
          findUnique: async () => ({
            id: 'res-1',
            student_id: 'stu-1',
            file_key: 'resume-key.html',
            parsed_text: null,
          }),
          update: async () => {},
        },
        aiAnalysis: {
          upsert: async () => {},
        },
      };

      worker = new ResumeExtractionWorker(
        { work: async () => {} },
        mockPrisma,
        mockStorage,
        mockPdfParser,
        mockHtmlParser
      );
    });

    it('should route .html files to HtmlParserService and store extracted text and links', async () => {
      let storedText = null;
      mockPrisma.resume.update = async ({ data }) => {
        storedText = data.parsed_text;
      };

      const job = {
        id: 'job-1',
        data: {
          resumeId: 'res-1',
          studentId: 'stu-1',
          fileKey: 'candidate-profile.html',
        },
      };

      await worker.handleExtractionJob(job);

      assert.ok(storedText);
      assert.match(storedText, /Jane Doe - Full Stack Developer/);
      assert.match(storedText, /https:\/\/github\.com\/janedoe/);
    });

    it('should route .pdf files to PdfParserService (regression check)', async () => {
      let storedText = null;
      mockPrisma.resume.findUnique = async () => ({
        id: 'res-2',
        student_id: 'stu-1',
        file_key: 'candidate.pdf',
        parsed_text: null,
      });
      mockPrisma.resume.update = async ({ data }) => {
        storedText = data.parsed_text;
      };

      const job = {
        id: 'job-2',
        data: {
          resumeId: 'res-2',
          studentId: 'stu-1',
          fileKey: 'candidate.pdf',
        },
      };

      await worker.handleExtractionJob(job);

      assert.equal(storedText, 'Jane Doe - PDF Extracted Text');
    });
  });
});
