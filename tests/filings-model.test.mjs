import test from 'node:test';import assert from 'node:assert/strict';
import {callFilingModel, buildFilingRequest,FILING_REQUEST_CONFIG} from '../src/lib/filings/model.ts';
const draft={answer:'资料不足',facts:[],calculations:[],limitations:['仅有资产负债表'],refused:true};
const res=()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(draft)}}],usage:{prompt_tokens:42,completion_tokens:20}}),{status:200});
test('both modes have the same conversion and rounding JSON contract',()=>{
  for(const mode of ['single_model','current_evidence']){
    const request=buildFilingRequest('保留两位小数',[],'a'.repeat(64),mode);
    const text=request.messages[0].content;
    assert.match(text,/unit_conversion/);assert.match(text,/percentage_point_change/);assert.match(text,/两位|roundingDigits.*2/);
    assert.match(text,/舍入|四舍五入/);
  }
});
test('both modes freeze identical transport parameters and source input',async()=>{const bodies=[];for(const mode of ['single_model','current_evidence']){const r=await callFilingModel('问题',[{page:188,text:'开发资料'}],'a'.repeat(64),mode,{apiKey:'test',fetchFn:async(_,o)=>{bodies.push(JSON.parse(o.body));return res();},wait:async()=>{}});assert.equal(r.attempts.length,1);assert.equal(r.draft.refused,true);}for(const k of ['model','temperature','top_p','max_tokens','stream','thinking','response_format'])assert.deepEqual(bodies[0][k],bodies[1][k]);assert.equal(bodies[0].messages[1].content,bodies[1].messages[1].content);assert.equal(FILING_REQUEST_CONFIG.timeoutMs,120000);assert.equal(FILING_REQUEST_CONFIG.maxAttempts,2);});
test('retry technical failures only and retain raw failed reply',async()=>{let count=0;const r=await callFilingModel('问题',[],'a'.repeat(64),'current_evidence',{apiKey:'test',fetchFn:async()=>++count===1?new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'broken JSON'}}]}),{status:200}):res(),wait:async()=>{}});assert.equal(count,2);assert.match(r.attempts[0].raw,/broken JSON/);assert.ok(r.attempts[0].error);assert.equal(r.draft.refused,true);});
test('permanent HTTP error does not retry and missing usage is unknown',async()=>{let count=0;const r=await callFilingModel('问题',[],'a'.repeat(64),'single_model',{apiKey:'test',fetchFn:async()=>{count++;return new Response('{}',{status:401});},wait:async()=>{}});assert.equal(count,1);assert.equal(r.draft,null);assert.equal(r.attempts[0].usage,null);assert.match(r.error,/401/);});
test('finished attempts are persisted before beginning a retry',async()=>{let count=0;const persisted=[];await callFilingModel('问题',[],'a'.repeat(64),'single_model',{apiKey:'test',fetchFn:async()=>{count++;if(count===2)assert.deepEqual(persisted,[1]);return count===1?new Response('{}',{status:500}):res();},wait:async()=>{},onAttempts:async attempts=>{persisted.push(attempts.length);}});assert.deepEqual(persisted,[1,2]);});


test('missing refusal is rejected then retried with identical sources and recorded format correction',async()=>{
 const bodies=[];
 const r=await callFilingModel('开发问题',[],'a'.repeat(64),'current_evidence',{apiKey:'test',wait:async()=>{},fetchFn:async(_,o)=>{
  bodies.push(JSON.parse(o.body));const d=bodies.length===1?{answer:'',facts:[],calculations:[],limitations:[]}:draft;
  return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(d)}}]}),{status:200});
 }});
 assert.equal(r.attempts.length,2);assert.ok(r.attempts[0].error);assert.equal(r.draft.refused,true);
 assert.equal(bodies[0].messages[1].content,bodies[1].messages[1].content);
 assert.ok(bodies[1].messages.some(m=>/上次响应/.test(m.content)));
 assert.deepEqual(r.attempts[1].request,bodies[1]);assert.match(r.attempts[1].requestSha256,/^[a-f0-9]{64}$/);
 assert.deepEqual(bodies[0].thinking,{type:'disabled'});
});
test('two truncated replies retain failures without inventing a usable partial draft',async()=>{
 const r=await callFilingModel('开发问题',[],'a'.repeat(64),'single_model',{apiKey:'test',wait:async()=>{},fetchFn:async()=>new Response(JSON.stringify({choices:[{finish_reason:'length',message:{content:'{"refused":false'}}],usage:{completion_tokens:6000}}),{status:200})});
 assert.equal(r.draft,null);assert.equal(r.attempts.length,2);assert.ok(r.attempts.every(a=>a.finishReason==='length'&&a.error));
});
