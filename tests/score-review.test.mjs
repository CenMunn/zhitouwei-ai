import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import Module from 'node:module'
import ts from 'typescript'
import * as scoring from '../src/lib/research/investment-score.ts'
const file=new URL('../src/lib/research/score-review.ts',import.meta.url)
const m=new Module('score-review-tests');m.require=id=>id.endsWith('investment-score')?scoring:{safeSourceUrl:s=>{try{const u=new URL(s);return /^https?:$/.test(u.protocol)&&!u.username&&!u.password?u.href:null}catch{return null}}}
if(fs.existsSync(file))m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,'score-review-tests.cjs')
const api=m.exports
const agent={id:'a',sessionId:'s',agentKey:'industry',score:50,confidence:0,summary:'原始摘要',highlights:[],concerns:[],evidence:[],details:{scoreBasis:'baseline',scoreReason:'资料不足'}}
const actor={id:'u',displayName:'审核用户',username:'reviewer'},at='2026-10-18T03:00:00Z'
const req={action:'manual_adjust',agentId:'a',expectedRevision:0,score:68,confidence:45,reason:'核对行业资料后调整，仍保留风险。'}

test('manual scores must be whole numbers, reasons cannot be blank, review revision is required',()=>{
 assert.equal(typeof api.parseScoreReviewRequest,'function')
 assert.equal(api.parseScoreReviewRequest(req).score,68)
 for(const bad of [{score:101},{score:60.5},{score:'68'},{confidence:-1},{reason:' '},{expectedRevision:undefined},{action:'invented'}])assert.throws(()=>api.parseScoreReviewRequest({...req,...bad}))
 assert.throws(()=>api.parseScoreReviewRequest({...req,supplement:{text:'材料正文',source:'javascript:alert(1)',locator:'原页'}}))
})
test('human adjustment records server identity and keeps the original answer and score',()=>{
 const saved=api.applyScoreReview({agent,request:api.parseScoreReviewRequest(req),actor,at,id:'review1'})
 assert.equal(saved.agent.score,68);assert.equal(saved.agent.confidence,45)
 assert.equal(saved.agent.summary,agent.summary);assert.equal(saved.agent.details.scoreBasis,'human_adjusted')
 assert.equal(saved.agent.details.scoreReview.original.score,50)
 assert.equal(saved.entry.actor.id,'u');assert.equal(saved.entry.before.score,50)
 assert.equal(agent.score,50)
})
test('AI rescore is a pending candidate until explicitly accepted; supplemental text stays user supplied',()=>{
 const request=api.parseScoreReviewRequest({...req,action:'ai_rescore',supplement:{text:'新增行业资料摘录',source:'https://example.org/report',locator:'第7页',period:'2025年度',checked:true}})
 const proposed=api.applyScoreReview({agent,request,actor,at,id:'p1',proposal:{score:62,confidence:90,reason:'仅据现有资料作条件性判断。',sourceIds:['f1'],informationSufficient:true},calls:[{responseModel:'test-model'}]})
 assert.equal(proposed.agent.score,50);assert.equal(proposed.agent.details.scoreReview.proposal.confidence,40)
 assert.equal(proposed.agent.details.scoreReview.supplements[0].origin,'user_supplied')
 assert.equal(proposed.agent.details.scoreReview.supplements[0].checkedBy,'u')
 const accept=api.parseScoreReviewRequest({...req,action:'accept_ai',proposalId:'p1',reason:'核对后认可AI评分。'})
 const accepted=api.applyScoreReview({agent:proposed.agent,request:accept,actor,at,id:'p2'})
 assert.equal(accepted.agent.score,62);assert.equal(accepted.agent.details.scoreBasis,'ai_estimate')
 assert.equal(accepted.agent.details.scoreReview.confirmedBy.id,'u')
 assert.equal(accepted.agent.details.scoreReview.proposal,null)
 assert.throws(()=>api.applyScoreReview({agent:proposed.agent,request:{...accept,proposalId:'wrong'},actor,at,id:'p3'}))
})
test('model output cannot promote invented citations or skip a reason',()=>{
 const candidate={score:62,confidence:70,reason:'现有资料支持有限的正面判断。',sourceIds:['f1'],informationSufficient:true}
 assert.equal(api.validateConditionalProposal(candidate,['f1']).confidence,40)
 for(const bad of [{sourceIds:['invented']},{reason:''},{score:null},{informationSufficient:'yes'},{sourceIds:[]}])assert.throws(()=>api.validateConditionalProposal({...candidate,...bad},['f1']))
 const noInfo=api.validateConditionalProposal({...candidate,informationSufficient:false},['f1'])
 assert.equal(noInfo.score,50);assert.equal(noInfo.confidence,0)
})
test('manual adjustments have reduced opinion weight and cannot outweigh validated financial data by default',()=>{
 const c=scoring.combineInvestmentScores([{key:'fundamental',score:50,confidence:70,basis:'source_based'},{key:'industry',score:100,confidence:100,basis:'human_adjusted'}])
 assert.equal(c.components[1].effectiveWeight,8);assert.equal(c.score,61)
 const zero=scoring.combineInvestmentScores([{key:'fundamental',score:50,confidence:70,basis:'source_based'},{key:'industry',score:100,confidence:0,basis:'human_adjusted'}])
 assert.equal(zero.components[1].effectiveWeight,0);assert.equal(zero.score,50)
})
