import test from 'node:test'
import assert from 'node:assert/strict'
import { redact, summarizeEvents, assessRun } from '../scripts/model-run-utils.mjs'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { pathToFileURL, fileURLToPath } from 'node:url'

test('run artifacts remove configured credentials and authorization but retain token counts', () => {
  const input={apiKey:'test-private-secret',Authorization:'Bearer test-private-secret',usage:{prompt_tokens:9,completion_tokens:3},text:'error test-private-secret'}
  const output=redact(input,['test-private-secret'])
  assert.equal(JSON.stringify(output).includes('test-private-secret'),false)
  assert.equal(output.usage.prompt_tokens,9)
})
test('missing usage remains unknown and partial usage is explicitly separated', () => {
  const events=[{kind:'llm_start',requestId:'a'},{kind:'llm_end',requestId:'a',httpStatus:200,response:{usage:{prompt_tokens:10,completion_tokens:4,total_tokens:14}}},
    {kind:'llm_start',requestId:'b'},{kind:'llm_end',requestId:'b',httpStatus:200,response:{choices:[{message:{content:'done'}}]}}]
  const r=summarizeEvents(events)
  assert.equal(r.requestsStarted,2)
  assert.equal(r.usageCoverage,0.5)
  assert.equal(r.totalTokens,null)
  assert.equal(r.reportedTokenSubtotal,14)
  assert.equal(r.cost.amount,null)
})
test('completed lifecycle with failed agents cannot count as a successful full model run', () => {
  const r=assessRun([{session:{status:'completed',meta:{audit:{failedAgents:['debate:bear'],decisionGate:{status:'review_required'}}}},agents:[],debates:[],decision:null}],[])
  assert.equal(r.fullModelStagesSucceeded,false)
  assert.equal(r.investmentDecisionPublished,false)
})

test('analysis and risk success do not imply CIO and investment report completion', () => {
  const detail=code=>({session:{id:code,stockCode:code,status:'completed',meta:{audit:{failedAgents:[],decisionGate:{status:'limited'}}}},
    agents:['fundamental','industry','macro','sentiment','risk'].map(agentKey=>({agentKey,details:{executionStatus:'ok'}})),
    debates:[1,2,3,4].flatMap(round=>['bull','bear'].map(speakerKey=>({round,speakerKey}))),decision:null})
  const events=Array.from({length:28},(_,i)=>[{kind:'llm_start',requestId:String(i)},{kind:'llm_end',requestId:String(i),httpStatus:200,response:{}}]).flat()
  const r=assessRun([detail('600519'),detail('000858')],events)
  assert.equal(r.modelAnalysisStagesSucceeded,true)
  assert.equal(r.fullModelStagesSucceeded,false)
})

test('a completed comparison of the wrong company is a failed case',()=>{
  const detail=code=>({session:{id:code,stockCode:code,status:'completed',meta:{audit:{failedAgents:[]}}},
    agents:['fundamental','industry','macro','sentiment','risk'].map(agentKey=>({agentKey,details:{executionStatus:'ok'}})),
    debates:[1,2,3,4].flatMap(round=>['bull','bear'].map(speakerKey=>({round,speakerKey}))),decision:null})
  const events=Array.from({length:28},(_,i)=>[{kind:'llm_start',requestId:String(i)},{kind:'llm_end',requestId:String(i),httpStatus:200,response:{}}]).flat()
  const r=assessRun([detail('600519'),detail('00519')],events,['600519','000858'])
  assert.equal(r.targetIdentityMatched,false)
  assert.equal(r.modelAnalysisStagesSucceeded,false)
  assert.equal(r.fullModelStagesSucceeded,false)
})

test('runtime observer preserves real HTTP response and excludes bearer credentials', async () => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'semifinal-trace-'))
  const trace=path.join(dir,'events.ndjson')
  const server=http.createServer((_req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({model:'local-test-only',usage:{prompt_tokens:7,completion_tokens:2,total_tokens:9},choices:[{message:{content:'unchanged'}}]}))})
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  try {
    const url=`http://127.0.0.1:${server.address().port}/chat/completions`
    const preload=fileURLToPath(new URL('../scripts/model-trace-preload.mjs',import.meta.url))
    const code=`const r=await fetch(${JSON.stringify(url)},{method:'POST',headers:{Authorization:'Bearer fake-test-only-secret'},body:JSON.stringify({messages:[{role:'user',content:'hello'}]})});const j=await r.json();if(j.choices[0].message.content!=='unchanged')process.exit(3);`
    const child=spawn(process.execPath,['--import',pathToFileURL(preload).href,'--input-type=module','-e',code],{env:{...process.env,MODEL_TRACE_FILE:trace}})
    const exit=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve)})
    assert.equal(exit,0)
    const raw=await fs.readFile(trace,'utf8')
    assert.equal(raw.includes('fake-test-only-secret'),false)
    const events=raw.trim().split('\n').map(s=>JSON.parse(s))
    assert.equal(events[0].request.messages[0].content,'hello')
    assert.equal(summarizeEvents(events).totalTokens,9)
  } finally {await new Promise(resolve=>server.close(resolve));await fs.rm(dir,{recursive:true,force:true})}
})
