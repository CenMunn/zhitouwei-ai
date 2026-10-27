import test from 'node:test';import assert from 'node:assert/strict';
import {extractFacts,reviewDraft} from '../src/lib/filings/core.ts';
import {extractStatementBlocks} from '../src/lib/filings/statements.ts';
const sha='d'.repeat(64),sid=`pdf:${sha}:p1`;
const item=(str,x,y,width=25)=>({str,transform:[10,0,0,10,x,y],width});
const page=(split=true,stagger=true)=>{
 const a=[item('开发样本公司',20,820,120),item('合并资产负债表',20,790,150),item('人民币百万元',20,760,110),item('2025年',300,710),item('2024年',420,stagger?724:710)];
 if(split)a.push(item('12月31日',288,696,52),item('12月31日',408,stagger?710:696,52),item('(已重述)',414,stagger?696:682,50));
 for(let n=0;n<4;n++)a.push(item(['货币资金','流动资产合计','流动负债合计','资产总计'][n],20,650-n*25,130),item(String(130+n),312,650-n*25,28),item(String(100+n),432,650-n*25,28));
 return {page:1,text:a.map(i=>i.str).join('\n'),layoutItems:a,physicalPageDeclared:true};
};
test('staggered year headings with per-column wrapped dates preserve money and exact periods',()=>{
 const fs=extractFacts([page()],sha);assert.equal(fs.length,8);
 assert.deepEqual(fs.slice(0,2).map(f=>[f.year,f.period,f.value]),[[2025,'2025-12-31','130'],[2024,'2024-12-31','100']]);
});
test('aligned years still associate wrapped month/day with each column',()=>{
 const fs=extractFacts([page(true,false)],sha);assert.equal(fs.length,8);
 assert.deepEqual(fs.slice(0,2).map(f=>f.period),['2025-12-31','2024-12-31']);
});
test('aligned and staggered headers reject extra conflicting year or date fragments',()=>{
 for(const stagger of [true,false])for(const fragment of ['2023年','1月1日']){
  const p=page(true,stagger);p.layoutItems.push(item(fragment,300,682));
  assert.equal(extractFacts([p],sha).length,0,`${stagger} ${fragment}`);
 }
});
test('staggered columns keep original order, do not sort years numerically',()=>{
 const p=page();p.layoutItems=p.layoutItems.map(i=>({...i,str:i.str==='2025年'?'2023年':i.str}));
 const fs=extractFacts([p],sha);assert.deepEqual(fs.slice(0,2).map(f=>f.year),[2023,2024]);
});
test('different dates in same calendar year are not collapsed; invalid dates are rejected',()=>{
 const p=page();p.layoutItems=p.layoutItems.map(i=>({...i,str:i.str==='2024年'?'2025年':i.str==='12月31日'&&i.transform[4]>400?'1月1日':i.str}));
 assert.deepEqual(extractFacts([p],sha).slice(0,2).map(f=>f.period),['2025-12-31','2025-01-01']);
 const invalid=page();invalid.layoutItems=invalid.layoutItems.map(i=>({...i,str:i.str==='12月31日'?'13月31日':i.str}));
 assert.equal(extractFacts([invalid],sha).length,0);
});
test('unanchored or duplicated staggered columns fail closed rather than using note numbers',()=>{
 const p=page();p.layoutItems=p.layoutItems.filter(i=>!(i.transform[4]>430&&i.transform[5]<660));
 assert.equal(extractFacts([p],sha).length,0);
 const p2=page();p2.layoutItems.push(item('2022年',420,705));
 assert.equal(extractFacts([p2],sha).length,0);
});
test('staggered annual income headers do not inherit a fabricated balance date',()=>{
 const p=page(false,true);p.layoutItems=p.layoutItems.map(i=>({...i,str:i.str==='合并资产负债表'?'合并利润表':i.str}));
 assert.deepEqual(extractStatementBlocks([p],sha)[0].columns.map(c=>c.period),['2025','2024']);
});
const f=(over={})=>({sourceId:sid,page:1,label:'资产总计',year:2025,scope:'consolidated',period:'2025-12-31',unit:'元',value:'100',...over});
const d=fs=>({answer:'',facts:fs,calculations:[],limitations:[],refused:false});
test('year-only candidate resolves only a unique source period; wrong or ambiguous dates remain rejected',()=>{
 assert.equal(reviewDraft(d([f({period:'2025'})]),[f()]).checks[0].ok,true);
 assert.equal(reviewDraft(d([f({period:'2025'})]),[f(),f({period:'2025-01-01'})]).checks[0].ok,false);
 assert.equal(reviewDraft(d([f({period:'2025-06-30'})]),[f()]).checks[0].ok,false);
 assert.equal(reviewDraft(d([f({period:'2025'})]),[f()],{question:'2025年1月1日资产总计'}).checks[0].ok,false);
 assert.equal(reviewDraft(d([f({period:'2024'})]),[f()]).checks[0].ok,false);
});
test('extra decimals only normalize under explicit precision; bad percentages still fail',()=>{
 const fs=[f({label:'营业收入',value:'120',period:'2025'}),f({label:'营业收入',year:2024,value:'110',period:'2024'})];
 const draft=d(fs);draft.calculations=[{label:'增长率',operation:'growth',operands:[0,1],value:'9.0909',unit:'%'}];
 const r=reviewDraft(draft,fs,{question:'同比保留2位小数'});assert.equal(r.checks.at(-1).ok,true);assert.equal(r.checks.at(-1).normalizedValue,'9.09');
 for(const value of ['0.0909','9.10']){draft.calculations[0].value=value;assert.equal(reviewDraft(draft,fs,{question:'同比保留2位小数'}).checks.at(-1).ok,false);}
});
