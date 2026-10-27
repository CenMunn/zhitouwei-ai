import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

test('forecast refuses raw day data and never falls back to Yahoo',async()=>{
 const file='../src/lib/forecast/source.ts'
 const source=await import(file).catch(()=>({}))
 assert.equal(typeof source.fetchForecastQfqBars,'function')
 const calls=[]
 await assert.rejects(()=>source.fetchForecastQfqBars('000333',500,async url=>{
  calls.push(String(url));return new Response(JSON.stringify({code:0,data:{sz000333:{day:[['2026-09-30','70','71','72','69','100']]}}}))
 }),/前复权/)
 assert.equal(calls.length,2);assert.ok(calls.every(url=>!url.includes('yahoo')))
})
test('forecast accepts only explicitly labelled qfq data from Tencent mirror',async()=>{
 const source=await import('../src/lib/forecast/source.ts').catch(()=>({}))
 assert.equal(typeof source.fetchForecastQfqBars,'function')
 let calls=0
 const bars=await source.fetchForecastQfqBars('000333',500,async()=>{
  calls++;return calls===1?new Response('<html>blocked</html>'):new Response(JSON.stringify({code:0,data:{sz000333:{qfqday:[['2026-09-30','70','71','72','69','100']]}}}))
 })
 assert.equal(calls,2);assert.equal(bars[0].close,71)
})
test('focused report retains formula, nested calculations and material gaps without internal review leakage',async()=>{
 const mod=await import('../src/lib/research/focused-report.ts').catch(()=>({}))
 assert.equal(typeof mod.focusedReportObservation,'function')
 const text=mod.focusedReportObservation({summary:'净利率约48.76%。',details:{formula:'82320067101.68 / 168838102514.79 * 100 = 48.76%',calculations:{unit:'%',result:48.76},semanticReview:{originalOutput:'internal'}},highlights:['合并归母口径'],concerns:['缺少分部披露']})
 assert.match(text,/82320067101.68/);assert.match(text,/calculations/);assert.match(text,/缺少分部披露/);assert.match(text,/推算.*待人工复核/s);assert.doesNotMatch(text,/internal/)
 const {buildReviewReport}=await import('../src/lib/research-evidence/engine.ts')
 const report=buildReviewReport({runId:'synthetic-regression',stockName:'测试',query:'列出公式',records:[],claims:[],gate:{status:'limited',checkedAt:'2026-10-03T00:00:00Z',canPublishDecision:false,reasons:[]},analyses:[{name:'精简核验',summary:text}]})
 assert.match(report,/82320067101.68 \/ 168838102514.79 \* 100 = 48.76%/);assert.match(report,/缺少分部披露/)
 const runner=await fs.readFile(new URL('../src/lib/pipeline/runner.ts',import.meta.url),'utf8')
 assert.match(runner,/summary:focusedReportObservation\(result.output\)/)
})
