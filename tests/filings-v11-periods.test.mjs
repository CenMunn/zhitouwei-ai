import test from 'node:test';import assert from 'node:assert/strict';
import {reviewDraft} from '../src/lib/filings/core.ts';
import {reviewCalculation} from '../src/lib/filings/calculations.ts';
const sourceId='pdf:'+('f'.repeat(64))+':p1';
const f=(label,value,period)=>({sourceId,label,value,period,year:2025,scope:'consolidated',unit:'元'});
const draft=facts=>({refused:false,answer:'',limitations:[],facts,calculations:[]});
test('a question date never reassigns the period of an unasked verified annual operand',()=>{
 const src=[f('五、现金及现金等价物净增加额','20','2025'),f('期末现金及现金等价物余额','100','2025-12-31')];
 assert.ok(reviewDraft(draft(src),src,{question:'读取2025-12-31期末现金及现金等价物余额'}).checks.every(c=>c.ok));
 const bad=f('期末现金及现金等价物余额','100','2025');
 assert.equal(reviewDraft(draft([bad]),[src[1]],{question:'读取2025年6月30日期末现金及现金等价物余额'}).checks[0].ok,false);
});
test('a cash annual roll-forward accepts only matching opening balance plus signed net increase',()=>{
 const facts=[f('加：期初现金及现金等价物余额','80','2025-01-01'),f('五、现金及现金等价物净增加额','20','2025')];
 const sum={label:'期末现金',operation:'sum',operands:[0,1],value:'100',unit:'元'};
 assert.equal(reviewCalculation(sum,facts).ok,true);
 for(const changed of [[{...facts[0],period:'2025-12-31'},facts[1]],[facts[0],{...facts[1],label:'营业收入'}],[facts[0],{...facts[1],year:2024,period:'2024'}],[facts[0],{...facts[1],label:'现金及现金等价物净减少额'}]])assert.equal(reviewCalculation(sum,changed).ok,false);
 assert.equal(reviewCalculation({...sum,operation:'ratio',value:'400',unit:'%'},facts).ok,false);
});
