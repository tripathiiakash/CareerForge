import { Inject, Injectable } from '@nestjs/common';
import {
  IStorageProvider,
  STORAGE_PROVIDER_TOKEN,
  StorageUploadInput,
  StorageUploadResult,
} from './storage.interface';

@Injectable()
export class ResumeStorageService {
  constructor(
    @Inject(STORAGE_PROVIDER_TOKEN)
    private readonly storageProvider: IStorageProvider
  ) {}

  async uploadFile(input: StorageUploadInput): Promise<StorageUploadResult> {
    return this.storageProvider.upload(input);
  }

  async deleteFile(fileKey: string): Promise<void> {
    return this.storageProvider.delete(fileKey);
  }

  async getFileBuffer(fileKey: string): Promise<Buffer> {
    return this.storageProvider.getBuffer(fileKey);
  }
}
