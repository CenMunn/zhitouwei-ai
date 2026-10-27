import test from 'node:test';
import assert from 'node:assert/strict';
import {extractFacts,reviewDraft,buildAdoptedReport} from '../src/lib/filings/core.ts';
import {extractStatementBlocks} from '../src/lib/filings/statements.ts';

// Synthetic development fixtures. No V10 holdout content is imported.
const sha='a'.repeat(64),sourceId=`pdf:${sha}:p1`;
const item=(str,x,y,width=25)=>({str,transform:[10,0,0,10,x,y],width});
function fragmentedDates(){
 const items=[item('开发公司',20,820,100),item('合并资产负债表',20,790,150),item('人民币元',20,760,80)];
 for(const [year,start] of [['2025',300],['2024',424]]){
  let x=start;for(const [str,width] of [[year,21],['年',10.5],['12',10.5],['月',10.5],['31',10.5],['日',10.5]]){items.push(item(str,x,710,width));x+=width+2.6;}
 }
 for(let n=0;n<2;n++)items.push(item(['货币资金','资产总计'][n],20,650-n*25,120),item(String(130+n),380,650-n*25,28),item(String(100+n),504,650-n*25,28));
 return {page:1,text:items.map(i=>i.str).join('\n'),layoutItems:items,physicalPageDeclared:true};
}
test('glyph-separated full date remains the monetary column date',()=>{
 const fs=extractFacts([fragmentedDates()],sha);
 assert.equal(fs.length,4);assert.deepEqual(fs.slice(0,2).map(f=>f.period),['2025-12-31','2024-12-31']);
 const good={...fs[0],period:'2025-12-31'};
 assert.equal(reviewDraft(draft([good]),fs).checks[0].ok,true);
 for(const extra of [{period:'2025-06-30'},{scope:'parent'},{sourceId:`pdf:${'b'.repeat(64)}:p1`},{value:'131'}])assert.equal(reviewDraft(draft([{...good,...extra}]),fs).checks[0].ok,false);
});
function sparsePage(){
 const items=[item('开发公司',20,820,100),item('合并现金流量表',20,790,150),item('人民币元',20,760,80),item('2025年',300,710),item('2024年',420,710),item('销售商品收到的现金',20,650,160),item('130',312,650,28),item('100',432,650,28)];
 return {page:1,text:items.map(i=>i.str).join('\n'),layoutItems:items,physicalPageDeclared:true};
}
test('one complete body row supports an explicit full header, not an unproven continuation',()=>{
 const first=sparsePage();assert.equal(extractFacts([first],sha).length,2);
 const continuation={page:2,text:'',physicalPageDeclared:true,layoutItems:[item('开发公司',20,820,100),item('经营活动产生的现金流量净额',20,650,160),item('80',312,650,28),item('70',432,650,28)]};
 assert.equal(extractFacts([first,continuation],sha).filter(f=>f.page===2).length,0);
 const missing={...first,layoutItems:first.layoutItems.filter(i=>i.str!=='100')};assert.equal(extractFacts([missing],sha).length,0);
 const ambiguous={...first,layoutItems:[...first.layoutItems,item('110',470,650,20)]};assert.equal(extractFacts([ambiguous],sha).length,0);
});
const fact=(label,extra={})=>({sourceId,page:1,label,year:2025,period:'2025',scope:'consolidated',unit:'元',value:'120',...extra});
const draft=facts=>({answer:'未经验证的自由文字',facts,calculations:[],limitations:[],refused:false});
function adopt(fs,q,context={}){const d=draft(fs);return buildAdoptedReport(d,reviewDraft(d,fs,{question:q}),q,null,{sourceFacts:fs,...context});}
test('quoted scope is a scope, while an unknown quoted metric stays required',()=>{
 assert.deepEqual(adopt([fact('营业收入',{scope:'parent'})],'读取2025年度“本行”营业收入').coverage.missing,[]);
 assert.ok(adopt([fact('营业收入')],'读取2025年度“本行”营业收入').coverage.missing.some(s=>s.includes('母公司')));
 assert.ok(adopt([fact('营业收入')],'读取2025年度合并“自定义收入质量指数”').coverage.missing.some(s=>s.includes('自定义收入质量指数')));
});
test('explicit total-equity parentheses never merge parent equity or minority equity',()=>{
 const fs=[fact('所有者权益（或股东权益）合计',{period:'2025-12-31'})];
 assert.deepEqual(adopt(fs,'读取2025年末合并所有者权益合计，包含少数股东权益').coverage.missing,[]);
 for(const label of ['归属于母公司所有者权益合计','少数股东权益'])assert.ok(adopt([fact(label,{period:'2025-12-31'})],'读取2025年末合并所有者权益合计').coverage.missing.length);
});
test('explicit no-calculation clause does not require an unwanted difference',()=>{
 const fs=[fact('货币资金',{period:'2025-12-31'}),fact('期末现金及现金等价物余额',{period:'2025-12-31',value:'110'})];
 const a=adopt(fs,'读取2025年末合并货币资金与现金及现金等价物余额；无需计算差额，说明口径边界');
 assert.deepEqual(a.coverage.missing,[]);
 assert.ok(a.answerLines.some(s=>s.includes('不能直接互相替代')));
});
test('absent exact date is distinguished from unresolved source, without inventing a half-year value',()=>{
 const q='能否从主表直接读取2025年6月30日合并资产总计？指出实际时点与应补充报表';
 const fs=[fact('资产总计',{period:'2025-12-31'}),fact('资产总计',{year:2024,period:'2024-12-31'})];
 const block={name:'合并资产负债表',page:1,status:'parsed',columns:fs.map(({year,scope,period})=>({year,scope,period}))};
 const a=adopt(fs,q,{statementBlocks:[block]});
 assert.ok(a.answerLines.some(s=>s.includes('2025-12-31')&&s.includes('2024-12-31')&&s.includes('2025-06-30')));
 assert.ok(a.sourceAssessment.some(s=>s.state==='requested_period_not_in_resolved_columns'));
 assert.ok(adopt([],q,{statementBlocks:[{...block,status:'unresolved'}]}).sourceAssessment.every(s=>s.state!=='requested_period_not_in_resolved_columns'));
});
test('a two-line row label surrounding centred amounts keeps the full accounting identity',()=>{
 const p=sparsePage();p.layoutItems=p.layoutItems.filter(i=>i.transform[5]!==650);
 p.layoutItems.push(item('所有者权益（或股东权',20,656,140),item('益）合计',20,642,70),item('130',312,649,28),item('100',432,649,28));
 const fs=extractFacts([p],sha);assert.equal(fs.length,2);assert.equal(fs[0].label.replace(/\s/g,''),'所有者权益（或股东权益）合计');
 const broken={...p,layoutItems:p.layoutItems.filter(i=>i.str!=='益）合计')};assert.equal(extractFacts([broken],sha).length,0);
});
test('negative choices and included subcomponents are not separate requested amounts',()=>{
 assert.deepEqual(adopt([fact('基本每股收益（元/股）',{unit:'元/股'})],'读取2025年度合并基本每股收益，不取稀释每股收益').coverage.missing,[]);
 const fs=[fact('经营活动产生的现金流量净额'),fact('净利润',{value:'60'})];
 const d=draft(fs);d.calculations=[{label:'',operation:'ratio',operands:[0,1],value:'2',unit:'倍'}];
 const q='计算2025年合并经营现金流÷净利润，以倍数表示；净利润分母包含少数股东损益';
 assert.deepEqual(buildAdoptedReport(d,reviewDraft(d,fs,{question:q}),q).coverage.missing,[]);
 assert.deepEqual(adopt([fact('货币资金',{period:'2025-12-31'}),fact('期末现金及现金等价物余额',{period:'2025-12-31'})],'读取2025年末合并货币资金与现金及现金等价物余额；无需计算差額，说明口径边界').coverage.missing,[]);
});
test('explicit currency listing phrase is supported without accepting a foreign-currency contradiction',()=>{
 const p=sparsePage();p.layoutItems=p.layoutItems.map(i=>({...i,str:i.str==='人民币元'?'除特别注明外，以人民币百万元列示':i.str}));
 const fs=extractFacts([p],sha);assert.equal(fs.length,2);assert.ok(fs.every(f=>f.unit==='百万元'&&f.currency==='人民币'));
 const conflict={...p,layoutItems:[...p.layoutItems,item('币种：美元',20,740,90)]};assert.equal(extractFacts([conflict],sha).length,0);
});
test('half-year cash statements cannot become annual closing-date evidence',()=>{
 const p=sparsePage();p.layoutItems=p.layoutItems.map(i=>({...i,str:i.str==='2025年'?'2025年1-6月':i.str==='2024年'?'2024年1-6月':i.str==='销售商品收到的现金'?'期末现金及现金等价物余额':i.str}));
 const fs=extractFacts([p],sha);assert.ok(!fs.some(f=>f.period==='2025-12-31'));
 const c=fact('期末现金及现金等价物余额',{value:'130',period:'2025-12-31'});
 assert.equal(reviewDraft(draft([c]),fs,{question:'读取2025年12月31日合并期末现金及现金等价物余额'}).checks[0].ok,false);
 const unknown=sparsePage();unknown.layoutItems=unknown.layoutItems.map(i=>({...i,str:i.str==='销售商品收到的现金'?'期末现金及现金等价物余额':i.str}));
 assert.ok(!extractFacts([unknown],sha).some(f=>f.period?.endsWith('-12-31')));
});
test('joint-statement EPS permits one complete scope only, never synthesising bank EPS',()=>{
 const items=[item('开发银行',20,820,100),item('合并及银行利润表',20,790,160),item('人民币百万元',20,760,100),item('本集团',300,740),item('本行',500,740)];
 for(let c=0;c<4;c++)items.push(item(c%2?'2024年':'2025年',300+c*100,710));
 for(let r=0;r<3;r++){items.push(item('开发项目'+String.fromCharCode(65+r),20,650-r*25,120));for(let c=0;c<4;c++)items.push(item('100',320+c*100,650-r*25,28));}
 items.push(item('基本及稀释每股收益（人民币元）',20,530,210),item('0.8',320,530,28),item('0.7',420,530,28));
 const p={page:1,text:'',layoutItems:items,physicalPageDeclared:true};
 const eps=extractFacts([p],sha).filter(f=>/每股/.test(f.label));assert.deepEqual(eps.map(f=>[f.scope,f.year,f.value,f.unit]),[['consolidated',2025,'0.8','元/股'],['consolidated',2024,'0.7','元/股']]);
 const spaced={...p,layoutItems:items.map(i=>({...i,str:i.str.includes('基本及稀释')?'基本及稀释每 股 收 益（元）':i.str}))};
 const recovered=extractFacts([spaced],sha).filter(f=>/每股/.test(f.label.replace(/\s/g,'')));assert.equal(recovered.length,2);assert.ok(recovered.every(f=>f.unit==='元/股'));
 for(const unit of ['分','']){
  const bad={...p,layoutItems:items.map(i=>({...i,str:i.str.includes('基本及稀释')?`基本及稀释每股收益${unit?`（${unit}）`:''}`:i.str}))};assert.ok(!extractFacts([bad],sha).some(f=>/每股/.test(f.label)));
 }
 const crossed={...p,layoutItems:items.map(i=>i.str==='0.7'?{...i,transform:[10,0,0,10,520,530]}:i)};assert.ok(!extractFacts([crossed],sha).some(f=>/每股/.test(f.label)));
});
