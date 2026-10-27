import test from 'node:test'
import assert from 'node:assert/strict'
import { investmentScore, combineInvestmentScores, cashInterpretationIssues } from '../src/lib/research/investment-score.ts'

test('missing direction is an explicit baseline, never a neutral market finding',()=>{
 const s=investmentScore({score:95,confidence:90,hasDirection:false,reason:'无新闻'})
 assert.equal(s.score,50);assert.equal(s.confidence,0);assert.equal(s.basis,'baseline')
 assert.match(s.reason,/基准/)
 assert.equal(investmentScore({score:50,confidence:0,hasDirection:true,reason:'信息不足'}).basis,'baseline')
})
test('estimated investment views retain their score with capped confidence',()=>{
 const s=investmentScore({score:72,confidence:95,hasDirection:true,direct:false,reason:'按现有财报作条件判断'})
 assert.equal(s.score,72);assert.equal(s.confidence,40);assert.equal(s.basis,'ai_estimate')
})
test('failed or invalid model output cannot acquire a successful AI rating',()=>{
 for(const score of [null,NaN,Infinity])assert.equal(investmentScore({score,hasDirection:true}).basis,'baseline')
 assert.equal(investmentScore({score:85,hasDirection:true,failed:true}).score,50)
})
test('composite excludes baselines and reduces estimates instead of counting missing data as bearish',()=>{
 const result=combineInvestmentScores([
  {key:'fundamental',score:80,confidence:70,basis:'source_based'},
  {key:'industry',score:40,confidence:30,basis:'ai_estimate'},
  {key:'macro',score:50,confidence:0,basis:'baseline'},
 ])
 assert.equal(result.score,72);assert.equal(result.components.find(s=>s.key==='macro').effectiveWeight,0)
 assert.ok(result.components.find(s=>s.key==='industry').effectiveWeight<result.components.find(s=>s.key==='fundamental').effectiveWeight)
 assert.equal(combineInvestmentScores([{key:'macro',score:50,confidence:0,basis:'baseline'}]).basis,'baseline')
})

test('cash interpretation review understands denial, warnings and a new affirmative claim after a contrast',()=>{
 for(const text of ['把绝对额领先当成现金转化更优，容易误判。','我只把它当规模比较，不当回款质量更优。','现金转化并不更好。','现金转化更好这个判断不成立。'])assert.deepEqual(cashInterpretationIssues([text]),[],text)
 assert.ok(cashInterpretationIssues(['不能说甲现金转化更好，但乙回款质量更强。']).length)
 assert.ok(cashInterpretationIssues(['乙公司现金转化更好。']).length)
})
test('net operating cash is not gross receipts, and attributable profit stays explicit',()=>{
 assert.ok(cashInterpretationIssues(['五粮液经营现金流高于归母净利润，我只把它当回款规模可观。']).length)
 assert.deepEqual(cashInterpretationIssues(['经营现金流净额不等于回款总额。']),[])
 assert.ok(cashInterpretationIssues(['经营现金流对净利润覆盖约三倍，明显优于对手。'],true).length)
 assert.deepEqual(cashInterpretationIssues(['经营现金流高于归母净利润，仅作金额比较。'],true),[])
})

test('positive cash-quality adjectives remain assertions despite a later caveat',()=>{
 for(const adjective of ['强劲','稳健','良好','优秀','尚可']){
  assert.ok(cashInterpretationIssues([`现金转化表面${adjective}，但资料不全。`]).length,adjective)
  assert.deepEqual(cashInterpretationIssues([`不能据此认为现金转化${adjective}。`]),[])
  assert.deepEqual(cashInterpretationIssues([`把金额比率当作现金转化${adjective}的证据会误判。`]),[])
 }
 assert.deepEqual(cashInterpretationIssues(['若现金转化改善，可再观察现金收支明细。']),[])
})
