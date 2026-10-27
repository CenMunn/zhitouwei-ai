import test from 'node:test';
import assert from 'node:assert/strict';
import {extractFacts} from '../src/lib/filings/core.ts';
const sha='b'.repeat(64);
const item=(str,x,y,width=25)=>({str,transform:[1,0,0,1,x,y],width});
const table=(name,unit='单位：元 币种：人民币',years='2025 年 2024 年',row='资产总计 |120 |100')=>`${name}\n${unit}\n${years}\n${row}`;
test('old 元/币种 declaration accepts original unit without currency guessing',()=>{
  const facts=extractFacts([{page:82,text:table('合并资产负债表')}],sha);
  assert.deepEqual(facts.map(f=>[f.unit,f.year,f.value]),[['元',2025,'120'],['元',2024,'100']]);
});
test('pipe-separated 年度 preserves ascending original columns',()=>{
  const facts=extractFacts([{page:90,text:table('合并现金流量表','人民币百万元','2024 |年度 |2025 |年度','经营活动产生的现金流量净额 |80 |100')}],sha);
  assert.deepEqual(facts.map(f=>[f.year,f.value]),[[2024,'80'],[2025,'100']]);
});
test('same-page statement blocks bind their own scope and unit',()=>{
  const text=table('合并资产负债表')+'\n'+table('母公司现金流量表','单位：万元','2025年 2024年','经营活动产生的现金流量净额 |30 |20');
  const facts=extractFacts([{page:8,text}],sha);
  assert.deepEqual(facts.map(f=>[f.scope,f.unit,f.value]),[['consolidated','元','120'],['consolidated','元','100'],['parent','万元','30'],['parent','万元','20']]);
  assert.notEqual(facts[0].statementId,facts[2].statementId);
  assert.deepEqual(facts[0].headerSourceIds,[`pdf:${sha}:p8`]);
});
test('unknown units and conflicting declarations cannot become 元',()=>{
  for(const unit of ['单位：港元','单位：千美元','人民币元\n单位：万元',''])assert.equal(extractFacts([{page:1,text:table('合并资产负债表',unit)}],sha).length,0);
});
const positioned=(page,{entity='开发甲公司',name='合并资产负债表',header=true,unit=true,shift=0}={})=>{
  const layoutItems=[item(entity,20,800,120),item(name,20,770,160)];
  if(unit)layoutItems.push(item('人民币元',20,740,80));
  if(header)layoutItems.push(item('2025年',300+shift,700),item('2024年',400+shift,700));
  for(let r=0;r<3;r++)layoutItems.push(item(['资产总计','负债合计','所有者权益合计'][r],20,650-r*25,130),item('120',320+shift,650-r*25),item('100',420+shift,650-r*25));
  return {page,text:layoutItems.map(i=>i.str).join('\n'),layoutItems,physicalPageDeclared:true};
};
test('confirmed adjacent continuation records both header and value pages',()=>{
  const first=positioned(10),next=positioned(11,{name:'合并资产负债表（续）',header:false,unit:false});
  const facts=extractFacts([first,next],sha).filter(f=>f.page===11);
  assert.equal(facts.length,6);
  assert.deepEqual(facts[0].headerSourceIds,[`pdf:${sha}:p10`]);
  assert.equal(facts[0].sourceId,`pdf:${sha}:p11`);
});
test('continuation cannot inherit across physical gap, reordering, entity, table or column change',()=>{
  const first=positioned(10);
  for(const pair of [
    [first,positioned(12,{name:'合并资产负债表（续）',header:false,unit:false})],
    [positioned(11,{name:'合并资产负债表（续）',header:false,unit:false}),first],
    [first,positioned(11,{entity:'开发乙公司',name:'合并资产负债表（续）',header:false,unit:false})],
    [first,positioned(11,{name:'合并现金流量表（续）',header:false,unit:false})],
    [first,positioned(11,{name:'合并资产负债表（续）',header:false,unit:false,shift:35})],
    [first,positioned(11,{name:'合并资产负债表',header:false,unit:false})]
  ])assert.equal(extractFacts(pair,sha).filter(f=>!f.headerSourceIds.includes(f.sourceId)).length,0);
});
test('an isolated continuation cannot refer to a header outside uploaded pages',()=>{
  assert.equal(extractFacts([positioned(11,{name:'合并资产负债表（续）',header:false,unit:false})],sha).length,0);
});
test('blank financial cells never shift a following cell into another year',()=>{
  const text='合并资产负债表\n人民币元\n2025年 2024年\n资产总计 | |100\n负债合计 |- |80';
  assert.deepEqual(extractFacts([{page:1,text}],sha).map(f=>[f.label,f.year,f.value]),[['负债合计',2024,'80']]);
});
test('four-column scope captions below year headings belong to the same header',()=>{
  const layoutItems=[item('合并及公司资产负债表',20,800,200),item('人民币元',20,780,80)];
  for(let c=0;c<4;c++){layoutItems.push(item(c%2?'2024年':'2025年',300+c*100,740),item(c<2?'合并':'母公司',300+c*100,720));}
  for(let r=0;r<3;r++){layoutItems.push(item('开发项目'+String.fromCharCode(65+r),20,680-r*20,120));for(let c=0;c<4;c++)layoutItems.push(item(String(100+c),320+c*100,680-r*20));}
  const f=extractFacts([{page:1,text:'原文',layoutItems}],sha);
  assert.deepEqual(f.slice(0,4).map(x=>x.scope),['consolidated','consolidated','parent','parent']);
});
test('七（1） note suffix is excluded while substantive numbered row labels remain',()=>{
  const text=table('合并利润表','人民币元','2025年 2024年','货币资金 七（1） |120 |100\n1.持续经营净利润 |30 |20');
  assert.deepEqual(extractFacts([{page:1,text}],sha).map(f=>f.label),['货币资金','货币资金','1.持续经营净利润','1.持续经营净利润']);
});
test('headerless balance continuation requires a closing-asset/opening-liability bridge',()=>{
  const first=positioned(10);first.layoutItems.forEach(i=>{if(i.str==='所有者权益合计')i.str='资产总计';});
  const next=positioned(11,{header:false,unit:false});next.layoutItems=next.layoutItems.filter(i=>i.str!=='合并资产负债表');next.layoutItems.push(item('流动负债：',20,760,130));
  const f=extractFacts([first,next],sha).filter(f=>f.page===11);
  assert.equal(f.length,6);assert.deepEqual(f[0].headerSourceIds,[`pdf:${sha}:p10`]);
  const isolated=extractFacts([next],sha);assert.equal(isolated.length,0);
  const bad={...next,layoutItems:next.layoutItems.map(i=>i.str==='流动负债：'?{...i,str:'不明表格'}:i)};
  assert.equal(extractFacts([first,bad],sha).filter(f=>f.page===11).length,0);
});
test('explicit invalid year columns cannot inherit old years on a named continuation',()=>{
  const first=positioned(10),next=positioned(11,{name:'合并资产负债表（续）',unit:false});
  next.layoutItems=next.layoutItems.map(i=>/^202[45]年$/.test(i.str)?{...i,str:'2023年'}:i);
  assert.equal(extractFacts([first,next],sha).filter(f=>f.page===11).length,0);
});
test('a reversed explicit scope header never inherits preceding group/bank scopes',()=>{
  const page=(n,reverse)=>{
    const layoutItems=[item('开发甲银行股份有限公司',20,820,220),item('合并及银行资产负债表（续）',20,790,250),item('人民币元',20,760,100)];
    for(let c=0;c<4;c++)layoutItems.push(item(c%2?'2024年':'2025年',300+c*100,720),item((c<2)!==reverse?'本集团':'本银行',300+c*100,740));
    for(let r=0;r<3;r++){layoutItems.push(item('资产项目'+String.fromCharCode(65+r),20,680-r*20,120));for(let c=0;c<4;c++)layoutItems.push(item(String(100+c),320+c*100,680-r*20));}
    return {page:n,text:'原文',layoutItems,physicalPageDeclared:true};
  };
  assert.equal(extractFacts([page(10,false),page(11,true)],sha).filter(f=>f.page===11).length,0);
});
test('a recognized amount unit cannot hide unsupported duplicate units or mixed currencies',()=>{
  for(const unit of ['单位：元\n单位：港元','单位：元 币种：人民币及美元','人民币元\n金额单位为千美元']){
    assert.equal(extractFacts([{page:1,text:table('合并资产负债表',unit)}],sha).length,0);
  }
});
test('upload-index adjacency cannot establish original physical continuity',()=>{
  const first=positioned(10),next=positioned(11,{name:'合并资产负债表（续）',header:false,unit:false});
  for(const which of [0,1]){
    const pair=[{...first},{...next}];pair[which].physicalPageDeclared=false;
    assert.equal(extractFacts(pair,sha).filter(f=>f.page===11).length,0);
  }
});
