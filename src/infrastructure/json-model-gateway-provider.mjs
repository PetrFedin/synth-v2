import { invariant } from '../core/errors.mjs';

/** @param {{ endpoint?: string, token?: string, fetchImpl?: typeof fetch, timeoutMs?: number }} [options] */
export function createJsonModelGatewayProvider(options={}) {
  const {endpoint,token,fetchImpl=fetch,timeoutMs=60000}=options;
  invariant(typeof endpoint==='string'&&endpoint.startsWith('https://'),'AI_GATEWAY_ENDPOINT_INVALID','AI model gateway endpoint must use HTTPS');
  invariant(typeof token==='string'&&token.length>=16,'AI_GATEWAY_TOKEN_INVALID','AI model gateway token is required');
  invariant(typeof fetchImpl==='function','AI_GATEWAY_FETCH_INVALID','AI model gateway fetch implementation is required');
  return Object.freeze({
    async execute(request,options={}) {
      const {signal}=/** @type {{signal?: AbortSignal}} */ (options);
      const controller=new AbortController();
      const relay=()=>controller.abort();
      signal?.addEventListener?.('abort',relay,{once:true});
      const timer=setTimeout(()=>controller.abort(),timeoutMs);
      try{
        const response=await fetchImpl(endpoint,{
          method:'POST',
          headers:{'content-type':'application/json','accept':'application/json','authorization':`Bearer ${token}`},
          body:JSON.stringify(request),
          signal:controller.signal,
        });
        const payload=await response.json().catch(()=>null);
        if(!response.ok){
          const error=Object.assign(new Error('AI model gateway request failed'),{
            code:`AI_GATEWAY_HTTP_${response.status}`,
            retryable:response.status===408||response.status===409||response.status===429||response.status>=500,
          });
          throw error;
        }
        invariant(payload&&typeof payload==='object'&&!Array.isArray(payload),'AI_GATEWAY_RESPONSE_INVALID','AI model gateway response must be a JSON object');
        invariant(Object.hasOwn(payload,'output'),'AI_GATEWAY_RESPONSE_INVALID','AI model gateway response must contain output');
        return Object.freeze({output:payload.output,usage:payload.usage??{}});
      }catch(error){
        if(controller.signal.aborted&&signal?.aborted!==true) throw Object.assign(new Error('AI model gateway timed out'),{code:'AI_MODEL_TIMEOUT',retryable:true});
        throw error;
      }finally{
        clearTimeout(timer);
        signal?.removeEventListener?.('abort',relay);
      }
    },
  });
}
