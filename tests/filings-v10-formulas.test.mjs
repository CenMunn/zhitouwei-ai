import test from 'node:test';import assert from 'node:assert/strict';
import {reviewDraft,parseDraft,buildAdoptedReport} from '../src/lib/filings/core.ts';
import {buildFilingRequest} from '../src/lib/filings/model.ts';
const sourceId=`pdf:${'c'.repeat(64)}:p1`;
const f=(label,value,over={})=>({sourceId,page:1,label,value,unit:'元',year:2025,period:'2025',scope:'consolidated',...over});
function run(fs,op,ix,value,q,unit='%'){
 const d={answer:'',facts:fs,calculations:[{label:'不可采用标签',operation:op,operands:ix,value,unit}],limitations:[],refused:false};
 const r=reviewDraft(d,fs,{question:q});return {d,r,a:buildAdoptedReport(d,r,q,null,{sourceFacts:fs})};
}
test('difference ratios use three original facts and reject wrong order, period, unit and result',()=>{
 const fs=[f('营业收入','100'),f('营业成本','70')];
 const q='计算2025年合并毛利率=(营业收入-营业成本)÷营业收入×100%，保留2位小数';
 const {d,r,a}=run(fs,'difference_ratio',[0,1,0],'30',q);
 assert.equal(parseDraft(JSON.stringify({...d,facts:d.facts.map(({page,...f})=>f)})).calculations[0].operation,'difference_ratio');assert.equal(r.checks.at(-1).ok,true);assert.deepEqual(a.coverage.missing,[]);assert.match(a.calculations[0].label,/−.*\//);
 for(const [operands,value] of [[[1,0,0],'-30'],[[0,1,1],'42.86']])assert.ok(run(fs,'difference_ratio',operands,value,q).a.coverage.missing.length);
 for(const change of [{period:'2025-12-31'},{scope:'parent'},{unit:'万元'}])assert.equal(run([fs[0],{...fs[1],...change}],'difference_ratio',[0,1,0],'30',q).r.checks.at(-1).ok,false);
 assert.equal(run(fs,'difference_ratio',[0,1,0],'30.01',q).r.checks.at(-1).ok,false);
 const quick=[f('流动资产合计','120',{period:'2025-12-31'}),f('存货','30',{period:'2025-12-31'}),f('流动负债合计','60',{period:'2025-12-31'})];
 assert.deepEqual(run(quick,'difference_ratio',[0,1,2],'1.5','计算2025年末合并速动比率=(流动资产合计-存货)÷流动负债合计，保留2位小数，以倍数表示','倍').a.coverage.missing,[]);
});
test('absolute numerator and annual average denominator have explicit bounded contracts',()=>{
 const fs=[f('利息支出','-30'),f('利息收入','100')];
 const q='计算2025年合并利息支出绝对值占利息收入的比例，保留2位小数';
 assert.equal(run(fs,'absolute_ratio',[0,1],'30',q).r.checks.at(-1).ok,true);assert.deepEqual(run(fs,'absolute_ratio',[0,1],'30',q).a.coverage.missing,[]);
 assert.equal(run(fs,'absolute_ratio',[0,1],'-30',q).r.checks.at(-1).ok,false);
 const avg=[f('净利润','20'),f('资产总计','100',{year:2024,period:'2024-12-31'}),f('资产总计','150',{period:'2025-12-31'})];
 const aq='计算2025年度合并简化资产收益率=净利润÷[(2024年末资产总计+2025年末资产总计)/2]×100%，保留2位小数';
 assert.equal(run(avg,'average_denominator_ratio',[0,1,2],'16',aq).r.checks.at(-1).ok,true);assert.deepEqual(run(avg,'average_denominator_ratio',[0,1,2],'16',aq).a.coverage.missing,[]);
 for(const change of [{period:'2024-06-30'},{label:'负债合计'},{year:2023,period:'2023-12-31'}])assert.equal(run([avg[0],{...avg[1],...change},avg[2]],'average_denominator_ratio',[0,1,2],'16',aq).r.checks.at(-1).ok,false);
 assert.equal(run(avg,'average_denominator_ratio',[0,2,1],'16',aq).r.checks.at(-1).ok,false);
});
test('R&D expense ratio coverage requires its ordered numerator and revenue denominator',()=>{
 const fs=[f('研发费用','10'),f('营业收入','100')],q='计算2025年度合并研发费用率=研发费用÷营业收入×100%，保留2位小数';
 assert.deepEqual(run(fs,'ratio',[0,1],'10',q).a.coverage.missing,[]);
 assert.ok(run(fs,'ratio',[1,0],'1000',q).a.coverage.missing.length);
});
test('compound operations are available equally and cannot refer to calculation outputs',()=>{
 for(const mode of ['single_model','current_evidence']){
  const request=buildFilingRequest('开发公式题',[],sourceId.slice(4,-3),mode);
  for(const op of ['difference_ratio','average_denominator_ratio','absolute_ratio'])assert.ok(request.messages[0].content.includes(op));
  assert.match(request.messages[0].content,/不得引用.*calculations/);
 }
 assert.equal(run([f('营业收入','100'),f('营业成本','70')],'difference_ratio',[0,1,2],'30','保留2位小数').r.checks.at(-1).ok,false);
});
test('asking a named ratio requires the calculation even without the verb calculate',()=>{
 const fs=[f('营业收入','100')],d={answer:'',facts:fs,calculations:[],limitations:[],refused:false};
 for(const name of ['毛利率','研发费用率','速动比率','简化资产收益率']){
  const q=`读取2025年合并营业收入和${name}`;
  assert.ok(buildAdoptedReport(d,reviewDraft(d,fs,{question:q}),q).coverage.missing.length,name);
 }
});
