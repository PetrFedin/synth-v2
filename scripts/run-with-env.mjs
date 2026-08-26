import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { loadOptionalEnvFile } from '../src/runtime/local-env.mjs';

const target = process.argv[2];
if (!target) throw new Error('Operational command target module is required');

loadOptionalEnvFile('.env');

const absoluteTarget = path.resolve(target);
process.argv.splice(1, 2, absoluteTarget);
await import(pathToFileURL(absoluteTarget).href);
