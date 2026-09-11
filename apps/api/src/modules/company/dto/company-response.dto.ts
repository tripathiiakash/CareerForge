export interface CompanyData {
  id: string;
  name: string;
  website: string | null;
  logo_url: string | null;
}

export interface CompanyResponseDto {
  success: true;
  data: CompanyData;
}
