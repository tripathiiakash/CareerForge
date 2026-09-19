import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WEB_SRC = path.resolve('src');

export async function resolve(specifier, context, nextResolve) {
  // Resolve @/ path aliases to apps/web/src
  if (specifier.startsWith('@/')) {
    const relative = specifier.slice(2);
    const candidateBase = path.join(WEB_SRC, relative);

    for (const ext of ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js']) {
      const full = candidateBase + ext;
      if (fs.existsSync(full) && fs.statSync(full).isFile()) {
        return {
          url: pathToFileURL(full).href,
          shortCircuit: true,
        };
      }
    }
  }

  // Resolve extensionless relative imports (e.g. ./setup/test-utils)
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    if (context.parentURL && context.parentURL.startsWith('file:')) {
      const parentDir = path.dirname(fileURLToPath(context.parentURL));
      const candidateBase = path.resolve(parentDir, specifier);

      for (const ext of ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js']) {
        const full = candidateBase + ext;
        if (fs.existsSync(full) && fs.statSync(full).isFile()) {
          return {
            url: pathToFileURL(full).href,
            shortCircuit: true,
          };
        }
      }
    }
  }

  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith('file:') && (url.endsWith('.ts') || url.endsWith('.tsx'))) {
    const filePath = fileURLToPath(url);
    const source = fs.readFileSync(filePath, 'utf8');

    const transformed = esbuild.transformSync(source, {
      loader: url.endsWith('.tsx') ? 'tsx' : 'ts',
      format: 'esm',
      target: 'node22',
      jsx: 'automatic',
      define: {
        'import.meta.env': JSON.stringify({
          VITE_API_URL: '/api/v1',
          MODE: 'test',
          DEV: false,
          PROD: true,
        }),
      },
      sourcefile: filePath,
    });

    return {
      format: 'module',
      source: transformed.code,
      shortCircuit: true,
    };
  }

  return nextLoad(url, context);
}
