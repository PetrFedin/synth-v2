import test from 'node:test';
import assert from 'node:assert/strict';
import { createJsonModelGatewayProvider } from '../src/infrastructure/json-model-gateway-provider.mjs';

test('JSON model gateway sends bearer-authenticated provider-neutral request',async()=>{
  let captured;
  const provider=createJsonModelGatewayProvider({
    endpoint:'https://models.example.test/execute',
    token:'0123456789abcdef0123456789abcdef',
    fetchImpl:async(url,options)=>{
      captured={url,options};
      return new Response(JSON.stringify({output:{findings:[]},usage:{inputTokens:10}}),{
        status:200,headers:{'content-type':'application/json'},
      });
    },
  });
  const result=await provider.execute({requestId:'r1',model:'m1',input:{x:1}},{signal:new AbortController().signal});
  assert.equal(captured.url,'https://models.example.test/execute');
  assert.equal(captured.options.headers.authorization,'Bearer 0123456789abcdef0123456789abcdef');
  assert.deepEqual(JSON.parse(captured.options.body).input,{x:1});
  assert.deepEqual(result.output,{findings:[]});
  assert.equal(result.usage.inputTokens,10);
});

test('JSON model gateway marks throttling retryable without leaking response body',async()=>{
  const provider=createJsonModelGatewayProvider({
    endpoint:'https://models.example.test/execute',
    token:'0123456789abcdef',
    fetchImpl:async()=>new Response(JSON.stringify({secret:'do-not-propagate'}),{status:429,headers:{'content-type':'application/json'}}),
  });
  await assert.rejects(
    ()=>provider.execute({requestId:'r2'},{signal:new AbortController().signal}),
    error=>error.code==='AI_GATEWAY_HTTP_429'&&error.retryable===true&&!error.message.includes('do-not-propagate'),
  );
});

test('JSON model gateway refuses non-HTTPS endpoints',()=>{
  assert.throws(()=>createJsonModelGatewayProvider({
    endpoint:'http://models.example.test/execute',
    token:'0123456789abcdef',
  }),error=>error.code==='AI_GATEWAY_ENDPOINT_INVALID');
});
