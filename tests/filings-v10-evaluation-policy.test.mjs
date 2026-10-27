import test from 'node:test';import assert from 'node:assert/strict';
import {callFilingModel} from '../src/lib/filings/model.ts';
const ok=()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({refused:true,answer:'开发执行器',facts:[],calculations:[],limitations:[]})}}]}));
const common={apiKey:'synthetic-only',retryPolicy:'no_content_only',wait:async()=>{}};
test('strict evaluation keeps malformed JSON and truncation as one failed attempt',async()=>{
 for(const finish of ['stop','length']){let calls=0;const r=await callFilingModel('开发问题',[],'a'.repeat(64),'single_model',{...common,fetchFn:async()=>{calls++;return new Response(JSON.stringify({choices:[{finish_reason:finish,message:{content:'broken JSON'}}]}));}});assert.equal(calls,1);assert.equal(r.draft,null);assert.match(r.attempts[0].raw,/broken JSON/);assert.ok(r.error);}
});
test('strict evaluation retries only empty pre-response network errors with identical payload',async()=>{
 const requests=[];const r=await callFilingModel('开发问题',[],'a'.repeat(64),'current_evidence',{...common,fetchFn:async(_,o)=>{requests.push(JSON.parse(o.body));if(requests.length===1)throw new TypeError('fetch failed');return ok();}});assert.equal(requests.length,2);assert.deepEqual(requests[0],requests[1]);assert.ok(r.draft);assert.equal(r.attempts[0].httpStatus,null);assert.equal(r.attempts[0].raw,'');assert.equal(r.attempts[0].errorName,'TypeError');
});
test('strict evaluation never retries provider error bodies, timeout or interrupted HTTP bodies',async()=>{
 for(const kind of ['http500','timeout','partial']){let calls=0;const r=await callFilingModel('开发问题',[],'a'.repeat(64),'single_model',{...common,fetchFn:async()=>{calls++;if(kind==='http500')return new Response('{"error":"unavailable"}',{status:500});if(kind==='timeout')throw new DOMException('deadline','TimeoutError');return {status:200,ok:true,text:async()=>{throw new TypeError('body interrupted');}};}});assert.equal(calls,1,kind);assert.equal(r.draft,null);}
});
test('strict evaluation shares 120 seconds across attempts and backoff',async()=>{
 let clock=1000,calls=0;const r=await callFilingModel('开发问题',[],'a'.repeat(64),'single_model',{...common,now:()=>clock,wait:async ms=>{clock+=ms;},fetchFn:async()=>{calls++;clock+=119000;throw new TypeError('fetch failed');}});assert.equal(calls,1);assert.equal(r.draft,null);assert.ok(r.error);
 let lateClock=1000,lateCalls=0;const late=await callFilingModel('开发问题',[],'a'.repeat(64),'single_model',{...common,now:()=>lateClock,fetchFn:async()=>{lateCalls++;lateClock+=120001;return ok();}});assert.equal(lateCalls,1);assert.equal(late.draft,null);assert.match(late.error,/120000|预算/);
});
test('strict evaluation policy can be fixed at server startup without changing prompts',async()=>{
 const before=process.env.FILINGS_RETRY_POLICY;process.env.FILINGS_RETRY_POLICY='no_content_only';try{let calls=0;const r=await callFilingModel('开发问题',[],'a'.repeat(64),'current_evidence',{apiKey:'synthetic-only',wait:async()=>{},fetchFn:async()=>{calls++;return new Response('{}');}});assert.equal(calls,1);assert.equal(r.draft,null);}finally{if(before===undefined)delete process.env.FILINGS_RETRY_POLICY;else process.env.FILINGS_RETRY_POLICY=before;}
});
test('strict evaluation does not accept a valid candidate after persistence exhausts shared budget',async()=>{
 let clock=1000,calls=0,persisted=0;const r=await callFilingModel('开发问题',[],'a'.repeat(64),'single_model',{...common,now:()=>clock,fetchFn:async()=>{calls++;return ok();},onAttempts:async()=>{persisted++;clock=121001;}});assert.equal(calls,1);assert.equal(r.draft,null);assert.match(r.error,/预算/);assert.match(r.attempts[0].raw,/开发执行器/);assert.equal(r.attempts[0].errorName,'TimeoutError');assert.ok(persisted>=1);
});
