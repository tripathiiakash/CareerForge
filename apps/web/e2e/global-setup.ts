import { seedE2EFixtures } from './helpers/e2e-db';

export default async function globalSetup() {
  console.log('\n[E2E] Seeding deterministic test fixtures in careerforge_e2e database...');
  await seedE2EFixtures();
  console.log('[E2E] Fixtures seeded successfully.\n');
}
