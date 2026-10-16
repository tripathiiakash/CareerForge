import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ConfigService } from '../../core/config/config.service';

const UUID_FILENAME_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(pdf|png|jpe?g)$/i;

export interface EvidenceUploadInput {
  buffer: Buffer;
  mimeType: string;
  originalName: string;
  recruiterId: string;
}

export interface EvidenceUploadResult {
  fileKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

@Injectable()
export class EvidenceStorageService {
  private readonly logger = new Logger(EvidenceStorageService.name);
  private readonly storageDir: string;

  constructor(private readonly configService: ConfigService) {
    const baseDir = process.cwd().includes('apps')
      ? path.resolve(process.cwd(), '..', '..')
      : process.cwd();
    this.storageDir = path.resolve(baseDir, 'uploads', 'verification-evidence');
  }

  resolveAndVerifyPath(fileKey: string): string {
    if (!fileKey || !UUID_FILENAME_REGEX.test(fileKey)) {
      throw new Error(`Invalid evidence fileKey format: ${fileKey}`);
    }
    const resolved = path.resolve(this.storageDir, path.basename(fileKey));
    if (!resolved.startsWith(this.storageDir)) {
      throw new Error(`Path traversal attempt detected for key: ${fileKey}`);
    }
    return resolved;
  }

  async upload(input: EvidenceUploadInput): Promise<EvidenceUploadResult> {
    await fs.mkdir(this.storageDir, { recursive: true });

    const rawExt = path.extname(input.originalName || '').toLowerCase();
    const ext =
      rawExt === '.png' || rawExt === '.jpg' || rawExt === '.jpeg'
        ? rawExt
        : '.pdf';
    const fileKey = `${crypto.randomUUID()}${ext}`;
    const targetPath = this.resolveAndVerifyPath(fileKey);

    await fs.writeFile(targetPath, input.buffer);

    return {
      fileKey,
      originalName: input.originalName || `evidence${ext}`,
      mimeType: input.mimeType,
      sizeBytes: input.buffer.byteLength,
    };
  }

  async getBuffer(fileKey: string): Promise<Buffer> {
    const targetPath = this.resolveAndVerifyPath(fileKey);
    return await fs.readFile(targetPath);
  }

  async delete(fileKey: string): Promise<void> {
    try {
      const targetPath = this.resolveAndVerifyPath(fileKey);
      await fs.unlink(targetPath);
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        (err as { code?: string }).code !== 'ENOENT'
      ) {
        this.logger.warn(`Failed to delete evidence file ${fileKey}: ${err}`);
      }
    }
  }
}
