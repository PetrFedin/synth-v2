import process from 'node:process';
import { loadOptionalEnvFile } from '../src/runtime/local-env.mjs';
import { readHostSetting } from '../src/runtime/server-lifecycle.mjs';

loadOptionalEnvFile('.env');
process.env.HOST = readHostSetting(process.env.HOST);
await import('../src/server.mjs');
