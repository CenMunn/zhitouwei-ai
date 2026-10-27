import test from 'node:test'
import assert from 'node:assert/strict'
import * as flow from '../src/lib/research/focused-flow.ts'

test('only explicit financial source tasks choose the focused path',()=>{
 assert.equal(flow.selectResearchPath('核对茅台2025年报经营现金流净额'),'focused_source')
 assert.equal(flow.selectResearchPath('计算五粮液财报收入同比'),'focused_source')
 assert.equal(flow.selectResearchPath('茅台值得买入吗'),'committee')
 assert.equal(flow.selectResearchPath('财报收入同比及股价目标价是多少'),'committee')
})
test('focused flow calls one source analyst and records others as not run',async()=>{
 let calls=0
 const output={summary:'原始财务数字',evidence:[],details:{},score:null,vote:null,confidence:null,highlights:[],concerns:[]}
 const packet={question:'核对年报收入'}
 const x=await flow.executeFocusedSource(packet,async p=>{assert.equal(p,packet);calls++;return {output,raw:output,error:null,durationMs:12}})
 assert.equal(calls,1);assert.equal(x.analysis.output,output)
 assert.deepEqual(x.skippedRoles,['industry','macro','sentiment','debating','risk_review','voting','decision'])
})
