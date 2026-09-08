import { Controller, Get } from '@nestjs/common';

/**
 * Root controller providing a basic health-check endpoint.
 * All domain endpoints will be implemented in their respective feature modules.
 */
@Controller()
export class AppController {
  @Get('health')
  healthCheck(): { status: string; timestamp: string } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
