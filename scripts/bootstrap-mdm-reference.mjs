import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { bootstrapMdmReference } from '../src/infrastructure/mdm-reference-bootstrap.mjs';

const databaseUrl = process.env.SYNTHA_V2_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('SYNTHA_V2_DATABASE_URL is required');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const referenceDir = path.join(root, 'mdm', 'reference');
const files = (await fs.readdir(referenceDir)).filter((name) => name.endsWith('.json')).sort();
if (!files.length) throw new Error('No operational MDM reference datasets found');
const datasets = [];
for (const file of files) datasets.push(JSON.parse(await fs.readFile(path.join(referenceDir, file), 'utf8')));

const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
try {
  const result = await bootstrapMdmReference({ pool, datasets });
  console.log(JSON.stringify({ ok: true, profile: 'RU_FASHION_CORE', datasets: files, ...result }, null, 2));
} finally {
  await pool.end();
}
