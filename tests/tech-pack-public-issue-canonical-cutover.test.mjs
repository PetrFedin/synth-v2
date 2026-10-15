import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const read=p=>readFile(fileURLToPath(new URL('../'+p,import.meta.url)),'utf8');

test('supported PostgreSQL runtime overrides legacy issue command with canonical issuer',async()=>{
  const source=await read('src/runtime/postgres-base-runtime.mjs');
  assert.match(source,/createCanonicalTechPackIssueService/);
  assert.match(source,/issueTechPack:\s*techPackCanonicalIssue\.issueCanonicalTechPack/);
});

test('public Tech Pack routes keep stable issue transport contract during canonical cutover',async()=>{
  const routes=await read('src/http/tech-pack-routes.mjs');
  assert.match(routes,/by-code\/issue/);
  assert.match(routes,/service\.issueTechPack\(commandId, actorId, code, body\)/);
  assert.match(routes,/service\.issueTechPack\(commandId, actorId, params\[0\], body\)/);
});

test('legacy service implementation remains compatibility code but runtime is authoritative cutover',async()=>{
  const legacy=await read('src/application/tech-pack-service.mjs');
  const runtime=await read('src/runtime/postgres-base-runtime.mjs');
  assert.match(legacy,/issueTechPackDomain/);
  assert.match(runtime,/techPackCanonicalIssue\.issueCanonicalTechPack/);
});
