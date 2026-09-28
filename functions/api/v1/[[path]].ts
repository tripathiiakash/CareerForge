/**
 * Cloudflare Pages Function Proxy Root Re-export
 *
 * Ensures that if the Cloudflare Pages project root is set to the repository root
 * instead of apps/web, the /api/v1/* catch-all proxy functions seamlessly.
 */

export { onRequest } from '../../apps/web/functions/api/v1/[[path]]';
export * from '../../apps/web/functions/api/v1/[[path]]';
