import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class PasswordService {
  private static readonly SALT_ROUNDS = 10;

  // Precomputed bcrypt hash used for uniform timing mitigation during invalid user login
  private static readonly DUMMY_HASH =
    '$2a$10$7EqJtq98hPqEX7fNZaFWoO.D13R5l927HhT0vA2eF1735.6aEGe/i';

  /**
   * Hashes a plaintext password using bcrypt with salt rounds 10.
   */
  async hash(password: string): Promise<string> {
    return bcrypt.hash(password, PasswordService.SALT_ROUNDS);
  }

  /**
   * Compares a plaintext password against a stored bcrypt hash.
   */
  async compare(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Performs a constant-time comparison against a dummy hash to prevent timing attacks
   * when an email is not found in the database.
   */
  async dummyCompare(password: string): Promise<boolean> {
    await bcrypt.compare(password, PasswordService.DUMMY_HASH);
    return false;
  }
}
