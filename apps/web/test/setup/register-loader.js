import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const loaderUrl = pathToFileURL(path.resolve('test/setup/esbuild-loader.js')).href;
register(loaderUrl, import.meta.url);
