import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import Module,{createRequire} from 'node:module'
import * as intent from '../src/lib/research/query-intent.ts'
const require=createRequire(import.meta.url),m=new Module('resolver-review-test')
let universeCalls=0
m.require=id=>id==='@/lib/data/slang-dictionary'?{matchSlang:()=>[]}:id==='@/lib/data/stocks'?{STOCKS:[{name:'开发公司甲',code:'900001',alias:['开发甲']}]}
 :id==='@/lib/data/global-stocks'?{GLOBAL_STOCKS:[]}:id==='@/lib/data/hot-terms'?{matchHotTerms:()=>[]}:id==='@/lib/data/stock-mention'?{stockMentionPosition:(q,k)=>q.indexOf(k)}
 :id==='@/lib/data/universe'?{matchUniverseStocks:async q=>{universeCalls++;return q.includes('900002')?[{stock:{code:'900002',name:'数据库开发公司'}}]:[]}}:id==='./query-intent'?intent:require(id)
m._compile(ts.transpileModule(fs.readFileSync(new URL('../src/lib/research/resolve-query.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,'resolver-review-test.cjs')
test('specific-company why/how questions preserve the target and remain research',async()=>{
 for(const q of ['为什么开发公司甲2025年经营现金流与利润不同？','如何分析开发甲2025年ROE变化？']){
  const r=await m.exports.resolveQuery(q);assert.equal(r.kind,'research');assert.equal(r.targets[0].code,'900001')
 }
})
test('pure definitions retain a no-model explanation route',async()=>{
 assert.equal((await m.exports.resolveQuery('市盈率越低是不是越好')).kind,'explanation')
 assert.equal((await m.exports.resolveQuery('什么是市盈率')).kind,'explanation')
})

test('database-only company mentions resolve before generic financial explanations',async()=>{
 universeCalls=0
 const r=await m.exports.resolveQuery('为什么900002的ROE变化？')
 assert.equal(r.kind,'research');assert.equal(r.targets[0].code,'900002');assert.equal(universeCalls,1)
})
