import test from 'node:test'
import assert from 'node:assert/strict'
const evalTools=await import('../scripts/source-experiment-utils.mjs').catch(()=>({}))
const gold={value:'246.80',unit:'元',currency:'CNY',period:'2024',page:6,source:'report.pdf'}
const sources=[{id:'pdf:test:p6',filename:'report.pdf',pdfPage:6,text:'2024年度 总资产 246.80 元'}]
const fact={value:'246.80',unit:'元',currency:'CNY',period:'2024',page:6,sourceId:'pdf:test:p6'}
test('missing answers count against predeclared objective checks',()=>{
  assert.equal(typeof evalTools.scoreFacts,'function')
  const s=evalTools.scoreFacts({facts:[]},gold,sources)
  assert.equal(s.correct,0);assert.equal(s.expected,1);assert.equal(s.covered,0)
})
test('equal numbers cannot hide wrong period, unit or cited document',()=>{
  assert.equal(typeof evalTools.scoreFacts,'function')
  for(const bad of [{period:'2025'},{unit:'亿元'},{sourceId:'made-up'}]){
    const s=evalTools.scoreFacts({facts:[{...fact,...bad}]},gold,sources)
    assert.equal(s.correct,0);assert.equal(s.covered,0)
  }
})
test('matching facts require a source occurrence; no semantic approval is invented',()=>{
  assert.equal(typeof evalTools.scoreFacts,'function')
  const s=evalTools.scoreFacts({facts:[fact]},gold,sources)
  assert.equal(s.correct,1);assert.equal(s.covered,1)
  assert.equal(s.semanticReview,'pending')
  const bad=evalTools.scoreFacts({facts:[fact]},gold,[{...sources[0],text:'unrelated'}])
  assert.equal(bad.covered,0)
})
test('sources are identical across treatments and never include gold answers',()=>{
  assert.equal(typeof evalTools.buildCommonUser,'function')
  const q={id:'P01',question:'核对总资产',gold:{value:'PRIVATE_SENTINEL'}}
  const body=evalTools.buildCommonUser(q,{asOf:'2026-10-02',pages:sources})
  assert.ok(!body.includes('PRIVATE_SENTINEL'))
  assert.ok(body.includes('pdf:test:p6'))
})
test('valid JSON with malformed fact entries gets zero credit without aborting scoring',()=>{
  const s=evalTools.scoreFacts({facts:[null,42,'246.80',{}]},gold,sources)
  assert.equal(s.correct,0);assert.equal(s.expected,1)
})
test('the frozen prompt digest authenticates the exact transmitted string',()=>{
  assert.equal(typeof evalTools.transmittedSystem,'function')
  assert.equal(evalTools.transmittedSystem('ROLE','ADAPTER'),'ROLE\n\nADAPTER')
})
