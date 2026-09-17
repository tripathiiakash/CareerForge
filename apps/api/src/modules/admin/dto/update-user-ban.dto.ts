import { UpdateUserBanInput } from '@careerforge/validation';

export class UpdateUserBanDto implements UpdateUserBanInput {
  is_banned!: boolean;
}

export interface UpdateUserBanData {
  id: string;
  email: string;
  is_banned: boolean;
  message: string;
}

export interface UpdateUserBanResponseDto {
  success: true;
  data: UpdateUserBanData;
}
