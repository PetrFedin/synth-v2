import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStandaloneHandler } from '../src/web/static-handler.mjs';
const publicDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','public');
async function withServer(handler,work){const server=createServer(handler);server.listen(0,'127.0.0.1');await once(server,'listening');try{return await work(`http://127.0.0.1:${server.address().port}`)}finally{server.close();await once(server,'close')}}

test('serves standalone workspace and every ordered asset with security headers',async()=>{
  await withServer(createStandaloneHandler({publicDir,apiHandler:(_request,response)=>{response.statusCode=404;response.end()}}),async(base)=>{
    const response=await fetch(`${base}/`);assert.equal(response.status,200);assert.match(response.headers.get('content-security-policy'),/default-src 'self'/);
    const html=await response.text();
    const sources=[...html.matchAll(/<script defer src="([^"]+)"/g)].map(match=>match[1]);
    const sourcePaths=sources.map(source=>new URL(source,base).pathname);
    assert.deepEqual(sourcePaths.slice(-4),['/ui/omnidata-v10.js','/ui/omnidata-v11.js','/ui/dom-boolean-props.js','/ui/app-start.js']);
    assert.ok(sourcePaths.indexOf('/ui/sample-core.js')>sourcePaths.indexOf('/ui/measurement-core.js'));
    assert.ok(sourcePaths.indexOf('/ui/samples.js')>sourcePaths.indexOf('/ui/measurement-catalog-sync.js'));
    for(const source of sources){const script=await fetch(new URL(source,base));assert.equal(script.status,200,source);assert.match(script.headers.get('content-type'),/text\/javascript/)}
    const stylesheets=[...html.matchAll(/<link\s+[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map(match=>match[1]);
    const paths=stylesheets.map(source=>new URL(source,base).pathname);
    assert.deepEqual(paths.slice(-5),['/omnidata-v8.css','/omnidata-v8-reference.css','/omnidata-v9.css','/omnidata-v10.css','/omnidata-v11.css']);
    for(const stylesheet of stylesheets){const css=await fetch(new URL(stylesheet,base));assert.equal(css.status,200,stylesheet);assert.match(css.headers.get('content-type'),/text\/css/)}
  });
});

test('supports HEAD for active V11 assets without sending a body',async()=>{
  await withServer(createStandaloneHandler({publicDir,apiHandler:(_request,response)=>{response.statusCode=404;response.end()}}),async(base)=>{
    for(const asset of ['/ui/omnidata-v10.js','/ui/omnidata-v11.js','/ui/dom-boolean-props.js','/omnidata-v10.css','/omnidata-v11.css','/samples.css','/ui/samples.js']){const response=await fetch(`${base}${asset}`,{method:'HEAD'});assert.equal(response.status,200,asset);assert.equal(await response.text(),'')}
  });
});

test('delegates API and unknown paths to API handler',async()=>{
  const seen=[];await withServer(createStandaloneHandler({publicDir,apiHandler:(request,response)=>{seen.push(request.url);response.statusCode=202;response.end('api')}}),async(base)=>{assert.equal((await fetch(`${base}/v2/auth/me`)).status,202);assert.equal((await fetch(`${base}/unknown`)).status,202)});assert.deepEqual(seen,['/v2/auth/me','/unknown']);
});
