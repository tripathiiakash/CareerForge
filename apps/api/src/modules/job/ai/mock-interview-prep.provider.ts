import { Injectable, Logger } from '@nestjs/common';
import {
  IInterviewPrepProvider,
  InterviewPrepPromptInput,
  InterviewPrepResult,
} from './interview-prep-provider.interface';

@Injectable()
export class MockInterviewPrepProvider implements IInterviewPrepProvider {
  private readonly logger = new Logger(MockInterviewPrepProvider.name);

  async generateQuestions(
    input: InterviewPrepPromptInput
  ): Promise<InterviewPrepResult> {
    this.logger.log(
      `Mock AI generating interview questions for role: "${input.jobTitle}"`
    );

    const primarySkill =
      input.requiredSkills && input.requiredSkills.length > 0
        ? input.requiredSkills[0]
        : 'software development';
    const secondarySkill =
      input.requiredSkills && input.requiredSkills.length > 1
        ? input.requiredSkills[1]
        : 'database systems';

    return {
      job_title: input.jobTitle,
      questions: [
        `Explain how you would design a scalable architecture or RESTful API using ${primarySkill} for this ${input.employmentType.toLowerCase()} position.`,
        `What are common performance bottlenecks when working with ${secondarySkill}, and how do you diagnose and resolve them?`,
        `Describe a challenging bug or technical problem you solved using your background in ${input.studentSkills.length > 0 ? input.studentSkills.join(', ') : primarySkill}.`,
        `How do you approach writing clean, testable code and managing asynchronous state or database queries in a high-throughput system?`,
        `Given the requirements described for this role, how would you handle rate limiting, authentication, and data validation in production?`,
      ],
    };
  }
}
