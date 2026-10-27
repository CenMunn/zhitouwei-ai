import test from 'node:test';
import assert from 'node:assert/strict';
import {extractFacts,reviewDraft,buildAdoptedReport} from '../src/lib/filings/core.ts';
const sha='d'.repeat(64);
const item=(str,x,y,width=25)=>({str,transform:[1,0,0,1,x,y],width});
test('explicit RMB amount-unit suffix is recognized, unsupported suffixes still fail',()=>{
  for(const unit of ['金额单位均为百万元人民币','单位：万元人民币','单位：人民币千元']){
    const facts=extractFacts([{page:31,text:`合并利润表\n${unit}\n2025年 2024年\n净利润 |120 |100`}],sha);
    assert.equal(facts.length,2,unit);assert.equal(facts[0].currency,'人民币');
  }
  for(const unit of ['金额单位均为百万元美元','单位：万元人民币/股','金额单位均为百万元人民币\n单位：元','金额单位均为百万元人民币\n币种：美元']){
    assert.equal(extractFacts([{page:31,text:`合并利润表\n${unit}\n2025年 2024年\n净利润 |120 |100`}],sha).length,0,unit);
  }
});
test('joint mother-company title and matching named issuer captions retain four columns',()=>{
  const table=(captions)=>`合并及母公司资产负债表\n金额单位均为百万元人民币\n${captions}\n2025年 2024年 2025年 2024年\n资产总计 |120 |100 |90 |80`;
  const f=extractFacts([{page:31,text:table('开发南方银行集团 |开发南方银行')}],sha);
  assert.deepEqual(f.map(x=>[x.year,x.scope,x.value]),[[2025,'consolidated','120'],[2024,'consolidated','100'],[2025,'parent','90'],[2024,'parent','80']]);
  for(const captions of ['开发南方银行 |开发南方银行集团','开发南方银行集团 |开发北方银行','开发南方银行集团'])assert.equal(extractFacts([{page:31,text:table(captions)}],sha).length,0,captions);
});
const balance=(date='2025年12月31日',captions=['期末余额','期初余额'])=>{
  const layoutItems=[item('开发南方公司股份有限公司',20,820,220),item('合并资产负债表',20,790,180),item(date,200,770,130),item('单位：元',20,750,90),item('项目',20,720,60),item(captions[0],300,720,45),item(captions[1],400,720,45)];
  for(let i=0;i<3;i++)layoutItems.push(item(['货币资金','流动资产合计','资产总计'][i],20,680-i*25,120),item(String(120+i),320,680-i*25),item(String(100+i),420,680-i*25));
  return {page:31,text:'原文',layoutItems,physicalPageDeclared:true};
};
test('relative annual balance columns use explicit statement date and column geometry',()=>{
  const f=extractFacts([balance()],sha);
  assert.equal(f.length,6);
  assert.deepEqual(f.slice(0,2).map(x=>[x.year,x.period,x.value,x.currency]),[[2025,'2025-12-31','120',null],[2024,'2024-12-31','100',null]]);
});
test('relative balance columns cannot invent a date, reverse captions, or absorb conflicts',()=>{
  for(const p of [balance(''),balance('2025年6月30日'),balance('2025年12月31日',['期初余额','期末余额'])])assert.equal(extractFacts([p],sha).length,0);
  const p=balance();p.layoutItems.push(item('2024年12月31日',200,740,130));assert.equal(extractFacts([p],sha).length,0);
});
test('wrapped unfinished row prefixes remain attached to their aligned amount row',()=>{
 const p=balance();p.layoutItems=p.layoutItems.filter(i=>i.transform[5]!==680);
 p.layoutItems.push(item('—以公允价值计量且其变动计入',100,694,165),item('当期损益的金融资产',120,680,115),item('120',320,680),item('100',420,680));
 const f=extractFacts([p],sha);
 assert.equal(f.find(f=>f.value==='120')?.label,'—以公允价值计量且其变动计入当期损益的金融资产');
});
test('ambiguous leasing row does not falsely reverse a confirmed non-current continuation',()=>{
 const first=balance();first.layoutItems=first.layoutItems.filter(i=>i.transform[5]>=720);
 for(let i=0;i<3;i++)first.layoutItems.push(item(['长期借款','长期应付款','非流动负债合计'][i],20,680-i*25,120),item('120',320,680-i*25),item('100',420,680-i*25));
 const layoutItems=[item('开发南方公司股份有限公司',20,820,220)];
 for(let i=0;i<3;i++)layoutItems.push(item(['租赁负债','长期应付职工薪酬','负债合计'][i],20,680-i*25,120),item('120',320,680-i*25),item('100',420,680-i*25));
 assert.equal(extractFacts([first,{page:32,physicalPageDeclared:true,text:'',layoutItems}],sha).filter(f=>f.page===32).length,6);
});
test('only source-proven relative opening aliases normalize to the preceding annual comparison date',()=>{
 const source=extractFacts([balance()],sha),opening=source.find(f=>f.label==='货币资金'&&f.year===2024);
 const raw={...opening,year:2025,period:'2025-01-01'};
 const candidate=f=>({refused:false,answer:'',limitations:[],facts:[f],calculations:[]});
 const review=reviewDraft(candidate(raw),source,{question:'列出2024年12月31日期初比较列货币资金'});
 assert.equal(review.checks[0].ok,true);assert.equal(review.acceptedFacts[0].year,2024);
 const report=buildAdoptedReport(candidate(raw),review,'列出2024年12月31日期初比较列货币资金','fr_dev');
 assert.equal(report.facts[0].year,2024);assert.equal(report.facts[0].period,'2024-12-31');
 for(const bad of [{...raw,period:'2025-12-31'},{...raw,value:'999'},{...raw,unit:'万元'}])assert.equal(reviewDraft(candidate(bad),source).checks[0].ok,false);
 const explicit=extractFacts([{page:31,text:'合并资产负债表\n单位：元\n2025年1月1日 2024年1月1日\n货币资金 |100 |80'}],sha);
 assert.equal(explicit[0].period,'2025-01-01');
 assert.equal(reviewDraft(candidate({...raw,year:2024,period:'2024-12-31'}),explicit).checks[0].ok,false);
});
