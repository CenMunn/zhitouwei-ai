import test from 'node:test';
import assert from 'node:assert/strict';
import {extractFacts,reviewDraft} from '../src/lib/filings/core.ts';
import {financialLayoutRows} from '../src/lib/filings/layout.ts';
const sha='c'.repeat(64),sid=p=>`pdf:${sha}:p${p}`;
const item=(str,x,y,width=25)=>({str,transform:[1,0,0,1,x,y],width});
const rows=(labels,base=680)=>labels.flatMap((label,i)=>[item(label,20,base-i*24,140),item('120',300,base-i*24,20),item('100',400,base-i*24,20)]);
const page=(n,body)=>({page:n,physicalPageDeclared:true,text:body.map(i=>i.str).join('\n'),layoutItems:body});
const header=(title)=>[item('开发甲公司',20,820,120),item(title,20,790,160),item('人民币元',20,760,100),item('2025年',300,720),item('2024年',400,720)];
test('old bank right-aligned monetary anchors may sit slightly left of year text right edge',()=>{
 const items=[];for(let c=0;c<4;c++)items.push(item(c%2?'2024年':'2025年',250+c*74,720,32));
 for(let r=0;r<3;r++){items.push(item('资产项目'+r,20,680-r*24,120),item('12',190,680-r*24,10));for(let c=0;c<4;c++)items.push(item('123',260+c*74,680-r*24,21));}
 assert.equal(financialLayoutRows(items,4).length,3);
});
test('note suffixes 七、61 and 十九、4 never become part of source metric names',()=>{
 const p={page:1,text:'合并利润表\n人民币元\n2025年 2024年\n其中：营业收入 七、61 |120 |100\n投资收益 十九、4 |30 |20'};
 const facts=extractFacts([p],sha);assert.deepEqual(facts.map(f=>f.label),['其中：营业收入','其中：营业收入','投资收益','投资收益']);
 const d={answer:'',facts:[{sourceId:sid(1),label:'其中：营业收入',year:2025,scope:'consolidated',unit:'元',value:'120'}],calculations:[],limitations:[],refused:false};
 assert.equal(reviewDraft(d,facts).checks[0].ok,true);
});
test('validated unnamed continuation preserves header page and resolves late asset total',()=>{
 const p1=page(10,[...header('合并资产负债表'),...rows(['非流动资产：','固定资产','无形资产'])]);
 const p2=page(11,[item('开发甲公司',20,820,120),...rows(['商誉','长期待摊费用','非流动资产合计','资产总计'])]);
 const facts=extractFacts([p1,p2],sha).filter(f=>f.page===11);
 assert.equal(facts.length,8);assert.deepEqual(facts.at(-1).headerSourceIds,[sid(10)]);
});
test('leading continuation and following new statement bind separate scopes on one page',()=>{
 const p1=page(10,[...header('合并资产负债表'),...rows(['非流动负债合计','负债合计','股东权益合计'])]);
 const p2=page(11,[item('开发甲公司',20,820,120),...rows(['其他综合收益','盈余公积','负债和股东权益总计'],780),...header('母公司资产负债表').filter(i=>i.str!=='开发甲公司').map(i=>({...i,transform:[1,0,0,1,i.transform[4],i.transform[5]-210]})),...rows(['货币资金','存货','流动资产合计'],460)]);
 const facts=extractFacts([p1,p2],sha).filter(f=>f.page===11);
 assert.ok(facts.some(f=>f.label==='负债和股东权益总计'&&f.scope==='consolidated'));
 assert.ok(facts.some(f=>f.label==='货币资金'&&f.scope==='parent'));
 assert.notEqual(facts.find(f=>f.scope==='consolidated').statementId,facts.find(f=>f.scope==='parent').statementId);
});
test('unnamed continuation rejects reversed sections, shifted anchors and missing original mapping',()=>{
 const p1=page(10,[...header('合并资产负债表'),...rows(['负债合计','股东权益合计','负债和股东权益总计'])]);
 const p2=page(11,[item('开发甲公司',20,820,120),...rows(['货币资金','存货','流动资产合计'])]);
 assert.equal(extractFacts([p1,p2],sha).filter(f=>f.page===11).length,0);
 const a=page(10,[...header('合并资产负债表'),...rows(['无形资产','商誉','长期待摊费用'])]);
 for(const bad of [{...p2,physicalPageDeclared:false},page(11,p2.layoutItems.map(i=>i.transform[4]>250?{...i,transform:[1,0,0,1,i.transform[4]+40,i.transform[5]]}:i))])assert.equal(extractFacts([a,bad],sha).filter(f=>f.page===11).length,0);
});
test('row enumeration and subtotal qualifications normalize safely without merging different metrics',()=>{
 const p={page:1,text:'合并利润表\n人民币元\n2025年 2024年\n一、营业收入 |120 |100\n二、营业总收入 |140 |110\n四、净利润（净亏损以“-”号填列） |30 |20'};
 const facts=extractFacts([p],sha);
 const f={sourceId:sid(1),label:'净利润',year:2025,scope:'consolidated',unit:'元',value:'30'};
 const d=fs=>({answer:'',facts:fs,calculations:[],limitations:[],refused:false});
 assert.equal(reviewDraft(d([f]),facts).checks[0].ok,true);
 assert.equal(reviewDraft(d([{...f,label:'营业收入',value:'140'}]),facts).checks[0].ok,false);
 assert.equal(reviewDraft(d([{...f,label:'营业收入',value:'120'}]),facts).checks[0].ok,true);
});
test('a two-column header contradicting its stated table scope is not accepted',()=>{
 const facts=extractFacts([{page:1,text:'合并资产负债表\n单位：元 币种：人民币\n母公司\n2025年 2024年\n资产总计 |120 |100'}],sha);
 assert.equal(facts.length,0);
 const p1=page(10,[...header('合并资产负债表'),...rows(['无形资产','商誉','长期待摊费用'])]);
 const p2=page(11,[item('开发甲公司',20,820,120),item('母公司',20,750,80),...rows(['非流动资产合计','资产总计'])]);
 assert.equal(extractFacts([p1,p2],sha).filter(f=>f.page===11).length,0);
});
test('a structurally similar unnamed continuation cannot replace explicit prior units or years',()=>{
 const p1=page(10,[...header('合并资产负债表'),...rows(['无形资产','商誉','长期待摊费用'])]);
 for(const kind of ['unit','years','both']){
  const p2=page(11,header('合并资产负债表').filter(i=>i.str!=='合并资产负债表').map(i=>({...i,str:kind!=='years'&&i.str==='人民币元'?'人民币万元':kind!=='unit'&&i.str==='2025年'?'2023年':kind!=='unit'&&i.str==='2024年'?'2022年':i.str})).concat(rows(['非流动资产合计','资产总计'])));
  assert.equal(extractFacts([p1,p2],sha).filter(f=>f.page===11).length,0,kind);
 }
});
