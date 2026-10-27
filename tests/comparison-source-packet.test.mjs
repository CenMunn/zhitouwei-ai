import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import Module,{createRequire} from 'node:module'
const file=new URL('../src/lib/research-evidence/catalog.ts',import.meta.url)
const mod=new Module(file.pathname)
mod.require=createRequire(file)
mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,'catalog.cjs')
const input={stockCode:'600519',stock:null,news:[],financialClues:[],quote:null,capturedAt:'2026-10-02T14:00:00Z'}
test('comparison agents receive both requested companies, without extra companies or duplicate IDs',()=>{
  const r=mod.exports.collectEvidence({...input,peerStockCodes:['000858','600519','000858']})
  assert.equal(r.filter(x=>x.kind==='filing').length,6)
  assert.equal(new Set(r.map(x=>x.id)).size,r.length)
  assert.deepEqual([...new Set(r.map(x=>x.stockCode))].sort(),['000858','600519'])
})
test('single-company collection keeps its original coverage',()=>{
  const r=mod.exports.collectEvidence(input)
  assert.equal(r.length,3);assert.ok(r.every(x=>x.stockCode==='600519'))
})
test('accounting notes are included for requested companies only and never synthesized',()=>{
  assert.equal(typeof mod.exports.collectFilingContexts,'function')
  const notes=mod.exports.collectFilingContexts(['600519','000858','300750'],input.capturedAt)
  assert.equal(notes.length,2)
  assert.ok(notes.every(n=>n.documentSha256&&n.page&&n.sourceUrl))
  assert.equal(mod.exports.collectFilingContexts(['300750'],input.capturedAt).length,0)
})
