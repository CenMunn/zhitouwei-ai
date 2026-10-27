import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import Module,{createRequire} from 'node:module'
import ts from 'typescript'
import {fileURLToPath} from 'node:url'
const req=createRequire(import.meta.url),root=fileURLToPath(new URL('../',import.meta.url))
let session,authorized=true,casConflict=false,writes=[],queries=[],modelCalls=0,modelMode='valid'
function fixture(){authorized=true;casConflict=false;writes=[];queries=[];modelCalls=0;session={id:'s',ownerId:'u',query:'开发案例',stockCode:'600519',stockName:'贵州茅台',status:'completed',meta:JSON.stringify({stocks:[{code:'600519',name:'贵州茅台'}],audit:{version:'evidence-v1',runId:'s',capturedAt:'2026-10-18T01:00:00Z',records:[],claims:[],failedAgents:[],stageDurationsMs:{},modelEvaluation:'live',decisionGate:{canPublishDecision:false,reasons:['资料有限']},researchConclusion:{status:'complete',summary:'原始结论',points:[],risks:[],missing:[],sourceIds:[],investmentRating:null,completeSemanticVerification:false},researchDiscussion:[],reportMd:'# Original report'}}),agents:[{id:'a',sessionId:'s',agentKey:'industry',agentName:'行业分析师',score:50,confidence:0,summary:'原摘要',highlights:'[]',concerns:'[]',evidence:'[]',details:'{"scoreBasis":"baseline"}',createdAt:new Date()}]}}
const mapAgent=a=>({...a,details:JSON.parse(a.details),highlights:JSON.parse(a.highlights),concerns:JSON.parse(a.concerns),evidence:JSON.parse(a.evidence)})
const db={researchSession:{findFirst:async q=>{queries.push(q);return session&&q.where.id===session.id&&q.where.ownerId==='u'?structuredClone(session):null}},$transaction:async fn=>fn({researchSession:{updateMany:async q=>{if(casConflict)return {count:0};writes.push({kind:'session',...q});session.meta=q.data.meta;return {count:1}}},agentAnalysis:{update:async q=>{writes.push({kind:'agent',...q});Object.assign(session.agents.find(a=>a.id===q.where.id),q.data);return q.data}}})}
function load(file,cache={}){if(cache[file])return cache[file];const f=path.join(root,file);if(!fs.existsSync(f))return {};if(file.endsWith('.json'))return JSON.parse(fs.readFileSync(f,'utf8'));const m=new Module(f);m.require=id=>{
 if(id==='next/server')return {NextResponse:{json:(b,i)=>Response.json(b,i)}}
 if(id==='@/lib/auth/server')return {requireUser:async(request,options)=>{assert.equal(options.write,true);if(!authorized)throw Object.assign(Error('login'),{status:401});if(request.headers.get('Origin')!=='http://localhost')throw Object.assign(Error('origin'),{status:403});return {id:'u',username:'reviewer',displayName:'真实登录用户',role:'USER'}},ownerFilter:u=>({ownerId:u.id}),authErrorResponse:e=>[401,403].includes(e.status)?Response.json({error:e.message},{status:e.status}):null}
 if(id==='@/lib/db')return {db}
 if(id==='@/lib/pipeline/runner')return {mapAgent}
 if(id==='@/lib/ai/llm')return {withLLMTrace:async fn=>({value:await fn(),calls:[{responseModel:'test-model'}]}),chatJSON:async(_s,u)=>{modelCalls++;if(modelMode==='throw')throw Error('private upstream details');const data=JSON.parse(u);return {score:64,confidence:75,reason:modelMode==='bad_claim'?'现金转化表面强劲。':'根据补充资料作条件性判断。',informationSufficient:true,sourceIds:modelMode==='bad_source'?['invented']:[data.userSupplements[0].id]}}}
 if(id.startsWith('@/'))return load('src/'+id.slice(2)+(id.endsWith('.json')?'':'.ts'),cache)
 return req(id)
 };cache[file]=m.exports;m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f+'.cjs');cache[file]=m.exports;return m.exports}
const api=load('src/app/api/research/[id]/score-review/route.ts')
const body={action:'manual_adjust',agentId:'a',expectedRevision:0,score:65,confidence:40,reason:'原页核对后调整。',actor:{id:'fake'}}
function post(b=body,origin='http://localhost'){return api.POST(new Request('http://localhost/api/research/s/score-review',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(b)}),{params:Promise.resolve({id:'s'})})}
test('review endpoint preserves authentication, same-origin writes and owner isolation',async()=>{
 assert.equal(typeof api.POST,'function');fixture();authorized=false;assert.equal((await post()).status,401)
 authorized=true;assert.equal((await post(body,'https://outside.invalid')).status,403)
 session.ownerId='other';session.id='other';assert.equal((await post()).status,404);assert.equal(writes.length,0)
})
test('running sessions, stale versions, malformed scores and lost optimistic updates cannot mutate anything',async()=>{
 fixture();session.status='analyzing';assert.equal((await post()).status,409)
 fixture();assert.equal((await post({...body,expectedRevision:3})).status,409)
 fixture();assert.equal((await post({...body,score:999})).status,400)
 fixture();casConflict=true;assert.equal((await post()).status,409);assert.equal(writes.length,0)
})
test('manual adjustment atomically saves score, composite, full report and original snapshot under server identity',async()=>{
 fixture();const r=await post();assert.equal(r.status,200);const out=await r.json();assert.equal(out.revision,1)
 assert.equal(out.agent.score,65);assert.equal(out.agent.details.scoreBasis,'human_adjusted')
 assert.equal(writes.filter(w=>w.kind==='agent').length,1);const audit=JSON.parse(session.meta).audit
 assert.equal(audit.researchConclusion.scoreSummary.score,65)
 assert.equal(audit.scoreReviews[0].actor.id,'u');assert.equal(audit.scoreReviews[0].reportBefore,'# Original report')
 assert(audit.reportMd.includes('人工调整'));assert(audit.reportMd.includes('真实登录用户'))
 assert.equal(audit.decisionGate.canPublishDecision,false)
 assert(queries.every(q=>q.where.ownerId==='u'));assert.equal(modelCalls,0)
})

test('AI proposal does not change scores before acceptance, and invalid model claims cannot be saved',async()=>{
 const supplement={text:'资料边界说明，不能从两个金额外推行业排名。',source:'审核说明文件',locator:'第一段',checked:false}
 fixture();modelMode='valid';let r=await post({...body,action:'ai_rescore',supplement});assert.equal(r.status,200)
 let out=await r.json();assert.equal(out.agent.score,50);assert.equal(out.agent.details.scoreReview.proposal.confidence,40)
 assert.equal(out.entry.rawCandidate.confidence,75)
 assert.equal(out.agent.details.scoreReview.supplements[0].checkedBy,null)
 const proposalId=out.agent.details.scoreReview.proposal.id
 r=await post({...body,action:'accept_ai',expectedRevision:1,proposalId});assert.equal(r.status,200);out=await r.json();assert.equal(out.agent.score,64);assert.equal(out.agent.details.scoreBasis,'ai_estimate')
 for(const mode of ['bad_source','bad_claim','throw']){fixture();modelMode=mode;const rejected=await post({...body,action:'ai_rescore',supplement});assert.equal(rejected.status,mode==='throw'?502:422);assert.equal(writes.length,0);assert.equal(session.agents[0].score,50);assert(!JSON.stringify(await rejected.json()).includes('private upstream details'))}
 modelMode='valid'
})
