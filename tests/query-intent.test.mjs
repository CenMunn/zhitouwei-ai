import test from 'node:test'
import assert from 'node:assert/strict'
import * as intent from '../src/lib/research/query-intent.ts'
const terms=[{term:'抄底',meaning:'价格较低时买入的市场俗称，不保证已到最低点'}]
test('jargon explanation returns a direct local answer without starting research',()=>{
 const x=intent.classifyQuery('抄底是什么意思？',{terms,targets:[]})
 assert.equal(x.kind,'explanation');assert.match(x.answer,/最低点/);assert.equal(x.researchAllowed,false)
})
test('unspecified trading questions request entity and horizon instead of guessing a stock',()=>{
 const x=intent.classifyQuery('现在能抄底吗？',{terms,targets:[]})
 assert.equal(x.kind,'clarification');assert.match(x.answer,/标的|股票/)
})
test('a named company with slang continues research and preserves user wording',()=>{
 const q='贵州茅台现在能抄底吗？';const x=intent.classifyQuery(q,{terms,targets:[{code:'600519',name:'贵州茅台'}]})
 assert.equal(x.kind,'research');assert.equal(x.query,q);assert.equal(x.terms.length,1)
})
test('explicit meaning request wins over a stock nickname in the same utterance',()=>{
 const x=intent.classifyQuery('宁王这个黑话是什么意思？',{terms:[{term:'宁王',meaning:'宁德时代的市场俗称'}],targets:[{code:'300750',name:'宁德时代'}]})
 assert.equal(x.kind,'explanation');assert.match(x.answer,/宁德时代/)
})
test('unknown slang receives an honest clarification instead of an invented definition',()=>{
 const x=intent.classifyQuery('什么是飞龙神票？',{terms:[],targets:[]})
 assert.equal(x.kind,'clarification');assert.match(x.answer,/上下文|未收录/)
})
test('a cluster nickname requires selecting companies unless the request explains the term',()=>{
 const x=intent.classifyQuery('易中天可以买么？',{terms:[],targets:[{code:'1',name:'公司甲'},{code:'2',name:'公司乙'},{code:'3',name:'公司丙'}],ambiguous:true})
 assert.equal(x.kind,'clarification');assert.match(x.answer,/公司甲/)
})
test('generic financial concepts explain boundaries without fabricated current market facts',()=>{
 const x=intent.classifyQuery('市盈率越低是不是一定越好？',{terms:[],targets:[]})
 assert.equal(x.kind,'explanation');assert.match(x.answer,/亏损|增长|风险/);assert.doesNotMatch(x.answer,/现在.*\d+倍/)
})
test('short stock-only input is a valid research request',()=>{
 assert.equal(intent.classifyQuery('600519',{terms:[],targets:[{code:'600519',name:'贵州茅台'}]}).kind,'research')
})
test('invalid input never starts research',()=>{
 for(const q of ['',null,{},'x'.repeat(201)]) assert.throws(()=>intent.classifyQuery(q,{terms:[],targets:[]}))
})
