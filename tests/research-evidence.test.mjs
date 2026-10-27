import test from 'node:test'
import assert from 'node:assert/strict'

// Load optional exports so the initial RED run reports behavioral assertions,
// rather than stopping on a missing-module error.
const engine = await import('../src/lib/research-evidence/engine.ts')
const now = '2026-10-01T00:00:00Z'
const fact = {
  id: 'filing:600519:2025:revenue', stockCode: '600519', kind: 'filing',
  metric: 'revenue', label: '营业收入', value: 168838102514.79, unit: '元', currency: 'CNY',
  period: '2025年度', publishedAt: '2026-04-17', capturedAt: now,
  validUntil: '2027-04-17', source: '贵州茅台2025年年度报告',
  sourceUrl: 'https://www.moutaichina.com/report.pdf', locator: '第6页',
  excerpt: '营业收入 168,838,102,514.79', verification: 'source_checked',
  scope: 'consolidated',
}
const claim = { claim: '营业收入', evidenceId: fact.id, value: '168838102514.79', unit: '元', currency: 'CNY', period: '2025年度' }

test('same amount cannot certify another financial metric or an unspecified filing scope',()=>{
 const cash={...fact,id:'dev:cash',metric:'ocf',label:'经营活动产生的现金流量净额',value:123}
 assert.equal(engine.checkCitation({...claim,claim:'归母净利润123元',evidenceId:cash.id,value:'123',reportingScope:'consolidated'},[cash],now).verification,'rejected')
 const unknown={...fact};delete unknown.scope
 assert.equal(engine.checkCitation(claim,[unknown],now).verification,'unverified')
 assert.equal(engine.checkCitation({...claim,claim:'核心财务数据'},[fact],now).verification,'unverified')
})

test('adjusted profit and gross operating cash components cannot substitute net metrics',()=>{
 const profit={...fact,id:'dev:profit',metric:'netProfit',label:'归属于上市公司股东的净利润',scope:'parent_attributable',value:123}
 const cash={...fact,id:'dev:cash',metric:'ocf',label:'经营活动产生的现金流量净额',value:123}
 for(const text of ['扣非归母净利润123元','扣除非经常性损益后归属于上市公司股东的净利润123元'])
  assert.equal(engine.checkCitation({...claim,claim:text,evidenceId:profit.id,value:'123'},[profit],now).verification,'rejected')
 for(const text of ['经营活动现金流出123元','经营活动产生的现金流入123元','经营活动现金流出小计123元'])
  assert.equal(engine.checkCitation({...claim,claim:text,evidenceId:cash.id,value:'123'},[cash],now).verification,'rejected')
 assert.equal(engine.checkCitation({...claim,claim:'经营活动产生的现金流量净额123元',evidenceId:cash.id,value:'123'},[cash],now).verification,'matched')
})

test('server resolves evidence and checks exact value/unit/period; never trusts model source', () => {
  assert.equal(typeof engine.checkCitation, 'function')
  const result = engine.checkCitation({ ...claim, source: '模型虚构的来源' }, [fact], now)
  assert.equal(result.verification, 'matched')
  assert.equal(result.source, fact.source)
  assert.equal(result.sourceUrl, fact.sourceUrl)
  assert.match(result.verificationNote, /语义/)
})

test('unknown ID and changed value, unit, currency, period fail closed', () => {
  assert.equal(typeof engine.checkCitation, 'function')
  for (const override of [{evidenceId:'fake'}, {value:'999'}, {unit:'亿元'}, {currency:'USD'}, {period:'2024年度'}, {value:'NaN'}, {value:'Infinity'}, {unit:undefined}]) {
    assert.equal(engine.checkCitation({...claim,...override}, [fact], now).verification, 'rejected', JSON.stringify(override))
  }
})

test('demo, stale, future and duplicate sources cannot become matched evidence', () => {
  assert.equal(typeof engine.checkCitation, 'function')
  for (const override of [{verification:'demo'}, {validUntil:'2026-09-30'}, {publishedAt:'2027-01-01'}, {sourceUrl:'javascript:alert(1)'}, {value:NaN}]) {
    assert.notEqual(engine.checkCitation(claim, [{...fact,...override}], now).verification, 'matched')
  }
  assert.equal(engine.checkCitation(claim, [fact, {...fact,value:2}], now).verification, 'rejected')
})

test('a link to search text is not verification of a model claim', () => {
  assert.equal(typeof engine.checkCitation, 'function')
  assert.equal(engine.checkCitation({claim:'未来利润翻倍',evidenceId:'news:1'}, [{...fact,id:'news:1',kind:'search',value:null,verification:'unverified'}], now).verification, 'unverified')
})

test('missing financials are limited, not a neutral investment decision', () => {
  assert.equal(typeof engine.evaluateGate, 'function')
  const result = engine.evaluateGate({ records: [], claims: [], riskStatus:'ok', failedAgents:[], quantitativeReady:false, now })
  assert.equal(result.status, 'limited')
  assert.equal(result.canPublishDecision, false)
  assert.ok(result.reasons.length)
})

test('risk timeout and invalid risk payload block decision even with plausible data', () => {
  assert.equal(typeof engine.evaluateGate, 'function')
  for (const riskStatus of ['failed','invalid']) {
    const result = engine.evaluateGate({ records:[fact], claims:[], riskStatus, failedAgents:[], quantitativeReady:true, now })
    assert.equal(result.status, 'review_required')
    assert.equal(result.canPublishDecision, false)
  }
})

test('rejected citations or failed critical agent require review', () => {
  assert.equal(typeof engine.evaluateGate, 'function')
  for (const change of [{claims:[{verification:'rejected'}]}, {failedAgents:['fundamental']}]) {
    const result=engine.evaluateGate({records:[fact],claims:[],riskStatus:'ok',failedAgents:[],quantitativeReady:true,now,...change})
    assert.equal(result.status,'review_required')
  }
})

test('ready requires same-period verified financial coverage and actual quantitative inputs', () => {
  assert.equal(typeof engine.evaluateGate, 'function')
  const records=['revenue','netProfit','ocf'].map(metric=>({...fact,id:metric,metric,scope:metric==='netProfit'?'parent_attributable':'consolidated'}))
  const input={records,claims:[{verification:'matched'}],riskStatus:'ok',failedAgents:[],quantitativeReady:true,now}
  assert.equal(engine.evaluateGate(input).status,'ready')
  assert.equal(engine.evaluateGate({...input,records:records.map((r,i)=>({...r,period:i?'2024年度':'2025年度'}))}).status,'limited')
  assert.equal(engine.evaluateGate({...input,quantitativeReady:false}).status,'limited')
  assert.equal(engine.evaluateGate({...input,claims:[]}).status,'limited')
})

test('decision stages cannot begin with mixed parent-only or unknown reporting scopes',()=>{
 const records=['revenue','netProfit','ocf'].map(metric=>({...fact,id:metric,metric,scope:metric==='netProfit'?'parent_attributable':'consolidated'}))
 const input={records,claims:[{verification:'matched'}],failedAgents:[],quantitativeReady:true,now}
 assert.equal(engine.canStartDecisionStages(input).ready,true)
 for(const scope of ['parent_company','unknown',undefined])
  assert.equal(engine.canStartDecisionStages({...input,records:records.map(r=>r.metric==='ocf'?{...r,scope}:r)}).ready,false)
 assert.equal(engine.canStartDecisionStages({...input,failedAgents:['fundamental']}).ready,false)
 assert.equal(engine.canStartDecisionStages({...input,quantitativeReady:false}).ready,false)
})

test('intentionally skipped risk review is disclosed as limited, never a successful check',()=>{
 const x=engine.evaluateGate({records:[],claims:[],riskStatus:'not_run',failedAgents:[],quantitativeReady:false,now})
 assert.equal(x.status,'limited');assert.equal(x.canPublishDecision,false);assert.match(x.reasons.join(' '),/未执行/)
})

test('formal limited report distinguishes dates, scope, facts and review status',()=>{
 const x=engine.buildReviewReport({runId:'dev',stockName:'开发公司',query:'核对财报',records:[fact],claims:[],gate:{status:'limited',canPublishDecision:false,reasons:['缺少资料'],checkedAt:now}})
 for(const label of ['执行摘要','资料范围与分析方法','已登记事实','来源与引用','局限与后续复核','合并口径','2025年度']) assert.ok(x.includes(label),label)
})

test('review report includes run ID and sources, without synthetic rating or confidence', () => {
  assert.equal(typeof engine.buildReviewReport, 'function')
  const report=engine.buildReviewReport({runId:'run-123',stockName:'贵州茅台',query:'核对营收',records:[fact],gate:{status:'limited',canPublishDecision:false,reasons:['估值资料不足'],checkedAt:now},claims:[]})
  assert.match(report,/run-123/)
  assert.match(report,/168838102514.79/)
  assert.match(report,/第6页/)
  assert.match(report,/估值资料不足/)
  assert.doesNotMatch(report,/HOLD|BUY|SELL|置信度.*\d+%|建议仓位.*\d/)
})

test('contradictory registered figures cannot pass the decision gate',()=>{
  const records=['revenue','netProfit','ocf'].map(metric=>({...fact,id:metric,metric}))
  records.push({...records[0],id:'revenue-second-source',value:1})
  assert.equal(engine.evaluateGate({records,claims:[{verification:'matched'}],riskStatus:'ok',failedAgents:[],quantitativeReady:true,now}).status,'review_required')
})

test('risk validation rejects malformed payload rather than using Medium as success',()=>{
  assert.equal(typeof engine.isRiskPayloadValid,'function')
  for(const raw of [null,{}, {riskLevel:'mystery',riskPenalty:5,score:70}, {riskLevel:'Medium',riskPenalty:NaN,score:70}, {riskLevel:'Medium',riskPenalty:5,score:200}]) assert.equal(engine.isRiskPayloadValid(raw),false)
  assert.equal(engine.isRiskPayloadValid({riskLevel:'High',riskPenalty:7,score:40}),true)
})

test('debate failures and malformed content remain explicit failures', () => {
  for (const raw of [null, undefined, '', '   ', 42, {}]) {
    const result = engine.normalizeDebateTurn(raw)
    assert.equal(result.error, 'DEBATE_OUTPUT_UNAVAILABLE')
    assert.match(result.content, /失败/)
  }
  assert.deepEqual(engine.normalizeDebateTurn(' 有效论证 '), {content:'有效论证'})
})

test('malformed analyst payload cannot be recorded as a successful analysis',()=>{
  for (const raw of [null, {}, {summary:''}, {summary:'ok',score:Infinity}, {summary:'ok',score:101}]) assert.equal(engine.isAgentPayloadValid(raw),false)
  assert.equal(engine.isAgentPayloadValid({summary:'资料不足',score:null,confidence:null,vote:null}),true)
})
