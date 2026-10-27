// Synthetic regressions: failures captured against the V12 product baseline.
// Synthetic fixtures only. No model/API calls. No financial semantic score.
import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewDraft,buildAdoptedReport} from '../src/lib/filings/core.ts';
import {stripNote,metricLabel} from '../src/lib/filings/labels.ts';
const source=(label='货币资金',patch={})=>({sourceId:'pdf:synthetic:p1',page:1,label,year:2025,period:'2025-12-31',scope:'consolidated',unit:'千元',value:'10',currency:'人民币',...patch});
const candidate=({page,currency,annualFlow,periodAliases,...f})=>f;
const draft=(facts,calculations=[])=>({refused:false,answer:'UNVERIFIED FREE TEXT MUST NEVER BE ADOPTED',facts:facts.map(candidate),calculations,limitations:['UNVERIFIED LIMITATION MUST NEVER BE ADOPTED']});
const render=(q,sources,d=draft(sources),blocks=[])=>buildAdoptedReport(d,reviewDraft(d,sources,{question:q}),q,'synthetic',{sourceFacts:sources,statementBlocks:blocks});
const footer='每项必要事实与每个计算操作数须同时给出上传PDF物理页和原报告物理页。计算仅用题定公式，操作数不得提前舍入，最终保留两位。';
const factQuestion='读取“货币资金”的披露金额。本题主体：合并；期间/时点：2025-12-31。';

test('共同合同中的计算操作数说明不能将直接取数题变成计算任务',()=>{
 const s=[source()],a=render(factQuestion,s),b=render(factQuestion+footer,s);
 assert.deepEqual(b.coverage.missing,a.coverage.missing);
 assert.equal(b.calculations.length,0);
 assert.equal(b.answerLines.some(v=>v.includes('UNVERIFIED')),false);
});
test('其他来源行不能从“不借用其他题目”生成伪指标',()=>{
 const s=[source(),source('其他')],d=draft([s[0]]);
 const r=render(factQuestion+'不联网，不借用其他题目或输入。',s,d);
 assert.equal(r.coverage.missing.some(v=>v.includes('其他')),false);
 assert.equal(r.answerLines.some(v=>v.includes('合并其他')),false);
});
test('真实计算要求缺计算时仍须指出缺口，不能一律屏蔽计算词',()=>{
 const sources=[source('资产总计'),source('资产总计',{year:2024,period:'2024-12-31',value:'8'})];
 const q='计算资产总计同比增长率，唯一公式为2025年资产总计/2024年资产总计-1；本题主体合并；2025-12-31对比2024-12-31。';
 const r=render(q+footer,sources);
 assert.equal(r.calculations.length,0);
 assert.ok(r.coverage.missing.some(v=>/growth|增长|同比/.test(v)),JSON.stringify(r.coverage));
});
test('真实增长计算交付完整时协议说明不应制造额外计算缺口',()=>{
 const sources=[source('资产总计'),source('资产总计',{year:2024,period:'2024-12-31',value:'8'})];
 const q='计算资产总计同比增长率，唯一公式为2025年资产总计/2024年资产总计-1；本题主体合并；2025-12-31对比2024-12-31。';
 const d=draft(sources,[{label:'growth',operation:'growth',operands:[0,1],value:'25.00',unit:'%'}]);
 const a=render(q,sources,d),b=render(q+footer,sources,d);
 assert.equal(b.calculations.length,1);
 assert.deepEqual(b.coverage.missing,a.coverage.missing);
});
test('纯声明“公司”括注与parent一致时允许规范化',()=>{
 const sources=[source('货币资金',{scope:'parent'})],d=draft(sources);
 d.facts[0].label='货币资金（公司）';
 assert.equal(reviewDraft(d,sources,{question:'读取母公司货币资金。'}).checks[0].ok,true);
});
test('公司括注和consolidated冲突仍须拒绝',()=>{
 const sources=[source()],d=draft(sources);d.facts[0].label='货币资金（公司）';
 const c=reviewDraft(d,sources,{question:factQuestion}).checks[0];
 assert.equal(c.ok,false);assert.equal(c.code,'ANNOTATION_CONFLICT');
});
test('59(a)为财报附注索引，应从已定位行标签清除',()=>{
 assert.equal(stripNote('经营活动产生的现金流量净额 59(a)'),'经营活动产生的现金流量净额');
});
test('尾注处理不能删除实质括注或指标词',()=>{
 assert.equal(stripNote('现金及现金等价物（受限）'),'现金及现金等价物（受限）');
 assert.notEqual(metricLabel('营业总收入'),metricLabel('营业收入'));
 const sources=[source('营业总收入')],d=draft(sources);d.facts[0].label='营业收入';
 assert.equal(reviewDraft(d,sources).checks[0].ok,false);
});
test('已解析2025/2024年度列不能将2026年缺列误称解析遗漏',()=>{
 const sources=[source('净利润',{period:'2025',annualFlow:true})];
 const blocks=[{name:'合并利润表',page:1,status:'parsed',gap:null,columns:[{year:2025,period:'2025',scope:'consolidated'},{year:2024,period:'2024',scope:'consolidated'}]}];
 const r=render('报告2025年度净利润，再判断能否确定2026年度净利润；合并范围。',sources,undefined,blocks);
 assert.ok(r.sourceAssessment.some(v=>v.metric.includes('2026')&&v.state==='requested_period_not_in_resolved_columns'),JSON.stringify(r.sourceAssessment));
 assert.equal(r.answerLines.some(v=>v.includes('2026')&&/解析、行名或模型交付缺口/.test(v)),false);
});
test('已知只有资产负债表，现金及现金等价物余额要明确缺现金流量表',()=>{
 const sources=[source()];
 const blocks=[{name:'合并资产负债表',page:1,status:'parsed',gap:null,columns:[{year:2025,period:'2025-12-31',scope:'consolidated'}]}];
 const r=render('报告合并2025年末货币资金，再判断能否确认同范围年末“现金及现金等价物余额”，明确缺失的表与口径，不得混用。',sources,undefined,blocks);
 assert.ok(r.sourceAssessment.some(v=>v.metric.includes('现金及现金等价物余额')&&v.state==='target_table_not_identified'),JSON.stringify(r.sourceAssessment));
});
test('未知表且无来源状态时保持不确定，不能猜资料一定缺失',()=>{
 const r=render('读取2025年度合并“未知协议资产”。',[],draft([]));
 assert.ok(r.sourceAssessment.some(v=>v.state==='source_state_unknown'));
 assert.equal(r.facts.length,0);
 assert.equal(r.answerLines.some(v=>/已确认不存在|资料确实缺失/.test(v)),false);
});
test('存货净额不能证明原值与准备，最终必须交付缺细分附注和禁止推断',()=>{
 const sources=[source('存货')];
 const r=render('先报告合并2025年末“存货”的披露金额，再判断能否仅凭本主表输入分别确认存货原值与存货跌价准备金额，明确缺少附注细分。',sources);
 const text=r.answerLines.join('\n');
 assert.ok(/附注/.test(text)&&/原值/.test(text)&&/跌价准备/.test(text)&&/不能|无法|不足/.test(text),text);
 assert.equal(r.facts.some(f=>/原值|跌价准备/.test(f.label)),false);
});
test('贷款总额不能证明逾期90天细分，最终必须给出缺证边界',()=>{
 const sources=[source('贷款和垫款')];
 const r=render('先报告2025年末合并“贷款和垫款”，再判断能否仅凭本主表确定其中逾期90天以上贷款金额。明确缺少细分证据。',sources);
 const text=r.answerLines.join('\n');
 assert.ok(/逾期/.test(text)&&/不能|无法|不足/.test(text)&&/附注|细分/.test(text),text);
});
test('管理措施造成的因果提问不能因未含“原因”为何而丢失限制',()=>{
 const sources=[source('净利润',{period:'2025',annualFlow:true})];
 const r=render('报告合并2025年度净利润，再判断变动是否由某项管理措施造成。',sources);
 assert.ok(r.answerLines.some(v=>/因果|造成|原因/.test(v)&&/不能|无法|不足/.test(v)),r.answerLines.join('\n'));
});
test('错误金额、范围、单位、日期、来源ID保持拒绝',()=>{
 for(const patch of [{value:'11'},{scope:'parent'},{unit:'万元'},{period:'2025-01-01'},{sourceId:'pdf:wrong:p1'}]){
  const sources=[source()],d=draft(sources);Object.assign(d.facts[0],patch);
  assert.equal(reviewDraft(d,sources,{question:factQuestion}).checks[0].ok,false,JSON.stringify(patch));
 }
});
