import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registryPath = path.join(root, 'mdm', 'sources', 'source-registry.json');
const statePath = path.join(root, 'mdm', 'generated', 'source-state.json');
const registry = JSON.parse(await fs.readFile(registryPath, 'utf8'));
let state = { state_version: '1', sources: {} };
try {
  state = JSON.parse(await fs.readFile(statePath, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

async function fingerprint(source) {
  const options = { redirect: 'follow', signal: AbortSignal.timeout(30_000), headers: { 'user-agent': 'Syntha-V2-MDM-Source-Monitor/1.0' } };
  let response = await fetch(source.probe_url, { ...options, method: 'HEAD' });
  if (!response.ok || (!response.headers.get('etag') && !response.headers.get('last-modified'))) {
    response = await fetch(source.probe_url, { ...options, method: 'GET' });
  }
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const etag = response.headers.get('etag');
  const lastModified = response.headers.get('last-modified');
  const contentLength = response.headers.get('content-length');
  let bodySha256 = null;
  if (!etag && !lastModified) {
    const body = Buffer.from(await response.arrayBuffer());
    bodySha256 = crypto.createHash('sha256').update(body).digest('hex');
  }
  const material = JSON.stringify({ etag, lastModified, contentLength, bodySha256 });
  return {
    fingerprint: crypto.createHash('sha256').update(material).digest('hex'),
    etag,
    last_modified: lastModified,
    content_length: contentLength,
    body_sha256: bodySha256
  };
}

const changed = [];
const failures = [];
for (const source of registry.sources.filter((item) => item.sync_mode === 'automated_probe')) {
  try {
    const observed = await fingerprint(source);
    const previous = state.sources[source.code];
    if (!previous || previous.fingerprint !== observed.fingerprint) {
      state.sources[source.code] = {
        ...observed,
        source_url: source.source_url,
        probe_url: source.probe_url,
        last_changed_at: new Date().toISOString()
      };
      changed.push(source.code);
      if (source.adapter) {
        const adapterModule = await import(pathToFileURL(path.join(root, source.adapter)).href);
        if (typeof adapterModule.syncSource !== 'function') throw new Error(`Adapter ${source.adapter} must export syncSource`);
        await adapterModule.syncSource({ root, source, observed });
      }
    }
  } catch (error) {
    failures.push({ source: source.code, error: error.message });
  }
}

if (changed.length) {
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

console.log(JSON.stringify({ checked_at: new Date().toISOString(), changed, failures }, null, 2));
if (failures.length) process.exitCode = 1;
