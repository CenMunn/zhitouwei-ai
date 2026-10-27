import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import Module from 'node:module'
import {createRequire} from 'node:module'
import * as engine from '../src/lib/research-evidence/engine.ts'
import * as reporting from '../src/lib/research-evidence/scope.ts'
import * as scoring from '../src/lib/research/investment-score.ts'

const require=createRequire(import.meta.url)
let captured=[]
const code=ts.transpileModule(fs.readFileSync(new URL('../src/lib/pipeline/agents.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const mod=new Module('citation-contract-test')
mod.require=id=>id==='@/lib/ai/llm'?{withLLMTrace:async run=>({value:await run(),calls:[]}),chatJSON:async(system,user)=>{captured.push({system,user});return {score:73,confidence:70,summary:'资料有限',highlights:[],concerns:[],evidence:[],riskLevel:'Medium',riskPenalty:5,topRisks:['资料有限']}},tryChatJSON:async()=>null,chatText:async()=>''}:id==='@/lib/research/investment-score'?scoring:id==='@/lib/research-evidence/engine'?engine:id==='@/lib/research-evidence/scope'?reporting:id==='@/lib/data/slang-dictionary'?{SLANG_TERMS_COUNT:490}:require(id)
mod._compile(code,'citation-contract-test.cjs')
const packet={stock:null,stockName:'开发公司',stockCode:'999999',market:'A',question:'核对年度收入',macro:{},news:[],newsSearchStatus:'empty',evidenceRecords:[],evidenceAsOf:'2026-10-02'}

test('every numeric analyst example requires a complete singular citation tuple',async()=>{
  captured=[]
  for(const name of ['fundamentalAgent','industryAgent','macroAgent','sentimentAgent','riskAgent','focusedSourceAgent'])await mod.exports[name](packet,'','')
  assert.equal(captured.length,6)
  for(const {system} of captured){
    const example=system.match(/"evidence":\s*\[(\{[^\n]*?\})\]/)?.[1]
    assert.ok(example,'numeric evidence example exists')
    for(const field of ['evidenceId','value','unit','currency','period'])assert.ok(example.includes(`"${field}"`),`missing ${field} in role example`)
    assert.match(system,/资料缺口.*concerns/s)
    assert.match(system,/单个证据编号/)
  }
})

test('an empty verified catalog cannot authorize old financial search clues',async()=>{
  captured=[]
  await mod.exports.fundamentalAgent({...packet,financialClues:[{title:'旧线索',source:'test',summary:'999元'}]})
  assert.ok(!captured[0].user.includes('999元'))
  assert.match(captured[0].user,/资料边界/)
})

test('missing industry, macro and news sources show explicit baseline scores without invented market neutrality',async()=>{
 for(const name of ['industryAgent','macroAgent','sentimentAgent']){
  const run=await mod.exports[name](packet)
  assert.equal(run.output.score,50);assert.equal(run.output.vote,null)
  assert.equal(run.output.confidence,0);assert.equal(run.output.details.scoreBasis,'baseline')
  assert.ok(run.output.details.scoreReason)
  assert.match(captured.at(-1).system,/基准/)
 }
})

test('technical momentum can display while combined valuation remains blocked',async()=>{
 const now='2026-10-18T01:00:00Z'
 const r={id:'quant:999999:momentum',stockCode:'999999',kind:'calculation',metric:'momentum',label:'技术动量',value:61,unit:'分',currency:'CNY',period:'2025-10-01—2026-10-16',publishedAt:'2026-10-16',validUntil:'2026-10-23',sourceUrl:'https://example.org/kline',locator:'300条日线',excerpt:'momentum=61',verification:'source_checked'}
 const run=await mod.exports.quantAgent({...packet,evidenceAsOf:now,evidenceRecords:[r],technicalReady:true,quantitativeReady:false},{maTrendLabel:'均线向上'})
 assert.equal(run.output.score,61);assert.equal(run.output.vote,null);assert.equal(run.output.details.scoreKind,'technical_momentum');assert.equal(run.output.evidence[0].evidenceId,r.id)
 const noSource=await mod.exports.quantAgent({...packet,technicalReady:false,quantitativeReady:false},{})
 assert.equal(noSource.output.score,50);assert.equal(noSource.output.details.scoreBasis,'baseline')
})

test('usable financial material permits conditional role scores without fabricating direct macro or news evidence',async()=>{
 const r={id:'f1',stockCode:'999999',kind:'filing',metric:'ocf',label:'经营活动现金流量净额',value:100,unit:'元',currency:'CNY',period:'2025年度',publishedAt:'2026-04-01',validUntil:'2027-01-01',sourceUrl:'https://example.org/report.pdf',locator:'第6页',excerpt:'经营现金流量净额100元',verification:'source_checked'}
 for(const name of ['industryAgent','macroAgent','sentimentAgent']){
  const run=await mod.exports[name]({...packet,evidenceAsOf:'2026-10-18',evidenceRecords:[r]})
  assert.equal(run.output.score,73,name);assert.equal(run.output.confidence,40,name)
  assert.equal(run.output.details.scoreBasis,'ai_estimate');assert.equal(run.output.summary,'资料有限')
 }
 const expired=await mod.exports.macroAgent({...packet,evidenceAsOf:'2026-10-18',evidenceRecords:[{...r,validUntil:'2025-01-01'}]})
 assert.equal(expired.output.details.scoreBasis,'baseline')
})
