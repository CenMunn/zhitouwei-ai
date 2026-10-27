import test from 'node:test';
import assert from 'node:assert/strict';
import {extractFacts,reviewDraft,buildAdoptedReport} from '../src/lib/filings/core.ts';
import {extractStatementBlocks} from '../src/lib/filings/statements.ts';
const sha='d'.repeat(64),item=(str,x,y,width=25)=>({str,transform:[1,0,0,1,x,y],width});
const rows=(labels,y=680)=>labels.flatMap((label,i)=>[item(label,20,y-i*25,120),item(String(120+i),320,y-i*25),item(String(100+i),420,y-i*25)]);
const balance=()=>({page:31,text:'',physicalPageDeclared:true,layoutItems:[item('开发南方公司股份有限公司',20,820,220),item('合并资产负债表',20,790,180),item('2025年12月31日',200,770,130),item('单位：元',20,750,90),item('期末余额',300,720,45),item('期初余额',400,720,45),...rows(['货币资金','流动资产合计','资产总计'])]});
test('explicit reversed or partial relative continuation captions cannot inherit dates',()=>{
 for(const title of [true,false])for(const captions of [['期初余额','期末余额'],['期末余额']]){
  const p=balance(),next={page:32,text:'',physicalPageDeclared:true,layoutItems:[item('开发南方公司股份有限公司',20,820,220),...(title?[item('合并资产负债表（续）',20,790,180)]:[]),...captions.map((s,i)=>item(s,300+i*100,720,45)),...rows(['短期借款','应付账款','流动负债合计'])]};
  assert.equal(extractFacts([p,next],sha).filter(f=>f.page===32).length,0,JSON.stringify({title,captions}));
 }
});
test('ordered relative continuation retains only proven closing and opening column order',()=>{
 const p=balance(),next={page:32,text:'',physicalPageDeclared:true,layoutItems:[item('开发南方公司股份有限公司',20,820,220),item('合并资产负债表（续）',20,790,180),item('期末余额',300,720,45),item('期初余额',400,720,45),...rows(['短期借款','应付账款','流动负债合计'])]};
 assert.equal(extractFacts([p,next],sha).filter(f=>f.page===32).length,6);
 const reversed=balance();reversed.layoutItems=reversed.layoutItems.filter(i=>i.transform[5]!==770&&i.transform[5]!==720);reversed.layoutItems.push(item('2024年12月31日',300,720,45),item('2025年12月31日',400,720,45));
 assert.equal(extractFacts([reversed,next],sha).filter(f=>f.page===32).length,0);
});
test('relative dates never override conflicting annual or layered column metadata',()=>{
 for(const metadata of [item('报告期间：2024年度',20,735,160),item('2023年12月31日',390,704,85),item('2023年',400,704,45)]){
  const p=balance();p.layoutItems.push(metadata);assert.equal(extractFacts([p],sha).length,0,metadata.str);
 }
 for(const metadata of [item('报告期间：2025年度',20,735,160),item('2024年12月31日',390,704,85),item('2024年',400,704,45),item('其他事项2023年12月31日',20,570,170)]){
  const p=balance();p.layoutItems.push(metadata);assert.equal(extractFacts([p],sha).length,6,metadata.str);
 }
 for(const month of ['6月30日','12月31日']){
  const p=balance();p.layoutItems.push(item('2024年',400,707,45),item(month,400,694,45));
  assert.equal(extractFacts([p],sha).length,month==='12月31日'?6:0,'layered year and month/day fragments '+month);
 }
});
const candidate=facts=>({refused:false,answer:'',limitations:[],facts,calculations:[]});
test('source-proven opening alias remains delivered with explicit canonical explanation',()=>{
 const p=balance(),source=extractFacts([p],sha),f=source.find(f=>f.label==='货币资金'&&f.year===2024),raw={...f,year:2025,period:'2025-01-01'},draft=candidate([raw]),question='请列出2025年1月1日合并货币资金。';
 const report=buildAdoptedReport(draft,reviewDraft(draft,source,{question}),question,'dev',{sourceFacts:source,statementBlocks:extractStatementBlocks([p],sha)});
 assert.equal(report.facts[0].period,'2024-12-31');assert.deepEqual(report.facts[0].periodAliases,['2025-01-01']);assert.deepEqual(report.coverage.missing,[]);
 assert.match(report.answerLines.join('\n'),/2025-01-01.*2024-12-31|2024-12-31.*2025-01-01/);assert.doesNotMatch(report.answerLines.join('\n'),/没有2025-01-01|请补充/);
 const empty=candidate([]),gap=buildAdoptedReport(empty,reviewDraft(empty,source),question,'dev',{sourceFacts:source,statementBlocks:extractStatementBlocks([p],sha)});
 assert.equal(gap.sourceAssessment[0].state,'source_present_delivery_gap');
 const annual='列出2025年合并货币资金。',annualReport=buildAdoptedReport(draft,reviewDraft(draft,source),annual);
 assert.ok(annualReport.coverage.missing.length,'year-only request cannot borrow prior closing alias');
});
test('proven aliases apply to requested conversion coverage but cannot be supplied by candidate',()=>{
 const p=balance(),source=extractFacts([p],sha),f=source.find(f=>f.label==='货币资金'&&f.year===2024),draft=candidate([{...f,year:2025,period:'2025-01-01'}]);
 draft.calculations=[{label:'换算',operation:'unit_conversion',operands:[0],value:'0.01',unit:'万元'}];
 const question='列出2025年1月1日合并货币资金，并计算换算为万元。',report=buildAdoptedReport(draft,reviewDraft(draft,source,{question}),question,'dev',{sourceFacts:source});
 assert.equal(report.calculations.length,1);assert.deepEqual(report.coverage.missing,[]);
 const unproven=source.map(({periodAliases,...f})=>f),raw=candidate([{...f,periodAliases:['2025-01-01']}]);
 const wrong=buildAdoptedReport(raw,reviewDraft(raw,unproven), '列出2025年1月1日合并货币资金。','dev',{sourceFacts:unproven});
 assert.ok(wrong.coverage.missing.length);assert.deepEqual(wrong.facts[0].periodAliases,[]);
});
