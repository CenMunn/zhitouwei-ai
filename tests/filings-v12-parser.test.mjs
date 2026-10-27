import test from 'node:test';
import assert from 'node:assert/strict';
import {extractFacts,reviewDraft} from '../src/lib/filings/core.ts';
const sha='c'.repeat(64),sourceId=`pdf:${sha}:p31`;
const item=(str,x,y,width=25)=>({str,transform:[1,0,0,1,x,y],width});
function page({name='合并资产负债表',date='2023年12月31日',captions=['本年年末余额','上年年末余额'],unit='单位：人民币元',dateAfterTitle=false}={}){
 const layoutItems=[item('开发东海股份有限公司2023年年度报告',20,850,200),item(name,20,800,150),item(date,200,dateAfterTitle?780:825,150),item(unit,20,755,100),item(captions[0],300,720,70),item(captions[1],430,720,70)];
 for(let i=0;i<3;i++)layoutItems.push(item(['货币资金','流动资产合计','资产总计'][i],20,680-i*25,120),item(String(120+i),345,680-i*25),item(String(100+i),475,680-i*25));
 return {page:31,text:'',layoutItems,physicalPageDeclared:true};
}
test('relative year-end columns use their own immediately preceding dated heading',()=>{
 const facts=extractFacts([page()],sha);assert.equal(facts.length,6);
 assert.deepEqual(facts.slice(0,2).map(f=>[f.year,f.period,f.value,f.currency]),[[2023,'2023-12-31','120','人民币'],[2022,'2022-12-31','100','人民币']]);
});
test('annual occurrence captions bind to the explicitly year-ended annual heading, not balance dates',()=>{
 for(const name of ['合并利润表','母公司现金流量表']){
  const p=page({name,date:'2023年12月31日止年度',captions:['本年发生额','上年发生额']});
  p.layoutItems=p.layoutItems.map(i=>({...i,str:i.str==='货币资金'?'年初现金及现金等价物余额':i.str==='流动资产合计'?'现金及现金等价物净增加额':i.str==='资产总计'?'年末现金及现金等价物余额':i.str}));
  const facts=extractFacts([p],sha);assert.equal(facts.length,6,name);
  if(name.includes('现金'))assert.deepEqual([facts[0].period,facts[2].period,facts[4].period],['2023-01-01','2023','2023-12-31']);
  else assert.equal(facts[0].period,'2023');
 }
});
test('relative captions still accept their own annual date below the title',()=>{
 assert.equal(extractFacts([page({dateAfterTitle:true})],sha).length,6);
});
test('report year, absent date, reversed columns, interim date and unknown units are not repaired',()=>{
 for(const options of [{date:''},{date:'2023年年度报告'},{date:'2023年6月30日'},{captions:['上年年末余额','本年年末余额']},{unit:'单位：人民币元\n币种：美元'}])assert.equal(extractFacts([page(options)],sha).length,0,JSON.stringify(options));
});
test('a year-ended label with an explicit interim qualifier is not an annual flow',()=>{
 for(const date of ['2023年6月30日止六个月','2023年12月31日止季度','2023年12月31日'])assert.equal(extractFacts([page({name:'合并利润表',date,captions:['本年发生额','上年发生额']})],sha).length,0,date);
});
test('conflicting explicit dates above and below the same title block stay rejected',()=>{
 const p=page();p.layoutItems.push(item('2022年12月31日',200,780,150));assert.equal(extractFacts([p],sha).length,0);
});
test('a previous table date cannot supply a later table without its own date',()=>{
 const p=page();const second=page({name:'母公司资产负债表',date:''});p.layoutItems.push(...second.layoutItems.filter(i=>i.transform[5]<810).map(i=>({...i,transform:[...i.transform.slice(0,5),i.transform[5]-300]})));
 assert.equal(extractFacts([p],sha).filter(f=>f.scope==='parent').length,0);
});
const source={sourceId,page:31,label:'货币资金',year:2023,period:'2023-12-31',scope:'parent',unit:'元',value:'120'};
const draft=f=>({refused:false,answer:'',facts:[f],calculations:[],limitations:[]});
test('redundant scope and full-date label annotations match only the same structured coordinates',()=>{
 const f={...source,label:'货币资金（本行，2023年12月31日）'};
 assert.equal(reviewDraft(draft(f),[source]).checks[0].ok,true);
 for(const bad of [{...f,period:'2023-01-01'},{...f,scope:'consolidated'},{...f,label:'货币资金（本行，2023年12月30日）'}])assert.equal(reviewDraft(draft(bad),[source]).checks[0].ok,false);
});
test('slash-separated matching scope qualifiers do not change the accounting metric',()=>{
 const s={...source,scope:'consolidated'},f={...s,label:'货币资金（合并/本集团）'};assert.equal(reviewDraft(draft(f),[s]).checks[0].ok,true);
 assert.equal(reviewDraft(draft({...f,scope:'parent'}),[source]).checks[0].ok,false);
});
test('a comparative-year annotation is metadata only when its explicit year agrees',()=>{
 const s={...source,label:'信用减值损失',period:'2023',scope:'consolidated'};
 assert.equal(reviewDraft(draft({...s,label:'信用减值损失（合并，本集团，2023年比较列）'}),[s]).checks[0].ok,true);
 assert.equal(reviewDraft(draft({...s,label:'信用减值损失（合并，本集团，2022年比较列）'}),[s]).checks[0].ok,false);
});
test('unknown substantive annotations, wrong amounts and unknown source pages remain rejected',()=>{
 for(const f of [{...source,label:'货币资金（受限）'},{...source,label:'货币资金（本行，2023年12月31日）',value:'999'},{...source,sourceId:`pdf:${sha}:p32`}])assert.equal(reviewDraft(draft(f),[source]).checks[0].ok,false);
});
test('rejection diagnostics distinguish source, label, scope, unit, period and amount gaps',()=>{
 const cases=[
  [{...source,sourceId:`pdf:${sha}:p32`},'SOURCE_PAGE_UNRESOLVED'],
  [{...source,label:'应收账款'},'LABEL_UNMATCHED'],
  [{...source,scope:'consolidated'},'SCOPE_MISMATCH'],
  [{...source,unit:'万元'},'UNIT_MISMATCH'],
  [{...source,period:'2023-01-01'},'PERIOD_MISMATCH'],
  [{...source,value:'999'},'VALUE_MISMATCH'],
 ];
 for(const [f,code] of cases){const c=reviewDraft(draft(f),[source]).checks[0];assert.equal(c.ok,false);assert.equal(c.code,code);}
});
test('an annual-flow cutoff date normalizes only with source-proven annual flow and an explicit annual question',()=>{
 const s={...source,label:'研发费用',period:'2023',annualFlow:true};const f={...s,period:'2023-12-31'};delete f.annualFlow;
 const r=reviewDraft(draft(f),[s],{question:'读取2023年度母公司研发费用'});assert.equal(r.checks[0].ok,true);assert.equal(r.acceptedFacts[0].period,'2023');
 for(const [q,src,candidate] of [
  ['读取2023年度母公司研发费用',{...s,annualFlow:false},f],
  ['读取2023年12月31日母公司研发费用',s,f],
  ['读取2023年度母公司研发费用',s,{...f,period:'2023-06-30'}],
  ['读取2023年度母公司研发费用',s,{...f,period:'2023-12-31',value:'999'}],
 ])assert.equal(reviewDraft(draft(candidate),[src],{question:q}).checks[0].ok,false,q);
});

import {extractStatementBlocks} from '../src/lib/filings/statements.ts';
test('an explicitly prior-year-end balance never acquires a January-1 opening alias',()=>{
 const facts=extractFacts([page()],sha),prior=facts.find(f=>f.label==='货币资金'&&f.year===2022);assert.ok(prior);assert.deepEqual(prior.periodAliases??[],[]);
 assert.equal(reviewDraft(draft({...prior,year:2023,period:'2023-01-01'}),facts,{question:'读取2023年1月1日合并货币资金'}).checks[0].ok,false);
});
test('a same-caption continuation preserves the year-end versus opening distinction in geometry',()=>{
 const second=page({name:'合并资产负债表（续）',date:''});second.page=32;
 const pages=[page(),second],blocks=extractStatementBlocks(pages,sha);assert.equal(blocks[1].status,'parsed');assert.ok(!blocks[1].geometry.annualRelativeBalances);
 assert.ok(extractFacts(pages,sha).every(f=>!(f.periodAliases??[]).includes('2023-01-01')));
});

test('a continuation cannot inherit opening aliases after switching the explicit caption meaning',()=>{
 for(const [a,b] of [[['期末余额','期初余额'],['本年年末余额','上年年末余额']],[['本年年末余额','上年年末余额'],['期末余额','期初余额']]]){
  const second=page({name:'合并资产负债表（续）',date:'',captions:b});second.page=32;
  const blocks=extractStatementBlocks([page({captions:a}),second],sha);
  assert.equal(blocks[1].status,'unresolved',a+' -> '+b);
 }
});
