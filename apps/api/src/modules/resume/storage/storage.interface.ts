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
}

export const STORAGE_PROVIDER_TOKEN = Symbol('STORAGE_PROVIDER_TOKEN');
