import {
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import pdf from 'pdf-parse';

@Injectable()
export class PdfParserService {
  private readonly logger = new Logger(PdfParserService.name);

  async extractText(buffer: Buffer): Promise<string> {
    try {
      const data = await pdf(buffer, { max: 10 });
      let text = data.text || '';
      // Strip null bytes to protect PostgreSQL text column
      text = text.replace(/\u0000/g, '');

      if (!text.trim()) {
        throw new UnprocessableEntityException({
          code: 'EMPTY_PDF_CONTENT',
          message:
            'The PDF document contains no readable text (it may be image-only or scanned).',
        });
      }

      return text;
    } catch (error: unknown) {
      if (error instanceof UnprocessableEntityException) {
        throw error;
      }
      this.logger.error('Failed to parse PDF document', error);
      throw new UnprocessableEntityException({
        code: 'INVALID_PDF_FORMAT',
        message: 'Failed to extract text from PDF document.',
      });
    }
  }
}
