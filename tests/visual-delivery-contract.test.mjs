import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createStandaloneHandler } from '../src/web/static-handler.mjs';
const publicDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','public');
async function withServer(handler,work){const server=createServer(handler);server.listen(0,'127.0.0.1');await once(server,'listening');try{await work(`http://127.0.0.1:${server.address().port}`)}finally{server.close();await once(server,'close')}}

test('the shell loads Omnidata V12 after every implemented product workspace',async()=>{const html=await readFile(path.join(publicDir,'index.html'),'utf8');assert.match(html,/meta name="syntha-build" content="visual-20260804-12"/);for(const asset of ['omnidata-v11.css?v=visual-20260804-11','omnidata-v12.css?v=visual-20260804-12','omnidata-v11.js?v=visual-20260804-11','omnidata-v12.js?v=visual-20260804-12','samples.css?v=industrial-20260804-2','samples.js?v=industrial-20260804-2'])assert.ok(html.includes(asset),asset);const styles=[...html.matchAll(/<link\s+[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map(match=>new URL(match[1],'http://syntha.local').pathname);assert.deepEqual(styles.slice(-6),['/omnidata-v8.css','/omnidata-v8-reference.css','/omnidata-v9.css','/omnidata-v10.css','/omnidata-v11.css','/omnidata-v12.css']);const scripts=[...html.matchAll(/<script defer src="([^"]+)"/g)].map(match=>new URL(match[1],'http://syntha.local').pathname);assert.deepEqual(scripts.slice(-7),['/ui/omnidata-v8.js','/ui/omnidata-v9.js','/ui/omnidata-v10.js','/ui/omnidata-v11.js','/ui/omnidata-v12.js','/ui/dom-boolean-props.js','/ui/app-start.js'])});
test('the standalone server prevents stale caching of active V12 assets',async()=>{const handler=createStandaloneHandler({publicDir,apiHandler:(_request,response)=>{response.statusCode=404;response.end()}});await withServer(handler,async(base)=>{for(const asset of ['/omnidata-v12.css?v=visual-20260804-12','/ui/omnidata-v12.js?v=visual-20260804-12']){const response=await fetch(`${base}${asset}`);assert.equal(response.status,200,asset);assert.equal(response.headers.get('cache-control'),'no-store',asset)}})});
