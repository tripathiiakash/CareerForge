import { Injectable, Logger, Optional } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  S3ClientConfig,
} from '@aws-sdk/client-s3';
import { ConfigService } from '../../core/config/config.service';
import { B2NativeStorageProvider } from '../resume/storage/b2-native-storage.provider';

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
  private readonly s3Client?: S3Client;
  private readonly b2Provider?: B2NativeStorageProvider;
  private readonly bucket?: string;
  private readonly mode: 'local' | 's3' | 'b2';

  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly injectedS3Client?: S3Client,
    injectedB2Provider?: B2NativeStorageProvider
  ) {
    const baseDir = process.cwd().includes('apps')
      ? path.resolve(process.cwd(), '..', '..')
      : process.cwd();
    this.storageDir = path.resolve(baseDir, 'uploads', 'verification-evidence');

    const provider = this.configService.storageProvider;
    if (provider === 'b2') {
      if (!injectedB2Provider) {
        throw new Error(
          'EvidenceStorageService: B2NativeStorageProvider was not injected. ' +
            'Ensure RecruiterModule imports ResumeModule so the shared provider is available.'
        );
      }
      this.mode = 'b2';
      this.b2Provider = injectedB2Provider;
    } else if (provider === 's3') {
      this.mode = 's3';
      this.bucket = this.configService.s3Bucket || '';
      if (this.injectedS3Client) {
        this.s3Client = this.injectedS3Client;
      } else {
        const clientConfig: S3ClientConfig = {
          region: this.configService.s3Region || 'auto',
          credentials: {
            accessKeyId: this.configService.s3AccessKeyId || '',
            secretAccessKey: this.configService.s3SecretAccessKey || '',
          },
          requestChecksumCalculation: 'WHEN_REQUIRED',
          responseChecksumValidation: 'WHEN_REQUIRED',
        };
        if (this.configService.s3Endpoint) {
          clientConfig.endpoint = this.configService.s3Endpoint;
        }
        if (this.configService.s3ForcePathStyle) {
          clientConfig.forcePathStyle = true;
        }
        this.s3Client = new S3Client(clientConfig);
      }
    } else {
      this.mode = 'local';
    }
  }

  verifyKey(fileKey: string): void {
    if (!fileKey || !UUID_FILENAME_REGEX.test(fileKey)) {
      throw new Error(`Invalid evidence fileKey format: ${fileKey}`);
    }
  }

  resolveAndVerifyPath(fileKey: string): string {
    this.verifyKey(fileKey);
    const resolved = path.resolve(this.storageDir, path.basename(fileKey));
    if (!resolved.startsWith(this.storageDir)) {
      throw new Error(`Path traversal attempt detected for key: ${fileKey}`);
    }
    return resolved;
  }

  private getS3ObjectKey(fileKey: string): string {
    return `verification-evidence/${fileKey}`;
  }

  async upload(input: EvidenceUploadInput): Promise<EvidenceUploadResult> {
    const rawExt = path.extname(input.originalName || '').toLowerCase();
    const ext =
      rawExt === '.png' || rawExt === '.jpg' || rawExt === '.jpeg'
        ? rawExt
        : '.pdf';
    const fileKey = `${crypto.randomUUID()}${ext}`;
    this.verifyKey(fileKey);

    if (this.mode === 'b2' && this.b2Provider) {
      const res = await this.b2Provider.upload({
        buffer: input.buffer,
        mimeType: input.mimeType,
        originalName: input.originalName || `evidence${ext}`,
        studentId: input.recruiterId,
      });
      return {
        fileKey: res.fileKey,
        originalName: input.originalName || res.fileKey,
        mimeType: input.mimeType,
        sizeBytes: input.buffer.byteLength,
      };
    }

    if (this.mode === 's3' && this.s3Client && this.bucket) {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: this.getS3ObjectKey(fileKey),
          Body: input.buffer,
          ContentLength: input.buffer.byteLength,
          ContentType: input.mimeType || 'application/octet-stream',
        })
      );
    } else {
      await fs.mkdir(this.storageDir, { recursive: true });
      const targetPath = this.resolveAndVerifyPath(fileKey);
      await fs.writeFile(targetPath, input.buffer);
    }

    return {
      fileKey,
      originalName: input.originalName || `evidence${ext}`,
      mimeType: input.mimeType,
      sizeBytes: input.buffer.byteLength,
    };
  }

  async getBuffer(fileKey: string): Promise<Buffer> {
    this.verifyKey(fileKey);

    if (this.mode === 'b2' && this.b2Provider) {
      return await this.b2Provider.getBuffer(fileKey);
    }

    if (this.mode === 's3' && this.s3Client && this.bucket) {
      const response = await this.s3Client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: this.getS3ObjectKey(fileKey),
        })
      );
      if (!response.Body) {
        throw new Error(`Empty response body for evidence key: ${fileKey}`);
      }
      const byteArray = await response.Body.transformToByteArray();
      return Buffer.from(byteArray);
    }

    const targetPath = this.resolveAndVerifyPath(fileKey);
    return await fs.readFile(targetPath);
  }

  async delete(fileKey: string): Promise<void> {
    this.verifyKey(fileKey);

    if (this.mode === 'b2' && this.b2Provider) {
      await this.b2Provider.delete(fileKey);
      return;
    }

    if (this.mode === 's3' && this.s3Client && this.bucket) {
      try {
        await this.s3Client.send(
          new DeleteObjectCommand({
            Bucket: this.bucket,
            Key: this.getS3ObjectKey(fileKey),
          })
        );
      } catch (err: unknown) {
        this.logger.warn(
          `Failed to delete evidence S3 object ${fileKey}: ${err}`
        );
      }
      return;
    }

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
