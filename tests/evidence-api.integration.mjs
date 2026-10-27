import test from 'node:test'
import assert from 'node:assert/strict'
const base=process.env.TEST_BASE_URL ?? 'http://127.0.0.1:3141'
const httpFetch=globalThis.fetch
const registration=await httpFetch(base+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({username:'evidence_'+Date.now().toString(36),password:'EvidenceTest12345'})})
assert.equal(registration.status,201,await registration.clone().text())
const cookie=registration.headers.get('set-cookie').split(';')[0]
const fetch=(url,options={})=>httpFetch(url,{...options,headers:{...options.headers,Cookie:cookie,...(options.method&&options.method!=='GET'?{Origin:base}:{})}})
const post=code=>fetch(`${base}/api/evidence-check`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({stockCode:code})})

test('registered-source check persists real audit, without pretending to run agents',async()=>{
  const res=await post('600519');assert.equal(res.status,200)
  const body=await res.json()
  assert.equal(body.audit.records.length,3)
  assert.equal(body.audit.modelEvaluation,'not_run')
  assert.equal(body.audit.decisionGate.canPublishDecision,false)
  assert.match(body.audit.reportMd,/第6页/)
  const detail=await (await fetch(`${base}/api/research/${body.sessionId}`)).json()
  assert.equal(detail.decision,null)
  assert.equal(detail.agents.length,0)
  assert.equal(detail.session.meta.audit.runId,body.sessionId)
})

test('uncovered core stock returns missing-data report, not fabricated facts',async()=>{
  const res=await post('000568');assert.equal(res.status,200)
  const body=await res.json()
  assert.equal(body.audit.records.length,0)
  assert.equal(body.audit.decisionGate.status,'limited')
  assert.match(body.audit.reportMd,/缺少同标的/)
  assert.doesNotMatch(body.audit.reportMd,/HOLD|BUY|SELL/)
})

test('Wuliangye annual facts are registered with page, hash and CNY scope',async()=>{
  const res=await post('000858');assert.equal(res.status,200)
  const {audit}=await res.json()
  assert.equal(audit.records.length,3)
  assert.equal(audit.records.find(r=>r.metric==='revenue').value,40528509770.23)
  assert.ok(audit.records.every(r=>r.page===7 && r.currency==='CNY' && r.period==='2025年度' && /^[a-f0-9]{64}$/.test(r.documentSha256)))
})

test('D02 generates a persistent deterministic comparison with downloadable evidence',async()=>{
  const res=await fetch(`${base}/api/evidence-comparison`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({caseId:'D02'})})
  assert.equal(res.status,200)
  const {audit,sessionId}=await res.json()
  assert.equal(audit.financialComparison.status,'comparable')
  assert.equal(audit.records.length,6)
  assert.equal(audit.modelEvaluation,'not_run')
  assert.equal(audit.decisionGate.canPublishDecision,false)
  const detail=await (await fetch(`${base}/api/research/${sessionId}`)).json()
  assert.equal(detail.session.intent,'comparison')
  assert.equal(detail.session.meta.audit.financialComparison.caseId,'D02')
  assert.equal(detail.decision,null)
  assert.equal(detail.agents.length,0)
  const listed=await (await fetch(`${base}/api/sessions?limit=12`)).json()
  assert.equal(listed.sessions.find(s=>s.id===sessionId).intent,'comparison')
  const json=await fetch(`${base}/api/evidence-export?runId=${sessionId}&format=json`)
  assert.equal(json.status,200)
  assert.match(json.headers.get('content-disposition'),/attachment/)
  assert.equal((await json.json()).runId,sessionId)
  const md=await fetch(`${base}/api/evidence-export?runId=${sessionId}&format=md`)
  assert.equal(md.status,200)
  assert.match(await md.text(),/收入确认/)
})

test('comparison and export reject invalid requests',async()=>{
  const res=await fetch(`${base}/api/evidence-comparison`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{"caseId":"not-valid"}'})
  assert.equal(res.status,400)
  assert.equal((await fetch(`${base}/api/evidence-export?runId=invalid&format=exe`)).status,400)
  assert.equal((await fetch(`${base}/api/evidence-export?runId=ev_missing&format=json`)).status,404)
})

test('unknown stock and malformed request rejected',async()=>{
  assert.equal((await post('invalid')).status,400)
  const res=await fetch(`${base}/api/evidence-check`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{broken'})
  assert.equal(res.status,400)
})
