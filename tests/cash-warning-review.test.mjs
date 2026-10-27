import test from 'node:test'
import assert from 'node:assert/strict'
import { reviewCashWarnings, CASH_QUALITY_ISSUE } from '../src/lib/research/investment-score.ts'

const texts=['规模优势成立，但不延伸为回款质量或现金转化更优。']
const answer=(passages,classification='negation_or_warning')=>({assessments:passages.map((quotedText,index)=>({index,quotedText,classification,reason:'该句是在否定推断'}))})
test('explicit AI review can confirm a warning and retains its exact quotation and call',async()=>{
 const r=await reviewCashWarnings(texts,[CASH_QUALITY_ISSUE],async(_s,u)=>({value:answer(JSON.parse(u).passages),calls:[{status:'ok',responseModel:'deepseek-flash'}]}))
 assert.equal(r.accepted,true);assert.equal(r.assessment.assessments[0].quotedText,texts[0]);assert.equal(r.calls.length,1)
})
test('hard source and arithmetic errors are never sent for override',async()=>{
 let calls=0
 const r=await reviewCashWarnings(texts,[CASH_QUALITY_ISSUE,'年度比较方向不符'],async()=>{calls++;return {value:{},calls:[]}})
 assert.equal(calls,0);assert.equal(r.accepted,false)
})
test('affirmative, uncertain, incomplete, duplicate and invented quotations fail closed',async()=>{
 for(const value of [answer(texts,'affirmative_claim'),answer(texts,'uncertain'),{assessments:[]},{assessments:[{index:0,quotedText:'另一句话',classification:'negation_or_warning',reason:'否定'}]},{assessments:[...answer(texts).assessments,...answer(texts).assessments]}]){
  const r=await reviewCashWarnings(texts,[CASH_QUALITY_ISSUE],async()=>({value,calls:[]}));assert.equal(r.accepted,false)
 }
})
test('every matched passage needs its own review, not one blanket approval',async()=>{
 const multiple=[...texts,'乙公司现金转化更优。']
 const r=await reviewCashWarnings(multiple,[CASH_QUALITY_ISSUE],async()=>({value:answer(texts),calls:[]}))
 assert.equal(r.accepted,false)
})
test('review API failure remains unresolved and retains failed call usage',async()=>{
 const e=Object.assign(new Error('TIMEOUT'),{llmCalls:[{status:'failed',usage:{input_tokens:12}}]})
 const r=await reviewCashWarnings(texts,[CASH_QUALITY_ISSUE],async()=>{throw e})
 assert.equal(r.accepted,false);assert.equal(r.calls[0].usage.input_tokens,12)
})
