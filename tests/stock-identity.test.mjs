import test from 'node:test'
import assert from 'node:assert/strict'

const matching=await import('../src/lib/data/stock-mention.ts').catch(()=>({}))
test('A-share codes cannot also match a shorter Hong Kong code',()=>{
  assert.equal(typeof matching.stockMentionPosition,'function')
  const q='比较贵州茅台600519与五粮液000858'
  assert.equal(matching.stockMentionPosition(q,'00519'),-1)
  assert.equal(matching.stockMentionPosition(q,'600519'),6)
  assert.equal(matching.stockMentionPosition(q,'000858'),16)
})
test('standalone Hong Kong codes and known market prefixes remain usable',()=>{
  assert.equal(typeof matching.stockMentionPosition,'function')
  assert.equal(matching.stockMentionPosition('研究hk00519与00700.HK','00519'),4)
  assert.equal(matching.stockMentionPosition('研究hk00519与00700.HK','00700'),10)
  assert.equal(matching.stockMentionPosition('sh600519','600519'),2)
})
test('short US tickers cannot match words or other tickers',()=>{
  assert.equal(typeof matching.stockMentionPosition,'function')
  assert.equal(matching.stockMentionPosition('financial analysis of META','LI'),-1)
  assert.equal(matching.stockMentionPosition('analysis of NVDA','V'),-1)
  assert.equal(matching.stockMentionPosition('比较LI与META','LI'),2)
  assert.equal(matching.stockMentionPosition('研究usAAPL','AAPL'),4)
})
test('Chinese names and aliases preserve their position in the question',()=>{
  assert.equal(typeof matching.stockMentionPosition,'function')
  assert.equal(matching.stockMentionPosition('比较贵州茅台与五粮液','贵州茅台'),2)
  assert.equal(matching.stockMentionPosition('比较贵州茅台与五粮液','五粮液'),7)
})
