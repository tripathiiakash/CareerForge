import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const loaderUrl = pathToFileURL(path.resolve(__dirname, 'esbuild-loader.js')).href;
register(loaderUrl, import.meta.url);
