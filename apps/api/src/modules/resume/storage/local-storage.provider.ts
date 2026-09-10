import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ConfigService } from '../../../core/config/config.service';
import {
  IStorageProvider,
  StorageUploadInput,
  StorageUploadResult,
} from './storage.interface';

@Injectable()
export class LocalStorageProvider implements IStorageProvider {
  private readonly logger = new Logger(LocalStorageProvider.name);
  private readonly storageDir: string;

  constructor(private readonly configService: ConfigService) {
    const baseDir = process.cwd().includes('apps')
      ? path.resolve(process.cwd(), '..', '..')
      : process.cwd();
    this.storageDir = path.resolve(baseDir, 'uploads', 'resumes');
  }

  async upload(input: StorageUploadInput): Promise<StorageUploadResult> {
    await fs.mkdir(this.storageDir, { recursive: true });

    // Generate unique random UUID-based file key
    const fileKey = `${crypto.randomUUID()}.pdf`;
    const targetPath = this.resolveAndVerifyPath(fileKey);

    await fs.writeFile(targetPath, input.buffer);

    const port = this.configService.port;
    const fileUrl = `http://localhost:${port}/uploads/resumes/${fileKey}`;

    return {
      fileKey,
      fileUrl,
    };
  }

  async delete(fileKey: string): Promise<void> {
    try {
      const targetPath = this.resolveAndVerifyPath(fileKey);
      await fs.unlink(targetPath);
    } catch (error: unknown) {
      // Ignore if file doesn't exist; log other failures
      if (
        typeof error === 'object' &&
        error !== null &&
        (error as { code?: string }).code !== 'ENOENT'
      ) {
        this.logger.warn(
          `Failed to delete local storage file ${fileKey}: ${error}`
        );
      }
    }
  }

  private resolveAndVerifyPath(fileKey: string): string {
    // Sanitization: fileKey must only be alphanumeric characters, hyphens, and .pdf extension
    if (!/^[a-zA-Z0-9-]+\.pdf$/.test(fileKey)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid storage file key format',
      });
    }

    const resolved = path.resolve(this.storageDir, fileKey);
    // Defend against path traversal
    if (
      !resolved.startsWith(this.storageDir + path.sep) &&
      resolved !== this.storageDir
    ) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Path traversal attempt detected',
      });
    }

    return resolved;
  }
}
