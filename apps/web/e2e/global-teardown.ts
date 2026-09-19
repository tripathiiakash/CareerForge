import { cleanE2EFixtures } from './helpers/e2e-db';

export default async function globalTeardown() {
  console.log('\n[E2E] Cleaning up deterministic test fixtures in careerforge_e2e database...');
  await cleanE2EFixtures();
  console.log('[E2E] Fixtures cleaned successfully.\n');
}
