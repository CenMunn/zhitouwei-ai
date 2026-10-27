import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import * as helper from '../scripts/source-experiment-utils.mjs'
const answer={answer:'合成答案',facts:[],calculations:[],claims:[],refused:false,limitations:[]}
const response=(value=answer,finish='stop',usage={total_tokens:17,prompt_tokens:10,completion_tokens:7})=>({choices:[{finish_reason:finish,message:{content:JSON.stringify(value)}}],usage})
function requireV2(){assert.equal(typeof helper.runV2Logical,'function');assert.equal(typeof helper.classifyV2Response,'function')}
async function serve(sequence,fn){
 const calls=[]
 const server=http.createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;calls.push(body);const item=sequence[Math.min(calls.length-1,sequence.length-1)];res.writeHead(item.status,{'Content-Type':'application/json',...(item.headers??{})});res.end(JSON.stringify(item.body))})
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 try{return await fn(`http://127.0.0.1:${server.address().port}/chat/completions`,calls)}finally{await new Promise(resolve=>server.close(resolve))}
}
const settings={maxAttemptsPerLogicalOutput:2,timeoutMsPerAttempt:1000,retryBackoffMs:2000}
test('v2 input selects a frozen whole-page bundle without private answer fields',()=>{
 assert.equal(typeof helper.buildV2CommonUser,'function')
 const q={question:'合成任务',sourceBundle:'one',gold:'PRIVATE_SENTINEL'}
 const user=helper.buildV2CommonUser(q,{asOf:'2026-10-03',bundles:{one:['page1']},pages:[{id:'page1',filename:'dev.pdf',pdfPage:7,text:'完整页正文'}, {id:'page2',text:'UNSELECTED'}]})
 assert.ok(user.includes('完整页正文'));assert.ok(!user.includes('PRIVATE_SENTINEL'));assert.ok(!user.includes('UNSELECTED'))
})
test('HTTP500 retries exactly the same bytes, retains failure usage, and stops on first usable output',async()=>{
 requireV2();const waits=[]
 await serve([{status:500,body:{error:'dev',usage:{total_tokens:3}}},{status:200,body:response()}],async(endpoint,calls)=>{
  const run=await helper.runV2Logical({endpoint,key:'synthetic',body:'{"messages":[{"content":"SAME"}]}',settings,wait:async ms=>waits.push(ms)})
  assert.deepEqual(calls,['{"messages":[{"content":"SAME"}]}','{"messages":[{"content":"SAME"}]}'])
  assert.equal(run.attempts.length,2);assert.equal(run.selectedAttempt,2);assert.equal(run.status,'usable_json');assert.equal(run.totalTokens,20);assert.deepEqual(waits,[2000])
 })
})
test('valid structured response with wrong facts or an empty answer is not semantically retried',async()=>{
 requireV2();await serve([{status:200,body:response({...answer,answer:'',facts:[{value:'WRONG'}]})}],async(endpoint,calls)=>{
  const run=await helper.runV2Logical({endpoint,key:'synthetic',body:'{}',settings,wait:async()=>{}})
  assert.equal(calls.length,1);assert.equal(run.selectedAttempt,1);assert.equal(run.status,'usable_json')
 })
})
test('invalid common types get at most two attempts, and reasoning never becomes a final answer',async()=>{
 requireV2();const body=response({...answer,facts:[null]})
 await serve([{status:200,body},{status:200,body:{choices:[{finish_reason:'stop',message:{content:'',reasoning_content:'{"answer":"draft"}'}}]}}],async(endpoint,calls)=>{
  const run=await helper.runV2Logical({endpoint,key:'synthetic',body:'{}',settings,wait:async()=>{}})
  assert.equal(calls.length,2);assert.equal(run.status,'failed');assert.equal(run.selectedAttempt,null);assert.equal(run.totalTokens,null);assert.equal(run.knownTokenSubtotal,17)
 })
})
test('HTTP400 terminates without using a spare attempt',async()=>{
 requireV2();await serve([{status:400,body:{error:'bad_parameter'}}],async(endpoint,calls)=>{
  const run=await helper.runV2Logical({endpoint,key:'synthetic',body:'{}',settings,wait:async()=>{}})
  assert.equal(calls.length,1);assert.equal(run.status,'failed');assert.equal(run.attempts[0].retryable,false)
 })
})
test('429 Retry-After is bounded identically and length-limited JSON is unusable',()=>{
 requireV2();assert.equal(helper.retryV2Delay('100',settings),10000);assert.equal(helper.retryV2Delay('0',settings),2000)
 const c=helper.classifyV2Response(200,response(answer,'length'))
 assert.equal(c.status,'truncated');assert.equal(c.retryable,true)
})
test('resuming completed attempts does not regenerate a usable response',async()=>{
 requireV2();let called=false
 const run=await helper.runV2Logical({endpoint:'http://unused',key:'synthetic',body:'{}',settings,previousAttempts:[{attempt:1,status:'usable_json',retryable:false,parsed:answer,usage:{total_tokens:17}}],fetcher:async()=>{called=true;throw Error('must not call')}})
 assert.equal(called,false);assert.equal(run.selectedAttempt,1)
})
