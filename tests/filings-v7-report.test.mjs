import test from 'node:test';import assert from 'node:assert/strict';
import {extractFacts,reviewDraft,buildAdoptedReport,renderReport} from '../src/lib/filings/core.ts';
const sha='d'.repeat(64),sourceId=`pdf:${sha}:p1`;
const f=(label,value,scope='consolidated',year=2025)=>({sourceId,page:1,label,value,scope,year,unit:'元',currency:'人民币'});
const d=(facts,calculations=[])=>({answer:'不得采用：股票必涨',facts,calculations,limitations:[],refused:false});
const context=(sourceFacts,statementBlocks)=>({sourceFacts,statementBlocks});
const adopt=(draft,facts,q,ctx)=>buildAdoptedReport(draft,reviewDraft(draft,facts,{question:q}),q,'fr_dev',ctx);
test('two requested scope ratios cannot be covered by only the parent ratio',()=>{
 const facts=[f('资产总计','100'),f('负债合计','20'),f('资产总计','80','parent'),f('负债合计','30','parent')];
 const q='列出2025年合并与母公司资产总计和负债合计，计算2025年两种范围资产负债率。';
 const a=adopt(d(facts,[{label:'比率',operation:'ratio',operands:[3,2],value:'37.5',unit:'%'}]),facts,q);
 assert.ok(a.coverage.missing.some(s=>s.includes('合并')&&s.includes('计算')));
});
test('arithmetically valid unrelated calculation does not satisfy the asked ratio',()=>{
 const facts=[f('资产总计','100'),f('负债合计','20')],q='计算2025年合并资产负债率';
 const a=adopt(d(facts,[{label:'资产负债率',operation:'ratio',operands:[0,1],value:'500',unit:'%'}]),facts,q);
 assert.ok(a.coverage.missing.some(s=>s.includes('资产负债率')&&s.includes('计算')));
});
test('source-supported metadata supplies currency, distinct revenue rows remain distinct',()=>{
 const src=extractFacts([{page:1,text:'合并利润表\n单位：元 币种：人民币\n2025年 2024年\n一、营业总收入 |140 |110\n其中：营业收入 |120 |100'}],sha);
 const a=adopt(d([f('其中：营业收入','120')]),src,'列出2025年合并营业收入并注明币种');
 assert.equal(a.facts[0]?.currency,'人民币');assert.equal(a.coverage.missing.length,0);
 const b=adopt(d([f('一、营业总收入','140')]),src,'列出2025年合并营业收入');
 assert.ok(b.coverage.missing.some(s=>s.includes('营业收入')));
});
test('cash-flow gap is specific and does not falsely claim a supplied unresolved table is absent',()=>{
 const q='根据本次资料给出2025年合并经营活动产生的现金流量净额；如果没有，请说明缺少什么，不要推测。';
 const empty=d([]);
 const absent=adopt(empty,[],q,context([],[{name:'合并资产负债表',page:1,status:'parsed'}]));
 assert.match(absent.answerLines.join(' '),/现金流量表/);assert.match(absent.answerLines.join(' '),/不能|无法/);
 const unresolved=adopt(empty,[],q,context([],[{name:'合并现金流量表',page:1,status:'unresolved',gap:'年度歧义'}]));
 assert.match(unresolved.answerLines.join(' '),/已出现|已提供|包含/);
 assert.ok(!unresolved.answerLines.join(' ').includes('未提供现金流量表'));
});
test('a parsed source amount omitted by the model is labelled as delivery gap rather than absent PDF',()=>{
 const q='列出2025年合并资产总计',sourceFacts=[f('资产总计','100')];
 const a=adopt(d([]),sourceFacts,q,context(sourceFacts,[{name:'合并资产负债表',page:1,status:'parsed'}]));
 assert.match(a.answerLines.join(' '),/来源.*已|原页.*已/);assert.match(a.answerLines.join(' '),/模型|交付|采用/);
});
test('year change direction is derived from verified operands even when the rounded result is zero',()=>{
 const facts=[f('营业收入','99.99999'),f('营业收入','100','consolidated',2024)],q='计算2025年度相对2024年度合并营业收入同比，保留两位小数';
 const a=adopt(d(facts,[{label:'增加',operation:'growth',operands:[0,1],value:'0',unit:'%'}]),facts,q);
 assert.match(a.answerLines.join(' '),/减少|下降/);assert.ok(!a.answerLines.join(' ').includes('增加'));
});
test('report renders canonical task response and currency without adopting raw speculative prose',()=>{
 const facts=[f('资产总计','100')],draft=d(facts),review=reviewDraft(draft,facts);
 const adoptedReport=buildAdoptedReport(draft,review,'列出2025年合并资产总计','fr_dev',context(facts,[{name:'合并资产负债表',page:1,status:'parsed'}]));
 const md=renderReport({id:'fr_dev',question:'列出2025年合并资产总计',companyName:'开发公司',mode:'current_evidence',sha256:sha,sourcePages:[1],createdAt:'2026-10-06',durationMs:1,draft,review,adoptedReport});
 assert.match(md,/任务回应/);assert.match(md,/币种/);assert.match(md,/人民币/);assert.ok(!md.includes('股票必涨'));
});
test('a valid conversion into the wrong target unit does not cover the requested conversion',()=>{
 const facts=[f('资产总计','100000000')],q='将2025年合并资产总计换算为万元';
 const a=adopt(d(facts,[{label:'换算',operation:'unit_conversion',operands:[0],value:'1',unit:'亿元'}]),facts,q);
 assert.ok(a.coverage.missing.some(s=>s.includes('转换')||s.includes('换算')||s.includes('unit_conversion')));
});
test('listing three years does not let an older growth answer cover the requested newer pair',()=>{
 const facts=[f('营业收入','120'),f('营业收入','100','consolidated',2024),f('营业收入','80','consolidated',2023)];
 const q='列出2025年、2024年、2023年合并营业收入，计算2025年相对2024年的营业收入同比。';
 const a=adopt(d(facts,[{label:'同比',operation:'growth',operands:[1,2],value:'25',unit:'%'}]),facts,q);
 assert.ok(a.coverage.missing.some(s=>s.includes('计算')));
 const b=adopt(d(facts,[{label:'同比',operation:'growth',operands:[0,1],value:'20',unit:'%'}]),facts,q);
 assert.equal(b.coverage.missing.length,0);
});
test('reversed percentage-point operands do not satisfy a net-margin change request',()=>{
 const facts=[f('净利润','20'),f('营业收入','100'),f('净利润','10','consolidated',2024),f('营业收入','100','consolidated',2024)];
 const q='列出2025年、2024年合并净利润和营业收入，计算净利率百分点变化。';
 const ratio={label:'本年比率',operation:'ratio',operands:[0,1],value:'20',unit:'%'};
 const a=adopt(d(facts,[ratio,{label:'变化',operation:'percentage_point_change',operands:[1,0,3,2],value:'-500',unit:'百分点'}]),facts,q);
 assert.ok(a.coverage.missing.some(s=>s.includes('计算')));
 const b=adopt(d(facts,[{label:'变化',operation:'percentage_point_change',operands:[0,1,2,3],value:'10',unit:'百分点'}]),facts,q);
 assert.equal(b.coverage.missing.length,0);
});
test('a percentage-point answer does not replace explicitly requested annual ratios',()=>{
 const facts=[f('净利润','20'),f('营业收入','100'),f('净利润','10','consolidated',2024),f('营业收入','100','consolidated',2024)];
 const q='列出2025年和2024年合并净利润与营业收入，计算2025年和2024年的净利率以及净利率变化的百分点。';
 const change={label:'变化',operation:'percentage_point_change',operands:[0,1,2,3],value:'10',unit:'百分点'};
 const a=adopt(d(facts,[change]),facts,q);assert.ok(a.coverage.missing.some(s=>s.includes('2025')&&s.includes('净利率')));assert.ok(a.coverage.missing.some(s=>s.includes('2024')&&s.includes('净利率')));
 const b=adopt(d(facts,[change,{label:'本年',operation:'ratio',operands:[0,1],value:'20',unit:'%'},{label:'上年',operation:'ratio',operands:[2,3],value:'10',unit:'%'}]),facts,q);assert.equal(b.coverage.missing.length,0);
});
