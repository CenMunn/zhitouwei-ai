// Independent safe synthetic review cases. No PDFs, evaluation packs, APIs, or secrets.
import test from 'node:test';
import assert from 'node:assert/strict';
import {extractFacts,reviewDraft,buildAdoptedReport} from '../src/lib/filings/core.ts';
import {extractStatementBlocks} from '../src/lib/filings/statements.ts';
const f=(label,year,value,patch={})=>({sourceId:'pdf:synthetic-review:p1',page:1,label,year,value,period:String(year),scope:'consolidated',unit:'千元',currency:'人民币',...patch});
const render=(q,fs,calculations=[],blocks=[])=>{
 const d={refused:false,answer:'UNVERIFIED',limitations:[],facts:fs,calculations};
 return buildAdoptedReport(d,reviewDraft(d,fs,{question:q}),q,'review',{sourceFacts:fs,statementBlocks:blocks});
};
test('requested growth must not authorize another metric growth',()=>{
 const fs=[f('净利润',2025,'12'),f('净利润',2024,'10'),f('资产总计',2025,'120'),f('资产总计',2024,'100')];
 const cs=[{label:'irrelevant label',operation:'growth',operands:[0,1],value:'20',unit:'%'},{label:'irrelevant label',operation:'growth',operands:[2,3],value:'20',unit:'%'}];
 const r=render('计算2025年度合并净利润相对2024年度的同比增长率。',fs,cs);
 assert.equal(r.calculations.length,1,JSON.stringify(r.calculations));
});
test('requested difference must validate ordered second metric',()=>{
 const fs=[f('资产总计',2025,'120'),f('负债合计',2025,'80'),f('货币资金',2025,'10')];
 const cs=[{label:'资产负债差额',operation:'difference',operands:[0,2],value:'110',unit:'千元'}];
 const r=render('计算2025年度合并资产总计减去负债合计的差额。',fs,cs);
 assert.equal(r.calculations.length,0,JSON.stringify(r.calculations));
});
test('valid sum explicit formula is retained or explained as unsupported, never not_requested',()=>{
 const fs=[f('营业收入',2025,'120'),f('投资收益',2025,'10')];
 const cs=[{label:'ignored',operation:'sum',operands:[0,1],value:'130',unit:'千元'}];
 const r=render('计算2025年度合并营业收入与投资收益之和，唯一公式为营业收入+投资收益。',fs,cs);
 assert.equal(r.audit.excludedCalculations.some(c=>c.reason==='not_requested'),false,JSON.stringify(r.audit));
});
test('symbol-only explicit sum formula is requested even if the formula grammar remains unsupported',()=>{
 const fs=[f('营业收入',2025,'120'),f('投资收益',2025,'10')];
 const r=render('计算2025年度合并指标，唯一公式为营业收入+投资收益。',fs,[{label:'ignored',operation:'sum',operands:[0,1],value:'130',unit:'千元'}]);
 assert.equal(r.audit.excludedCalculations.some(c=>c.reason==='not_requested'),false,JSON.stringify(r.audit));
 if(!r.calculations.length)assert.ok(r.coverage.missing.some(s=>/公式|人工/.test(s)),JSON.stringify(r.coverage));
});
test('quoted subtraction formula is not registered as a financial metric',()=>{
 const fs=[f('资产总计',2025,'120'),f('负债合计',2025,'80')];
 const r=render('列出2025年度合并资产总计与负债合计，计算二者差额，唯一公式为“资产总计−负债合计”。',fs,[{label:'ignored',operation:'difference',operands:[0,1],value:'40',unit:'千元'}]);
 assert.equal(r.sourceAssessment.some(s=>s.metric.includes('−')),false,JSON.stringify(r.sourceAssessment));
 assert.equal(r.coverage.missing.some(s=>s.includes('资产总计−负债合计')),false,JSON.stringify(r.coverage));
});
test('deferred expenses remain balance-sheet family for source assessment',()=>{
 const fs=[f('货币资金',2025,'10',{period:'2025-12-31'})];
 const block={name:'合并资产负债表',page:1,status:'parsed',columns:[{year:2025,period:'2025-12-31',scope:'consolidated'}]};
 const r=render('读取2025年末合并“长期待摊费用”。',fs,[],[block]);
 assert.ok(r.sourceAssessment.some(s=>s.state==='table_present_unresolved_amount'),JSON.stringify(r.answerLines));
});
const item=(str,x,y,width=25)=>({str,transform:[10,0,0,10,x,y],width});
const row=(label,y,a='12',b='10')=>[item(label,20,y,150),item(a,320,y),item(b,420,y)];
function overlapPages(injected='投资收益'){
 const first=[item('合成甲股份有限公司',20,820,160),item('合并利润表',20,790,180),item('金额单位为人民币千元',20,760,180),item('2025年度',300,720),item('2024年度',400,720),...row('净利润',670),...row('归属于母公司股东的净利润',640),...row('基本每股收益（元/股）',610,'1','1')];
 const second=[item('合成甲股份有限公司',20,820,160),...row('净利润',760),...row('其他综合收益',730,'2','1'),...row(injected,700,'99','88')];
 return [{page:1,text:'',physicalPageDeclared:true,layoutItems:first},{page:2,text:'',physicalPageDeclared:true,layoutItems:second}];
}
test('net-profit overlap must not authorize unrelated operating gain as OCI',()=>{
 const pages=overlapPages(),blocks=extractStatementBlocks(pages,'synthetic-review');
 assert.equal(blocks[0].status,'parsed');
 assert.equal(blocks[1].status,'unresolved',JSON.stringify(blocks[1]));
 assert.equal(extractFacts(pages,'synthetic-review').some(f=>f.page===2&&f.label==='投资收益'),false);
});
test('narrow OCI credit-loss continuation remains valid while identity/anchors/overlap violations reject',()=>{
 const positive=overlapPages('金融资产信用损失准备');
 assert.equal(extractStatementBlocks(positive,'synthetic-review')[1].status,'parsed');
 const mutations=[
  ps=>{ps[1].layoutItems[0].str='合成乙股份有限公司';},
  ps=>{ps[1].page=3;},
  ps=>{ps[1].layoutItems.find(i=>i.str==='12').str='13';},
  ps=>{for(const i of ps[1].layoutItems)if(i.transform[4]>=300)i.transform[4]+=15;},
  ps=>{ps[1].layoutItems.push(item('附注说明',20,790,130));}
 ];
 for(const change of mutations){const ps=structuredClone(positive);change(ps);assert.equal(extractStatementBlocks(ps,'synthetic-review')[1].status,'unresolved');}
 for(const label of ['资产减值损失','资产处置收益','营业收入'])assert.equal(extractStatementBlocks(overlapPages(label),'synthetic-review')[1].status,'unresolved',label);
});
test('two group scope captions outside the monetary table are insufficient position evidence',()=>{
 const a=[item('合成甲股份有限公司',20,820,160),item('合并及公司资产负债表',20,790,200),item('金额单位为人民币千元',20,760,180),item('合并',20,740),item('公司',1000,740)];
 for(let c=0;c<4;c++)a.push(item(c%2?'2024年':'2025年',300+c*100,720));
 for(let r=0;r<3;r++){a.push(item(['货币资金','存货','资产总计'][r],20,650-r*25,120));for(let c=0;c<4;c++)a.push(item(String(100+c),320+c*100,650-r*25));}
 assert.equal(extractFacts([{page:1,text:'',layoutItems:a,physicalPageDeclared:true}],'synthetic-review').length,0);
});
test('same-issuer named caption fallback also requires group-column position evidence',()=>{
 const a=[item('合成甲股份有限公司',20,820,160),item('合并及公司资产负债表',20,790,200),item('金额单位为人民币千元',20,760,180),item('合成甲股份有限公司集团',20,740,200),item('合成甲股份有限公司',240,740,160)];
 for(let c=0;c<4;c++)a.push(item(c%2?'2024年':'2025年',300+c*100,720));
 for(let r=0;r<3;r++){a.push(item(['货币资金','存货','资产总计'][r],20,650-r*25,120));for(let c=0;c<4;c++)a.push(item(String(100+c),320+c*100,650-r*25));}
 assert.equal(extractFacts([{page:1,text:'',layoutItems:a,physicalPageDeclared:true}],'synthetic-review').length,0);
});

test('fact-only metric does not acquire a growth request from a different clause',()=>{
 const fs=[f('营业收入',2025,'120'),f('营业收入',2024,'100'),f('净利润',2025,'12'),f('净利润',2024,'10')];
 const cs=[{label:'ignored',operation:'growth',operands:[0,1],value:'20',unit:'%'},{label:'ignored',operation:'growth',operands:[2,3],value:'20',unit:'%'}];
 const r=render('列出2025年度合并营业收入。计算2025年度合并净利润相对2024年度的同比增长率。',fs,cs);
 assert.deepEqual(r.calculations.map(c=>c.operands),[[2,3]],JSON.stringify(r.calculations));
 assert.equal(r.coverage.missing.some(s=>s.includes('营业收入')&&s.includes('growth')),false,JSON.stringify(r.coverage));
});
test('explicit valid average denominator with three different period coordinates remains deliverable',()=>{
 const fs=[f('净利润',2025,'12'),f('资产总计',2024,'100',{period:'2024-12-31'}),f('资产总计',2025,'150',{period:'2025-12-31'})];
 const c={label:'ignored',operation:'average_denominator_ratio',operands:[0,1,2],value:'9.60',unit:'%'};
 const q='计算2025年度合并简化资产收益率，唯一公式为2025年度净利润÷((2024年末资产总计+2025年末资产总计)÷2)，最终保留两位。';
 const r=render(q,fs,[c]);
 assert.equal(r.calculations.length,1,JSON.stringify(r));
 assert.equal(r.coverage.missing.some(s=>s.includes('简化资产收益率计算未交付')),false,JSON.stringify(r.coverage));
 const bad=[fs[0],{...fs[1],period:'2024-01-01'},fs[2]];
 assert.equal(render(q,bad,[c]).calculations.length,0);
});
test('two explicitly scoped calculations do not authorize their Cartesian product',()=>{
 const fs=[f('净利润',2025,'12'),f('净利润',2024,'10'),f('营业收入',2025,'120',{scope:'parent'}),f('营业收入',2024,'100',{scope:'parent'}),f('净利润',2025,'24',{scope:'parent'}),f('净利润',2024,'20',{scope:'parent'}),f('营业收入',2025,'240'),f('营业收入',2024,'200')];
 const cs=Array.from({length:4},(_,i)=>({label:'ignored',operation:'growth',operands:[i*2,i*2+1],value:'20',unit:'%'}));
 const q='计算2025年度合并净利润相对2024年度的同比增长率；计算2025年度母公司营业收入相对2024年度的同比增长率。';
 const r=render(q,fs,cs);
 assert.deepEqual(r.calculations.map(c=>c.operands),[[0,1],[2,3]],JSON.stringify(r.calculations));
 assert.equal(r.coverage.missing.some(s=>s.includes('growth')),false,JSON.stringify(r.coverage));
});
test('single growth clause preserves each metric own year and scope',()=>{
 const fs=[f('净利润',2025,'12'),f('净利润',2024,'10'),f('营业收入',2024,'120',{scope:'parent'}),f('营业收入',2023,'100',{scope:'parent'})];
 const cs=[{label:'ignored',operation:'growth',operands:[0,1],value:'20',unit:'%'},{label:'ignored',operation:'growth',operands:[2,3],value:'20',unit:'%'}];
 const q='计算2025年度合并净利润和2024年度母公司营业收入各自相对上一年度的同比增长率。';
 const r=render(q,fs,cs);
 assert.deepEqual(r.calculations.map(c=>c.operands),[[0,1],[2,3]],JSON.stringify(r.calculations));
 assert.equal(r.coverage.missing.some(s=>s.includes('growth')),false,JSON.stringify(r.coverage));
});
