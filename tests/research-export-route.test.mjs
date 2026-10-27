import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import Module from 'node:module'
const code=ts.transpileModule(fs.readFileSync(new URL('../src/app/api/evidence-export/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
let found=true,queries=[]
const mod=new Module('export-route-test');mod.require=id=>{
 if(id==='next/server')return {NextResponse:{json:(body,init)=>Response.json(body,init)}}
 if(id==='@/lib/auth/server')return {requireUser:async()=>({id:'owner'}),ownerFilter:()=>({ownerId:'owner'}),authErrorResponse:()=>null}
 if(id==='@/lib/db')return {db:{researchSession:{findFirst:async q=>{queries.push(q);return found?{meta:JSON.stringify({audit:{version:'evidence-v1',runId:q.where.id,reportMd:'# Saved report'}})}:null}}}}
 throw new Error(id)
};mod._compile(code,'export-route-test.cjs')
const get=(id,format='md')=>mod.exports.GET({nextUrl:new URL('http://localhost/api/evidence-export?runId='+encodeURIComponent(id)+'&format='+format)})
test('current research CUID and legacy audit ID both export the saved snapshot',async()=>{
 for(const id of ['cmvcpmsye0002ujd8702sgw77','ev_previous_run']){const r=await get(id);assert.equal(r.status,200);assert.equal(await r.text(),'# Saved report')}
 assert.ok(queries.every(q=>q.where.ownerId==='owner'))
})
test('invalid names stay rejected and ownership-filtered missing reports stay hidden',async()=>{
 assert.equal((await get('../secrets')).status,400)
 assert.equal((await get('cmvcpmsye0002ujd8702sgw77','exe')).status,400)
 found=false;assert.equal((await get('cmvcpmsye0002ujd8702sgw77')).status,404);found=true
})
