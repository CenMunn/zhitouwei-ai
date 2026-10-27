import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const engine = await import('../src/lib/research-evidence/engine.ts')
const facts = JSON.parse(readFileSync(new URL('../src/lib/data/verified-facts.json',import.meta.url),'utf8'))
const contexts = JSON.parse(readFileSync(new URL('../src/lib/data/filing-context.json',import.meta.url),'utf8'))
const now='2026-10-02T01:00:00+08:00'
const compare = (records=facts) => engine.compareFinancialEvidence({records,contexts,now})

test('the annual case compares six source facts and retains derivation inputs',()=>{
  const result=compare()
  assert.equal(result.status,'comparable')
  assert.equal(result.period,'2025年度')
  assert.equal(result.currency,'CNY')
  assert.equal(result.canPublishDecision,false)
  const margin=result.rows.find(r=>r.metric==='parentProfitToRevenue')
  assert.ok(Math.abs(margin.values[0].value-48.75680659492655)<1e-9)
  assert.ok(Math.abs(margin.values[1].value-22.093724277736214)<1e-9)
  assert.deepEqual(margin.values[1].evidenceIds,['filing:000858:2025:netProfit','filing:000858:2025:revenue'])
  assert.match(margin.formula,/归母净利润.*营业收入/)
  assert.equal(result.contexts.length,2)
  assert.match(result.limitations.join(' '),/少数股东/)
})

test('missing, stale, demo, currency, period, unit and scope mismatches suppress derived comparison',()=>{
  const cases=[facts.filter(r=>r.id!=='filing:000858:2025:ocf'),
    ...[{currency:'USD'},{period:'2025前三季度'},{unit:'亿元'},{scope:'parent_only'},{verification:'demo'},{validUntil:'2026-01-01'}].map(change=>facts.map(r=>r.stockCode==='000858'&&r.metric==='ocf'?{...r,...change}:r))]
  for(const records of cases){
    const result=compare(records)
    assert.equal(result.status,'limited')
    assert.equal(result.canPublishDecision,false)
    assert.ok(result.rows.filter(r=>r.derived).every(r=>r.values.every(v=>v.value===null)))
  }
})

test('ambiguous or contradictory filings require review rather than silently choosing one',()=>{
  for(const additional of [facts[3],{...facts[3],id:'filing:alternative',value:123}]){
    const result=compare([...facts,additional])
    assert.equal(result.status,'review_required')
    assert.ok(result.rows.filter(r=>r.derived).every(r=>r.values.every(v=>v.value===null)))
  }
})

test('zero or negative denominator produces unavailable ratio and explicit reason',()=>{
  for(const value of [0,-1]){
    const result=compare(facts.map(r=>r.stockCode==='000858'&&r.metric==='netProfit'?{...r,value}:r))
    const ratio=result.rows.find(r=>r.metric==='ocfToParentProfit').values[1]
    assert.equal(ratio.value,null)
    assert.match(ratio.note,/分母/)
  }
})

test('exportable report shows raw facts, formulas, accounting notes and limits without investment winner',()=>{
  const report=engine.buildFinancialComparisonReport({comparison:compare(),runId:'case-D02',capturedAt:now,records:facts})
  assert.match(report,/40,528,509,770.23/)
  assert.match(report,/第7页/)
  assert.match(report,/收入确认/)
  assert.match(report,/财务子公司/)
  assert.match(report,/case-D02/)
  assert.doesNotMatch(report,/胜者|配置比例|BUY|SELL/)
})

test('context from another reporting period or source document is not attached as checked evidence',()=>{
  const result=engine.compareFinancialEvidence({records:facts,now,contexts:contexts.map((c,i)=>i===0?{...c,period:'2024年度'}:{...c,documentSha256:'wrong-document'})})
  assert.equal(result.contexts.length,0)
  assert.match(result.reasons.join(' '),/附注/)
})

test('two notes for one company cannot conceal missing context for the other',()=>{
  const result=engine.compareFinancialEvidence({records:facts,now,contexts:[contexts[0],{...contexts[0],id:'context:second-maotai'}]})
  assert.match(result.reasons.join(' '),/五粮液.*附注/)
})
