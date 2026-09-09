export interface ResumeListItemDto {
  id: string;
  file_url: string;
  is_primary: boolean;
  has_analysis: boolean;
  created_at: string;
}

export interface ResumeListResponseDto {
  success: boolean;
  data: ResumeListItemDto[];
}
