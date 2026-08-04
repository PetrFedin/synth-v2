import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createStandaloneHandler } from '../src/web/static-handler.mjs';

const publicDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','public');
const build='visual-20260804-11';
const v10Build='visual-20260804-10';
const v9Build='visual-20260804-9';
const v8Build='visual-20260804-8';
const legacyBuild='visual-20260804-7';
const sampleBuild='industrial-20260804-2';
async function withServer(handler,work){const server=createServer(handler);server.listen(0,'127.0.0.1');await once(server,'listening');try{await work(`http://127.0.0.1:${server.address().port}`)}finally{server.close();await once(server,'close')}}

test('the shell loads Omnidata V11 after every implemented product workspace',async()=>{
  const html=await readFile(path.join(publicDir,'index.html'),'utf8');
  assert.match(html,new RegExp(`meta name="syntha-build" content="${build}"`));
  for(const asset of [`omnidata-v8.css?v=${v8Build}`,`omnidata-v8-reference.css?v=${v8Build}`,`omnidata-v9.css?v=${v9Build}`,`omnidata-v10.css?v=${v10Build}`,`omnidata-v11.css?v=${build}`,`omnidata-v11.js?v=${build}`,`samples.css?v=${sampleBuild}`,`samples.js?v=${sampleBuild}`])assert.match(html,new RegExp(asset.replaceAll('.','\\.')));
  const styles=[...html.matchAll(/<link\s+[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map(match=>new URL(match[1],'http://syntha.local').pathname);
  assert.deepEqual(styles.slice(-5),['/omnidata-v8.css','/omnidata-v8-reference.css','/omnidata-v9.css','/omnidata-v10.css','/omnidata-v11.css']);
  const scripts=[...html.matchAll(/<script defer src="([^"]+)"/g)].map(match=>new URL(match[1],'http://syntha.local').pathname);
  assert.deepEqual(scripts.slice(-6),['/ui/omnidata-v8.js','/ui/omnidata-v9.js','/ui/omnidata-v10.js','/ui/omnidata-v11.js','/ui/dom-boolean-props.js','/ui/app-start.js']);
  assert.ok(scripts.indexOf('/ui/samples.js')>scripts.indexOf('/ui/measurement-catalog-sync.js'));
  assert.doesNotMatch(html,/\/ui\/omnidata-v4\.js|\/ui\/omnidata-v6\.js/);
});

test('the standalone server prevents stale caching of every active V11 asset',async()=>{
  const handler=createStandaloneHandler({publicDir,apiHandler:(_request,response)=>{response.statusCode=404;response.end()}});
  await withServer(handler,async(base)=>{
    for(const asset of [`/omnidata.css?v=${legacyBuild}`,`/omnidata-v8.css?v=${v8Build}`,`/omnidata-v9.css?v=${v9Build}`,`/omnidata-v10.css?v=${v10Build}`,`/omnidata-v11.css?v=${build}`,`/ui/omnidata-v10.js?v=${v10Build}`,`/ui/omnidata-v11.js?v=${build}`,`/samples.css?v=${sampleBuild}`,`/ui/samples.js?v=${sampleBuild}`]){const response=await fetch(`${base}${asset}`);assert.equal(response.status,200,asset);assert.equal(response.headers.get('cache-control'),'no-store',asset)}
  });
});
