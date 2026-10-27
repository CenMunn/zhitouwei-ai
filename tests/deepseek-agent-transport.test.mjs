import test from 'node:test';
import assert from 'node:assert/strict';
import {chatJSON,chatText,withLLMTrace} from '../src/lib/ai/llm.ts';
import {resolveFilingProvider} from '../src/lib/filings/provider.ts';
process.env.DEEPSEEK_API_KEY='synthetic-secret-only';
delete process.env.DEEPSEEK_MODEL;
delete process.env.DEEPSEEK_BASE_URL;
delete process.env.FILINGS_PROVIDER;
delete process.env.LLM_AUDIT_LOG;
const ok=()=>new Response(JSON.stringify({id:'test-response',model:'deepseek-v4.1-flash',usage:{prompt_tokens:10,completion_tokens:8,total_tokens:18},choices:[{finish_reason:'stop',message:{content:'{"answer":"ok"}'}}]}));
test('both paths default to Flash; response identity and usage are retained',async()=>{
  const config=resolveFilingProvider();assert.equal(config.provider,'deepseek');assert.equal(config.model,'deepseek-flash');
  let body;globalThis.fetch=async(url,opt)=>{assert.equal(url,'https://api.deepseek.com/chat/completions');body=JSON.parse(opt.body);return ok()};
  const result=await withLLMTrace(()=>chatJSON('JSON','question'));
  assert.equal(body.model,'deepseek-flash');assert.deepEqual(result.value,{answer:'ok'});
  assert.equal(result.calls[0].responseModel,'deepseek-v4.1-flash');assert.equal(result.calls[0].usage.total_tokens,18);
  assert.equal(JSON.stringify(result).includes('synthetic-secret'),false);
});
test('authentication failure stops after one request and preserves safe diagnostic',async()=>{
  let count=0;globalThis.fetch=async()=>{count++;return new Response('synthetic-secret-only',{status:401})};
  await assert.rejects(withLLMTrace(()=>chatJSON('JSON','question')),error=>{
    assert.equal(error.message,'DEEPSEEK_HTTP_401');assert.equal(error.llmCalls.length,1);return true;
  });assert.equal(count,1);
});
test('transport error body is not leaked; retry budget is bounded',async()=>{
  let count=0;globalThis.fetch=async()=>{count++;throw new Error('synthetic-secret-only')};
  await assert.rejects(chatText('role','question'),/DEEPSEEK_TRANSPORT_ERROR/);assert.equal(count,3);
});
test('concurrent roles share three request slots and separate trace records',async()=>{
  let active=0,peak=0;
  globalThis.fetch=async()=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,20));active--;return ok()};
  const results=await Promise.all(Array.from({length:8},()=>withLLMTrace(()=>chatJSON('JSON','question'))));
  assert.equal(peak,3);assert.ok(results.every(r=>r.calls.length===1));
});
test('response timeout is an explicit failure, not a reason to switch providers',async()=>{
  let count=0;globalThis.fetch=async(_url,opt)=>{count++;return new Promise((_,reject)=>opt.signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError'))))};
  await assert.rejects(chatJSON('JSON','question',30),/LLM_TIMEOUT/);assert.equal(count,1);
});
