import test from 'node:test';
import assert from 'node:assert/strict';
import {extractFacts,reviewDraft,buildAdoptedReport,renderReport} from '../src/lib/filings/core.ts';
import {extractStatementBlocks} from '../src/lib/filings/statements.ts';
import {stripNote} from '../src/lib/filings/labels.ts';
const item=(str,x,y,width=25)=>({str,transform:[10,0,0,10,x,y],width});
function page(joint=false){
 const a=[item('开发甲股份有限公司',20,820,160),item(joint?'合并资产负债表及资产负债表':'合并利润表',20,790,230),item('金额单位为人民币千元',20,760,180)];
 for(let c=0;c<(joint?4:2);c++){a.push(item(c%2?'2024年度':'2025年度',300+c*100,720));if(joint)a.push(item(c<2?'本集团':'本行',300+c*100,740));}
 for(let r=0;r<3;r++){a.push(item(['资产总计','负债合计','净利润'][r],20,650-r*30,120));for(let c=0;c<(joint?4:2);c++)a.push(item(String(100+r+c),320+c*100,650-r*30));}
 return {page:9,uploadedPage:1,text:'文本解析行不含坐标分隔符',layoutItems:a,physicalPageDeclared:true};
}
test('联名报表的及连接词须解析四列，范围错位仍拒绝',()=>{
 const p=page(true),fs=extractFacts([p],'dev');assert.equal(fs.length,12);
 assert.deepEqual(fs.slice(0,4).map(f=>f.scope),['consolidated','consolidated','parent','parent']);
 p.layoutItems=p.layoutItems.map(i=>i.str==='本行'?{...i,transform:[10,0,0,10,100,i.transform[5]]}:i);
 assert.equal(extractFacts([p],'dev').length,0);
});
test('实际坐标表头及数据行随核验事实保留到最终报告',()=>{
 const p=page(),blocks=extractStatementBlocks([p],'dev'),fs=extractFacts([p],'dev');
 const source=fs.find(f=>f.label==='净利润'&&f.year===2025);
 assert.ok(source?.headerEvidence?.some(e=>e.text.includes('2025年度')));
 const draft={answer:'UNVERIFIED',facts:[source],calculations:[],limitations:[],refused:false};
 const review=reviewDraft(draft,fs),a=buildAdoptedReport(draft,review,'列出2025年度合并净利润','dev',{sourceFacts:fs,statementBlocks:blocks});
 assert.deepEqual(a.facts[0].headerEvidence,source.headerEvidence);
 assert.equal(a.facts[0].quote,source.quote);
 const md=renderReport({id:'dev',question:'列出2025年度合并净利润',mode:'current_evidence',companyName:'开发甲',sha256:'dev',createdAt:'synthetic',draft,review,adoptedReport:a,durationMs:0,sourcePageMap:[{sourceId:'pdf:dev:p9',uploadedPage:1,originalPage:9}]});
 assert.match(md,/2025年度/);assert.match(md,/金额单位为人民币千元/);assert.doesNotMatch(md,/UNVERIFIED/);
});
test('居中金额行只有中文附注时须绑定上下折行标签',()=>{
 const p=page();p.layoutItems=p.layoutItems.filter(i=>i.transform[5]!==620);
 p.layoutItems.push(item('资产处置收益（损失以',20,627,160),item('五、54',240,620,35),item('12',320,620),item('(10)',420,620),item('“-”号填列）',20,613,120));
 const fs=extractFacts([p],'dev');assert.ok(fs.some(f=>f.label.includes('资产处置收益')&&f.value==='-10'));
});
const f=(label,value,period)=>({sourceId:'pdf:dev:p1',page:1,label,value,period,year:2025,scope:'consolidated',unit:'元',currency:'人民币'});
test('期初现金加四类当年流量允许勾稽；错年错量仍拒绝',()=>{
 const fs=[f('期初现金及现金等价物余额','100','2025-01-01'),f('经营活动产生的现金流量净额','20','2025'),f('投资活动产生的现金流量净额','-8','2025'),f('筹资活动产生的现金流量净额','-4','2025'),f('汇率变动对现金及现金等价物的影响','-1','2025')];
 const c={label:'现金勾稽',operation:'sum',operands:[0,1,2,3,4],value:'107',unit:'元'},d={facts:fs,calculations:[c],answer:'',limitations:[],refused:false};
 assert.equal(reviewDraft(d,fs).checks.at(-1).ok,true);
 assert.equal(reviewDraft({...d,calculations:[{...c,value:'108'}]},fs).checks.at(-1).ok,false);
 const bad=fs.map((v,i)=>i===4?{...v,year:2024,period:'2024'}:v);
 assert.equal(reviewDraft({...d,facts:bad},bad).checks.at(-1).ok,false);
});
test('损失填列符号不是待交付指标；真正未知指标仍须指出缺口',()=>{
 const fs=[f('资产处置收益','10','2025')],d={facts:fs,calculations:[],answer:'',limitations:[],refused:false};
 const a=buildAdoptedReport(d,reviewDraft(d,fs),'读取2025年度合并资产处置收益（损失以“-”号填列）。','dev',{sourceFacts:fs});
 assert.equal(a.coverage.missing.some(s=>s.includes('-')),false);
 const b=buildAdoptedReport(d,reviewDraft(d,fs),'读取2025年度合并“未知协议资产”。','dev',{sourceFacts:fs});
 assert.ok(b.coverage.missing.some(s=>s.includes('未知协议资产')));
});
test('同一坐标行被分割的公司年报页眉可证实续表主体，异名仍拒绝',()=>{
 const p=page();p.layoutItems[0].str='开发甲股份有限公司2025';p.layoutItems[0].width=185;
 p.layoutItems.push(item('年年度报告',210,820,90));p.layoutItems[1].str='合并资产负债表';
 p.layoutItems=p.layoutItems.map(i=>i.str==='净利润'?{...i,str:'资产总计'}:i);
 const q={page:10,text:'',physicalPageDeclared:true,layoutItems:[item('开发甲股份有限公司2025',20,820,185),item('年年度报告',210,820,90),item('流动负债：',20,760,100),item('短期借款',20,650,120),item('20',320,650),item('18',420,650),item('负债合计',20,620,120),item('30',320,620),item('25',420,620)]};
 assert.equal(extractStatementBlocks([p,q],'dev')[1].status,'parsed');
 q.layoutItems[0].str='开发乙股份有限公司2025';
 assert.equal(extractStatementBlocks([p,q],'dev')[1].status,'unresolved');
});
const adopted=(q,fs,cs)=>{const d={facts:fs,calculations:cs,answer:'UNVERIFIED',limitations:[],refused:false};return buildAdoptedReport(d,reviewDraft(d,fs,{question:q}),q,'dev',{sourceFacts:fs});};
test('计算格式约定不制造伪任务，毛利率正确复合公式仍交付',()=>{
 const fs=[f('一、营业收入','100','2025'),f('二、减：营业成本','80','2025')];
 const c={label:'untrusted',operation:'difference_ratio',operands:[0,1,0],value:'20',unit:'%'};
 const q='计算使用未提前舍入的Decimal操作数，仅最终结果ROUND_HALF_UP保留2位；须列指定公式及各操作数。计算合并2025年度毛利率，指定公式=(营业收入-营业成本)/营业收入×100%，输出%。';
 const a=adopted(q,fs,[c]);assert.equal(a.calculations.length,1);assert.deepEqual(a.coverage.missing,[]);
});
test('指定加总公式仅采用RHS操作数，不把结果指标当成第三个输入',()=>{
 const fs=[f('归属于母公司股东的净利润','12','2025'),f('少数股东损益','-2','2025')];
 const c={label:'untrusted',operation:'sum',operands:[0,1],value:'10',unit:'元'};
 const q='复算合并2025年度净利润，指定公式=归属于母公司股东的净利润+少数股东损益，按带符号数相加。';
 const a=adopted(q,fs,[c]);assert.equal(a.calculations.length,1);assert.deepEqual(a.coverage.missing,[]);
 assert.equal(adopted(q,[...fs,f('货币资金','-2','2025')],[{...c,operands:[0,2]}]).calculations.length,0);
});
test('现金勾稽公式的五个指定角色全部满足才交付结果',()=>{
 const fs=[f('年初现金及现金等价物余额','100','2025-01-01'),f('经营活动产生的现金流量净额','20','2025'),f('投资活动使用的现金流量净额','-8','2025'),f('筹资活动使用的现金流量净额','-4','2025'),f('四、汇率变动对现金及现金等价物的影响','-1','2025')];
 const c={label:'untrusted',operation:'sum',operands:[0,1,2,3,4],value:'107',unit:'元'};
 const q='复算合并2025年年末现金及现金等价物余额，指定公式=年初现金及现金等价物余额+经营净现金流+投资净现金流+筹资净现金流+汇率变动影响，输出元。';
 assert.equal(adopted(q,fs,[c]).calculations.length,1);
 assert.equal(adopted(q,fs,[{...c,operands:[0,1,2,3],value:'108'}]).calculations.length,0);
});
test('显式比例公式决定有序操作数和输出单位，不能交付倍数冒充百分比',()=>{
 const fs=[f('负债合计','80','2025-12-31'),f('资产总计','100','2025-12-31')];
 const c={label:'untrusted',operation:'ratio',operands:[0,1],value:'80',unit:'%'};
 const q='计算合并2025年末负债占资产比例，指定公式=负债合计/资产总计×100%，输出%。';
 assert.equal(adopted(q,fs,[c]).calculations.length,1);
 assert.equal(adopted(q,fs,[{...c,value:'0.8',unit:'倍'}]).calculations.length,0);
});
test('按指定公式计算较新年度减旧年度，不将“不计算增长率”当作增长请求',()=>{
 const fs=[f('其他综合收益税后净额','-5','2025'),{...f('其他综合收益税后净额','3','2024'),year:2024}];
 const c={label:'untrusted',operation:'difference',operands:[0,1],value:'-8',unit:'元'};
 const q='计算合并其他综合收益税后净额从2024年度到2025年度的带符号差额；指定公式=2025年度其他综合收益税后净额-2024年度其他综合收益税后净额，输出元，不计算增长率。';
 const a=adopted(q,fs,[c]);assert.equal(a.calculations.length,1);assert.deepEqual(a.coverage.missing,[]);
});
test('指定加总不能用年末代替年中，也不能用元冒充要求的万元',()=>{
 const fs=[f('资产总计','100','2025-12-31'),f('负债合计','80','2025-12-31')],c={label:'sum',operation:'sum',operands:[0,1],value:'180',unit:'元'};
 assert.equal(adopted('计算合并2025年6月30日资产总计与负债合计之和，指定公式=资产总计+负债合计，输出元。',fs,[c]).calculations.length,0);
 const gs=[f('归属于母公司股东的净利润','12000','2025'),f('少数股东损益','-2000','2025')];
 const a=adopted('复算合并2025年度净利润，指定公式=归属于母公司股东的净利润+少数股东损益，输出万元。',gs,[{...c,value:'10000'}]);
 assert.equal(a.calculations.length,0);assert.ok(a.coverage.missing.length);
});
test('窄金额列前的现金流折行保留完整指标，数字括注附注不进入指标名',()=>{
 const p=page();p.layoutItems=p.layoutItems.filter(i=>i.transform[5]!==620);
 p.layoutItems.push(item('经营活动产生╱（使用）的现金',20,631,150),item('流量净额',30,620,70),item('46(1)',240,620,35),item('12',320,620),item('(10)',420,620));
 assert.equal(stripNote('年末现金及现金等价物余额 46(2)'),'年末现金及现金等价物余额');
 const fs=extractFacts([p],'dev');assert.ok(fs.some(f=>f.label==='经营活动产生╱（使用）的现金流量净额'&&f.value==='-10'));
});
test('每股收益章节显式元单位可限定子行，不能从百万元表头推测或补母公司空值',()=>{
 const p=page(true);p.layoutItems[1].str='合并利润表及利润表';p.layoutItems[2].str='金额单位为人民币百万元';
 p.layoutItems.push(item('八、每股收益（人民币元）',20,570,180));
 for(const [label,y] of [['（一）基本每股收益',550],['（二）稀释每股收益',530]]){p.layoutItems.push(item(label,20,y,150));for(let c=0;c<4;c++)p.layoutItems.push(item(c<2?'1.20':'—',320+c*100,y));}
 const fs=extractFacts([p],'dev').filter(f=>/基本|稀释/.test(f.label));assert.equal(fs.length,4);assert.ok(fs.every(f=>f.unit==='元/股'&&f.scope==='consolidated'&&f.unitEvidence?.includes('人民币元')));
 p.layoutItems=p.layoutItems.filter(i=>i.transform[5]!==570);assert.equal(extractFacts([p],'dev').some(f=>/基本|稀释/.test(f.label)),false);
});


test('每股收益单位不从同页右侧独立文本区借入',()=>{
 const p=page(true);p.layoutItems[1].str='合并利润表及利润表';p.layoutItems[2].str='金额单位为人民币百万元';
 p.layoutItems.push(item('八、每股收益（人民币元）',750,570,180),item('（一）基本每股收益',20,550,150),item('1.20',320,550),item('1.20',420,550),item('—',520,550),item('—',620,550));
 assert.equal(extractFacts([p],'dev').some(f=>/基本每股收益/.test(f.label)),false);
});
