import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import Module, {createRequire} from 'node:module'
import * as engine from '../src/lib/research-evidence/engine.ts'
import * as reporting from '../src/lib/research-evidence/scope.ts'
import * as scoring from '../src/lib/research/investment-score.ts'

// Exposed development responses only. Never read locked-v2 questions or gold.
const old=JSON.parse(fs.readFileSync(new URL('./fixtures/semantic-old-cases.json',import.meta.url),'utf8'))
const now='2026-10-03T00:00:00Z'
const record=(period,value,extra={})=>({id:'dev:'+period,stockCode:'900001',kind:'filing',metric:'basicEPS',label:'基本每股收益',value,unit:'元/股',currency:'CNY',period,scope:'consolidated',publishedAt:'2025-01-01',capturedAt:now,validUntil:'2027-01-01',source:'开发公司年度报告',sourceUrl:'https://example.com/report.pdf',locator:'表格',excerpt:'基本每股收益年度表',verification:'source_checked',documentSha256:'dev-report',...extra})
const eps=[record('2024年度',68.64,{stockCode:'600519'}),record('2025年度',65.66,{stockCode:'600519'})]
const context={id:'dev-context',stockCode:'600519',period:'2025年度',summary:'经营现金流受财务公司存款变化影响',excerpt:'经营活动产生的现金流量净额减少主要是财务公司吸收成员单位存款减少。',source:'年报',sourceUrl:'https://example.com/report.pdf',locator:'原文',page:6,documentSha256:'dev-report',publishedAt:'2026-01-01',capturedAt:now,validUntil:'2027-01-01',verification:'source_checked',reviewNote:'开发用'}
const review=(raw,records=[],contexts=[])=>{
 assert.equal(typeof engine.reviewFinancialSemantics,'function','financial semantic review must exist')
 return engine.reviewFinancialSemantics(raw,{records,contexts,now})
}
const codes=r=>r.issues.map(x=>x.code)

// Removing pre-display source-direction validation must break these assertions.
test('old H03 correct main value does not hide reversed annual comparison',()=>{
 assert.ok(codes(review(old.H03,eps)).includes('ANNUAL_COMPARISON_MISMATCH'))
})
test('both explicit comparison directions use their own denominator',()=>{
 for(const text of ['基本每股收益：2025年较2024年下降4.34%。','基本每股收益：2024年相对2025年上升4.54%。'])
  assert.deepEqual(review({answer:text},eps).issues,[])
 assert.ok(codes(review({answer:'基本每股收益：2025年较2024年上升4.34%。'},eps)).includes('ANNUAL_COMPARISON_MISMATCH'))
})
test('annual arithmetic rejects zero denominators and does not mix entity/unit/scope',()=>{
 assert.ok(codes(review({answer:'基本每股收益：2025年较2024年上升10%。'},[record('2024年度',0),record('2025年度',1)])).includes('ANNUAL_COMPARISON_UNDEFINED'))
 for(const extra of [{stockCode:'other'},{unit:'万元'},{scope:'parent_attributable'},{verification:'unverified'}])
  assert.deepEqual(review({answer:'基本每股收益：2025年较2024年上升10%。'},[record('2024年度',10),record('2025年度',11,extra)]).issues,[])
})
test('annual checks honor displayed rounding rather than inventing extra precision',()=>{
 assert.deepEqual(review({answer:'基本每股收益：2025年较2024年下降约4.3%。'},eps).issues,[])
})
test('old H29 operating cash flow context cannot be relabelled non-operating',()=>{
 assert.ok(codes(review(old.H29,[],[context])).includes('CASH_FLOW_RECLASSIFICATION'))
})
test('cash-flow classification accepts negation and does not block separate dividend statements',()=>{
 for(const answer of ['财务公司存款属于合并经营现金流，不能归为非经营性因素。','成员单位存款影响经营现金流，并非非经营性因素。','财务公司存款影响经营现金流。现金分红属于筹资活动。','财务公司存款影响经营现金流，现金分红属于非经营性现金流。'])
  assert.deepEqual(review({answer},[],[context]).issues,[])
 assert.deepEqual(review({answer:'财务公司存款属于非经营性因素。'},[],[{...context,verification:'unverified'}]).issues,[])
})
test('old H31 partial minority non-recurring item cannot prove total-profit inequality',()=>{
 assert.ok(codes(review(old.H31)).includes('PARTIAL_ITEM_PROFIT_INFERENCE'))
})
test('profit definitions do not imply unequal numerical values in all years',()=>{
 assert.ok(codes(review({answer:'净利润与归母净利润必然不同。'})).includes('UNIVERSAL_PROFIT_INEQUALITY'))
 for(const answer of ['净利润与归母净利润是不同口径，数值未必不同。','非经常性损益少数股东影响额不能证明全年净利润与归母净利润不相等。','净利润与归母净利润不一定相等，也不一定不同，需核对完整利润表。','完整合并利润表：净利润110元、归母净利润100元，所以本期两个金额不同。'])
  assert.deepEqual(review({answer}).issues,[])
})
test('dangerous claims are inspected beyond display limits and in nested extras',()=>{
 assert.ok(codes(review({summary:'正常'.repeat(200),details:{nested:{note:'净利润与归母净利润必然不同。'}}})).includes('UNIVERSAL_PROFIT_INEQUALITY'))
})

// Stub the external generation only; exercise real agent parsing and suppression.
const require=createRequire(import.meta.url)
let response=old.H29
let responses=[]
const mod=new Module('semantic-agent-test')
mod.require=id=>id==='@/lib/ai/llm'?{withLLMTrace:async run=>({value:await run(),calls:[]}),chatJSON:async()=>responses.length?responses.shift():response}:id==='@/lib/research/investment-score'?scoring:id==='@/lib/research-evidence/engine'?engine:id==='@/lib/research-evidence/scope'?reporting:id==='@/lib/data/slang-dictionary'?{SLANG_TERMS_COUNT:490}:require(id)
mod._compile(ts.transpileModule(fs.readFileSync(new URL('../src/lib/pipeline/agents.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,'semantic-agent-test.cjs')
const packet={stock:null,stockName:'开发公司',stockCode:'900001',market:'A',question:'开发用财务核对',macro:{},news:[],newsSearchStatus:'empty',evidenceRecords:[],evidenceAsOf:now,filingContexts:[context]}
test('agent preserves both attempts when the model cannot fix a semantic failure',async()=>{
 response=old.H29
 const run=await mod.exports.fundamentalAgent(packet)
 assert.equal(run.error?.message,'FINANCIAL_SEMANTIC_REVIEW_REQUIRED')
 assert.equal(run.output.score,50);assert.equal(run.output.vote,null);assert.equal(run.output.confidence,0)
 assert.equal(run.output.details.scoreBasis,'baseline');assert.equal(run.output.details.semanticReview.attempts.length,2)
 assert.deepEqual(run.raw,old.H29)
 assert.deepEqual(run.output.details.semanticReview.originalOutput,old.H29)
 assert.ok(run.output.concerns.some(x=>x.includes('现金流')))
})

test('model repairs a bad cash-flow classification from original notes; both candidates remain inspectable',async()=>{
 const corrected={summary:'财务公司存款变化影响合并经营现金流，不能重分类为非经营性。',score:65,confidence:70,highlights:[],concerns:[],evidence:[]}
 responses=[old.H29,corrected]
 const run=await mod.exports.fundamentalAgent(packet)
 assert.equal(run.error,null);assert.equal(run.output.score,65);assert.equal(run.output.confidence,40)
 assert.equal(run.output.details.semanticReview.status,'model_repaired')
 assert.deepEqual(run.output.details.semanticReview.attempts[0].candidate,old.H29)
 assert.deepEqual(run.output.details.semanticReview.attempts[1].candidate,corrected)
 assert.equal(run.output.details.semanticReview.completeSemanticVerification,false)
})

test('a sound analysis missing its score gets one explicit scoring call, not an invented score',async()=>{
 responses=[{summary:'财务公司存款变化影响经营现金流。',score:null,confidence:null,highlights:[],concerns:[],evidence:[]},{score:64,confidence:35,scoreReason:'仅按现金流资料作条件判断'}]
 const run=await mod.exports.fundamentalAgent(packet)
 assert.equal(run.error,null);assert.equal(run.output.score,64);assert.equal(run.output.details.scoreBasis,'ai_estimate')
 assert.equal(run.output.details.scoreCandidate.score,64);assert.equal(responses.length,0)
})

test('wrong investment-score reasoning cannot replace a sound factual analysis',async()=>{
 responses=[{summary:'经营现金流高于归母净利润，只作金额比较。',score:null,confidence:null,highlights:[],concerns:[],evidence:[]},{score:90,confidence:75,scoreReason:'经营现金流对净利润覆盖明显优于对手。'}]
 const run=await mod.exports.fundamentalAgent({...packet,evidenceRecords:[record('2025年度',100,{metric:'netProfit',scope:'parent_attributable'})]})
 assert.equal(run.error,null);assert.equal(run.output.score,50);assert.equal(run.output.details.scoreBasis,'baseline')
 assert.ok(run.output.details.scoreReviewIssues.length);assert.equal(run.output.details.scoreCandidate.score,90)
})
test('agent preserves a correct answer without claiming semantic proof',async()=>{
 response={summary:'财务公司存款变化影响合并经营现金流，不能重分类为非经营性。',score:45,vote:'HOLD',confidence:60,highlights:[],concerns:[],evidence:[]}
 const run=await mod.exports.fundamentalAgent(packet)
 assert.equal(run.error,null);assert.equal(run.output.score,45)
 assert.equal(run.output.details.semanticReview.status,'no_issue_detected')
 assert.equal(run.output.details.semanticReview.completeSemanticVerification,false)
})
test('semantic failure reaches the existing decision gate through actual agent error',async()=>{
 response=old.H29
 const run=await mod.exports.fundamentalAgent(packet)
 const gate=engine.evaluateGate({records:[],claims:[],riskStatus:'ok',failedAgents:run.error ? ['fundamental'] : [],quantitativeReady:true,now})
 assert.equal(gate.status,'review_required');assert.equal(gate.canPublishDecision,false)
 assert.ok(gate.reasons.some(r=>r.includes('fundamental')))
})

test('actual agent rejects parent-only claim backed by consolidated record and keeps original',async()=>{
 const r=record('2023年度',100,{id:'dev-scope',metric:'ocf',label:'经营活动产生的现金流量净额',scope:'consolidated'})
 response={summary:'母公司经营现金流100元',score:75,vote:'BUY',confidence:80,evidence:[{evidenceId:r.id,claim:'母公司单体经营现金净额100元'}]}
 const run=await mod.exports.fundamentalAgent({...packet,evidenceRecords:[r]})
 assert.equal(run.error?.message,'FINANCIAL_SEMANTIC_REVIEW_REQUIRED');assert.equal(run.output.score,50);assert.equal(run.output.details.scoreBasis,'baseline')
 assert.deepEqual(run.output.details.semanticReview.originalOutput,response)
})
