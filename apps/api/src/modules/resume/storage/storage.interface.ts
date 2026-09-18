export interface StorageUploadInput {
  buffer: Buffer;
  mimeType: string;
  originalName: string;
  studentId: string;
}

export interface StorageUploadResult {
  fileKey: string;
  fileUrl: string;
}

export interface IStorageProvider {
  upload(input: StorageUploadInput): Promise<StorageUploadResult>;
  delete(fileKey: string): Promise<void>;
  getBuffer(fileKey: string): Promise<Buffer>;
}

export const STORAGE_PROVIDER_TOKEN = Symbol('STORAGE_PROVIDER_TOKEN');

/**
 * Base domain exception for storage operations.
 * Allows distinguishing retryable infrastructure failures from permanent errors.
 */
export class StorageError extends Error {
  constructor(
    message: string,
    public readonly isRetryable: boolean = true,
    public readonly code: string = 'STORAGE_ERROR'
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

/**
 * Thrown when a stored object definitively does not exist (e.g., ENOENT, S3 404/NoSuchKey).
 * Non-retryable permanent error.
 */
export class StorageFileNotFoundError extends StorageError {
  constructor(
    public readonly fileKey: string,
    message?: string
  ) {
    super(
      message || `Stored resume file not found for key: ${fileKey}`,
      false,
      'FILE_NOT_FOUND'
    );
    this.name = 'StorageFileNotFoundError';
  }
}

/**
 * Thrown when a storage file key is permanently invalid or malicious.
 * Non-retryable permanent error.
 */
export class StorageInvalidKeyError extends StorageError {
  constructor(
    public readonly fileKey: string,
    message?: string
  ) {
    super(
      message || `Invalid storage file key: ${fileKey}`,
      false,
      'INVALID_FILE_KEY'
    );
    this.name = 'StorageInvalidKeyError';
  }
}
