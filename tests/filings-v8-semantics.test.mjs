import test from 'node:test';
import assert from 'node:assert/strict';
import {extractFacts,reviewDraft,buildAdoptedReport,renderReport} from '../src/lib/filings/core.ts';
import {reviewCalculation} from '../src/lib/filings/calculations.ts';
const sha='a'.repeat(64),sid=`pdf:${sha}:p1`;
const draft=fs=>({answer:'',facts:fs,calculations:[],limitations:[],refused:false});
const fact=(over={})=>({sourceId:sid,label:'资产总计',year:2025,scope:'consolidated',unit:'元',value:'120',...over});
const page=(title,years='2025年12月31日 2025年1月1日')=>({page:1,text:`${title}\n人民币元\n${years}\n资产总计 |120 |100\n负债合计 |60 |50`});
test('same calendar year opening/closing columns retain distinct full dates',()=>{
 const fs=extractFacts([page('合并资产负债表')],sha);
 assert.equal(fs.length,4);assert.deepEqual(fs.slice(0,2).map(f=>f.period),['2025-12-31','2025-01-01']);
 assert.equal(extractFacts([page('合并资产负债表','2025年 2025年')],sha).length,0);
 assert.equal(extractFacts([page('合并资产负债表','2025年13月31日 2025年1月1日')],sha).length,0);
});
test('standalone bank table title is parent scope and full date reaches final report',()=>{
 const fs=extractFacts([page('银行资产负债表','2025年12月31日 2024年12月31日')],sha);
 assert.equal(fs.length,4);assert.ok(fs.every(f=>f.scope==='parent'));
 const d=draft([fact({scope:'parent',period:'2025-12-31'})]),q='列示2025年12月31日本银行资产总计';
 const review=reviewDraft(d,fs,{question:q}),adopted=buildAdoptedReport(d,review,q,'r');
 assert.equal(review.checks[0].ok,true);assert.match(adopted.answerLines.join(' '),/2025-12-31/);
 assert.match(renderReport({id:'r',question:q,mode:'current_evidence',companyName:'开发银行',sha256:sha,createdAt:'x',draft:d,review,adoptedReport:adopted,durationMs:1}),/2025\\-12\\-31|2025-12-31/);
});
test('wrong full date cannot pass by matching only year/value; ambiguous same year needs date',()=>{
 const fs=[{...fact(),page:1,period:'2025-01-01'},{...fact(),page:1,period:'2025-12-31'}];
 assert.equal(reviewDraft(draft([fact()]),fs).checks[0].ok,false);
 assert.equal(reviewDraft(draft([fact({period:'2025-06-30'})]),fs).checks[0].ok,false);
 assert.equal(reviewDraft(draft([fact()]),fs,{question:'2025年12月31日资产总计'}).factSources[0].source.period,'2025-12-31');
});
test('mixed opening and closing balance cannot pass same-year ratio or sum',()=>{
 const fs=[fact({period:'2025-12-31',value:'120'}),fact({period:'2025-01-01',value:'100'})];
 for(const [operation,value,unit] of [['ratio','1.2','倍'],['sum','220','元']])assert.equal(reviewCalculation({label:'',operation,operands:[0,1],value,unit},fs).ok,false);
});
test('explicit negative substitute is not a required metric; positive comparison still requires both',()=>{
 const f=fact({label:'净利润'}),d=draft([f]),review=reviewDraft(d,[{...f,page:1}]);
 const a=buildAdoptedReport(d,review,'列示2025年合并净利润，不用归母净利润替换。');
 assert.equal(a.coverage.missing.length,0);
 assert.ok(buildAdoptedReport(d,review,'比较2025年合并净利润和归母净利润是否相同。').coverage.missing.some(s=>s.includes('归属于')));
});
test('negated estimation does not claim another missing metric or calculation',()=>{
 const q='给出2025年经营现金流；不要根据净利润估算。';
 const a=buildAdoptedReport(draft([]),reviewDraft(draft([]),[]),q,null,{statementBlocks:[{name:'合并利润表',page:1,status:'parsed'}]});
 assert.ok(!a.coverage.missing.some(s=>s.includes('净利润')));assert.ok(a.answerLines.some(s=>s.includes('现金流量表')));
});
test('verified conversion presents auditable numeric conversion factor',()=>{
 const f=fact({label:'营业收入',value:'123456789'}),d=draft([f]);
 d.calculations=[{label:'',operation:'unit_conversion',operands:[0],value:'1.2346',unit:'亿元'}];
 const a=buildAdoptedReport(d,reviewDraft(d,[{...f,page:1}]),'将2025年合并营业收入换算为亿元');
 assert.match(a.calculations[0].label,/÷ 100000000/);
});

test('full-date task coverage cannot be satisfied by a different date or just one of two dates',()=>{
 const fs=[{...fact({value:'120'}),page:1,period:'2025-12-31'},{...fact({value:'100'}),page:1,period:'2025-01-01'}];
 const d=draft([fact({period:'2025-01-01',value:'100'})]);
 for(const q of ['列示2025年12月31日合并资产总计','列示2025-12-31合并资产总计','比较2025年1月1日和2025年12月31日合并资产总计']){
  const r=reviewDraft(d,fs,{question:q}),a=buildAdoptedReport(d,r,q,null,{sourceFacts:fs});
  assert.ok(a.coverage.missing.some(s=>s.includes('2025-12-31')),q);
 }
});
test('an excluded year must not create a positive task requirement',()=>{
 const f=fact({label:'净利润'}),d=draft([f]);
 const a=buildAdoptedReport(d,reviewDraft(d,[{...f,page:1}]),'列示2025年合并净利润，不使用2024年数据。');
 assert.equal(a.coverage.missing.length,0);
});

test('a continuation explicitly declaring a new full date cannot inherit older dates',()=>{
 const i=(str,x,y,width=25)=>({str,transform:[1,0,0,1,x,y],width});
 const rows=(names)=>names.flatMap((n,k)=>[i(n,20,680-k*24,140),i('120',300,680-k*24,20),i('100',400,680-k*24,20)]);
 const pg=(n,items)=>({page:n,physicalPageDeclared:true,text:items.map(i=>i.str).join('\n'),layoutItems:items});
 const first=pg(1,[i('开发甲公司',20,820,120),i('合并资产负债表',20,790,160),i('人民币元',20,760,100),i('2025年12月31日',270,720,55),i('2025年1月1日',370,720,55),...rows(['无形资产','长期待摊费用'])]);
 for(const declaredDate of ['2025年6月30日','2025年1月1日']){
 const second=pg(2,[i('开发甲公司',20,820,120),i('合并资产负债表（续）',20,790,160),i(declaredDate,270,730,55),...rows(['非流动资产合计','资产总计'])]);
 assert.ok(extractFacts([first],sha).length>0);
 assert.equal(extractFacts([first,second],sha).filter(f=>f.page===2).length,0);
 }
});

test('same-year dated difference delivers increase/decrease direction',()=>{
 const fs=[fact({period:'2025-12-31',value:'120'}),fact({period:'2025-01-01',value:'100'})],d=draft(fs);
 d.calculations=[{label:'差额',operation:'difference',operands:[0,1],value:'20',unit:'元'}];
 const q='计算2025年12月31日与2025年1月1日合并资产总计差额，并说明增减方向';
 const a=buildAdoptedReport(d,reviewDraft(d,fs.map(f=>({...f,page:1})),{question:q}),q);
 assert.ok(a.answerLines.some(s=>s.includes('增加（上升）')&&s.includes('2025-12-31')&&s.includes('2025-01-01')));
});

test('ratio from opening balances does not satisfy requested closing date',()=>{
 const fs=[fact({label:'负债合计',value:'50',period:'2025-01-01'}),fact({value:'100',period:'2025-01-01'})],d=draft(fs);
 d.calculations=[{label:'负债率',operation:'ratio',operands:[0,1],value:'50',unit:'%'}];
 const q='计算2025年12月31日合并资产负债率';
 const a=buildAdoptedReport(d,reviewDraft(d,fs.map(f=>({...f,page:1})),{question:q}),q);
 assert.ok(a.coverage.missing.some(s=>s.includes('2025-12-31')));
});

test('an explicitly annual income metric does not inherit another metric balance date',()=>{
 const fs=[fact({period:'2025-12-31'}),fact({label:'净利润',value:'20',period:'2025'})],d=draft(fs);
 const q='列示2025年12月31日合并资产总计和2025年度合并净利润';
 const a=buildAdoptedReport(d,reviewDraft(d,fs.map(f=>({...f,page:1})),{question:q}),q);
 assert.equal(a.coverage.missing.length,0);assert.ok(a.answerLines.some(s=>s.includes('净利润为20')));
});
