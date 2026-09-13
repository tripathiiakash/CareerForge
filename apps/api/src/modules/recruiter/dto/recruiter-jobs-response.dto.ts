import { CompanyDetailDto } from './recruiter-profile-response.dto';

export interface RecruiterJobItem {
  id: string;
  title: string;
  description: string;
  required_skills: string[];
  employment_type: string;
  status: string;
  company: CompanyDetailDto;
  created_at: Date | string;
}

export interface RecruiterJobsResponseDto {
  success: true;
  data: RecruiterJobItem[];
}
