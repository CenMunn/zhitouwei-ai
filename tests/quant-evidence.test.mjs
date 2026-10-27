import test from 'node:test'
import assert from 'node:assert/strict'

const market = await import('../src/lib/research-evidence/market.ts')

const now = '2026-10-01T00:00:00.000Z'
const quote = {
  symbol: 'sh600519', code: '600519', name: '贵州茅台', price: 1290.88,
  change: 1.2, changePct: 0.09, open: 1288, prevClose: 1289.72, high: 1295,
  low: 1280, volume: 12345, amount: 456789, turnoverRate: 0.2, peTtm: 21,
  pb: 8, high52w: 1800, low52w: 1200, marketCap: 16000, floatCap: 16000,
  currency: 'CNY', time: '2026-09-30 15:00:00', isIndex: false, source: 'tencent',
}

function kline(count = 80) {
  return Array.from({ length: count }, (_, i) => {
    const day = new Date(Date.UTC(2026, 6, 13 + i)).toISOString().slice(0, 10)
    const close = 1200 + i
    return { date: day, open: close - 2, high: close + 5, low: close - 5, close, volume: 1000 + i }
  })
}

test('source-backed market snapshot produces traceable records and readiness', () => {
  const result = market.assessQuantitativeReadiness({ stockCode: '600519', quote, kline: kline(), capturedAt: now })
  assert.equal(result.ready, true)
  assert.deepEqual(result.reasons, [])
  assert.ok(result.records.some((r) => r.id === 'quote:600519:price' && r.verification === 'source_checked'))
  assert.ok(result.records.some((r) => r.metric === 'kline_sample_count' && r.value === 80))
  assert.ok(result.records.every((r) => /^https:\/\//.test(r.sourceUrl)))
})

test('missing, stale, short, or duplicated market inputs fail closed', () => {
  const cases = [
    { quote: null, kline: kline(), want: /行情快照缺失/ },
    { quote: { ...quote, time: '2026-09-01 15:00:00' }, kline: kline(), want: /行情时间过期/ },
    { quote, kline: kline(20), want: /日线样本不足/ },
    { quote, kline: [...kline(), kline()[79]], want: /日期重复/ },
  ]
  for (const item of cases) {
    const result = market.assessQuantitativeReadiness({ stockCode: '600519', quote: item.quote, kline: item.kline, capturedAt: now })
    assert.equal(result.ready, false)
    assert.match(result.reasons.join('；'), item.want)
  }
})

test('only indicators calculated exclusively from registered daily bars become checked evidence', () => {
  const metrics = { momentum: 63, valuation: 58, rsi14: 52, ma20: 1250, ma60: 1230, ma120: 1200 }
  const records = market.buildQuantMetricEvidence({ stockCode: '600519', quote, kline: kline(), metrics, capturedAt: now })
  assert.equal(records.length, 3)
  assert.equal(records.some(r=>r.metric==='momentum'||r.metric==='ma120'),false,'short history must not certify snapshot-backed momentum or an unavailable long MA')
  assert.equal(records.some((r) => r.metric === 'valuation'), false)
  assert.ok(records.every((r) => r.kind === 'calculation' && r.verification === 'source_checked'))
  assert.ok(records.every((r) => r.sourceUrl.includes('gtimg.cn')))
  assert.ok(records.every((r) => /输入日线样本=80/.test(r.locator)))
})

test('momentum requires all six-month return inputs instead of snapshot fallbacks',()=>{
 const metrics={momentum:63,rsi14:52,ma20:1250,ma60:1230,ma120:1200}
 const make=n=>market.buildQuantMetricEvidence({stockCode:'600519',quote,kline:kline(n),metrics,capturedAt:now})
 assert.equal(make(126).some(r=>r.metric==='momentum'),false)
 assert.equal(make(127).some(r=>r.metric==='momentum'),true)
})
