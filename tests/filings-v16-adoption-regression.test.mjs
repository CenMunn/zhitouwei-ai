import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewDraft,buildAdoptedReport} from '../src/lib/filings/core.ts';
import {buildProtocolExport} from '../src/lib/filings/protocol.ts';
const f=(label,value='100',extra={})=>({sourceId:'pdf:dev:p9',page:9,label,value,year:2025,period:'2025',scope:'consolidated',unit:'元',currency:'人民币',tableTitle:'合并利润表',quote:label+' |100 |90',statementId:'dev:p9:pl',headerEvidence:[{sourceId:'pdf:dev:p9',page:9,relation:'own',text:'合并利润表 2025年度 2024年度 人民币元'}],...extra});
const draft=(facts,calculations=[])=>({answer:'UNVERIFIED FREE PROSE',facts,calculations,limitations:[],refused:false});
const adopt=(fs,q,d=draft(fs))=>buildAdoptedReport(d,reviewDraft(d,fs,{question:q}),q,'dev',{sourceFacts:fs});
const doc=fs=>({sha256:'dev',pages:[{page:9,text:'',physicalPageDeclared:true}],facts:fs});
test('年报来源年份不产生额外任务，但显式要求两年仍须交付两年',()=>{
 const fs=[f('交易性金融资产','90',{year:2024,period:'2024-12-31',tableTitle:'合并资产负债表'})];
 assert.deepEqual(adopt(fs,'依据公司2025年年度报告，取合并2024年末交易性金融资产。').coverage.missing,[]);
 assert.ok(adopt(fs,'依据公司2025年年度报告，分别取合并2025年末和2024年末交易性金融资产。').coverage.missing.some(s=>s.includes('2025')));
});
test('舍入和列公式说明不是第二个计算任务，缺少实际计算仍失败',()=>{
 const fs=[f('研发费用','120'),f('研发费用','100',{year:2024,period:'2024'})];
 const q='计算合并2025年度研发费用相对2024年度同比增长率。计算使用未提前舍入的Decimal操作数，仅最终结果ROUND_HALF_UP保留2位；列指定公式及各操作数。';
 const a=adopt(fs,q,draft(fs,[{label:'增长率',operation:'growth',operands:[0,1],value:'20.00',unit:'%'}]));
 assert.deepEqual(a.coverage.missing,[]);assert.equal(a.calculations.length,1);
 assert.ok(adopt(fs,q).coverage.missing.length>0);
});
test('主答案按题问坐标选择，不丢弃其他原始候选也不修改候选数值',()=>{
 const fs=[f('应收款项融资','120',{period:'2025-12-31',tableTitle:'合并资产负债表'}),f('应收款项融资','90',{year:2024,period:'2024-12-31',tableTitle:'合并资产负债表'})];
 for(const mode of ['single_model','current_evidence']){
  const q='取合并2025年末应收款项融资。',d=draft(fs),a=adopt(fs,q,d);
  const p=buildProtocolExport({id:'dev',sha256:'dev',mode,question:q,draft:d,adoptedReport:a},doc(fs));
  assert.equal(p.answer.value,'120');assert.equal(p.answer.period,'2025-12-31');assert.equal(p.answer.answerable_facts.length,2);
  const multiple=buildProtocolExport({id:'dev',sha256:'dev',mode,question:'分别取合并2025年末和2024年末应收款项融资。',draft:d,adoptedReport:a},doc(fs));
  assert.equal(multiple.answer.value,null);
 }
});
test('显式项下子项需要实际同表父子关系，不能任意删除指标限定',()=>{
 const parent=f('其他应收款','200',{period:'2025-12-31',tableTitle:'合并资产负债表'}),leaf=f('应收股利','100',{period:'2025-12-31',tableTitle:'合并资产负债表'});
 const d=draft([{...leaf,label:'其他应收款 其中：应收股利'}]),q='取合并2025年末其他应收款项下其中应收股利。';
 const r=reviewDraft(d,[parent,leaf],{question:q});assert.equal(r.checks[0].ok,true);
 assert.deepEqual(buildAdoptedReport(d,r,q,'dev',{sourceFacts:[parent,leaf]}).coverage.missing,[]);
 assert.equal(reviewDraft(d,[leaf],{question:q}).checks[0].ok,false);
 assert.equal(reviewDraft(d,[{...parent,label:'长期应收款'},leaf],{question:q}).checks[0].ok,false);
 assert.equal(reviewDraft(d,[parent,{...leaf,statementId:'different'}],{question:q}).checks[0].ok,false);
 assert.ok(adopt([leaf],'分别取合并2025年末其他应收款和应收股利。').coverage.missing.some(s=>s.includes('其他应收款')));
});
test('商誉净额不能推出原值准备与当期损失，缺证说明随导出保存',()=>{
 const fs=[f('商誉','100',{period:'2025-12-31',tableTitle:'合并资产负债表'})];
 const q='先报告合并2025年末商誉账面金额，再判断能否仅凭主表给出商誉原值、累计减值准备与本期减值损失。';
 const a=adopt(fs,q),p=buildProtocolExport({id:'dev',sha256:'dev',mode:'current_evidence',question:q,draft:draft(fs),adoptedReport:a},doc(fs));
 assert.equal(p.answer.status,'insufficient_evidence');assert.equal(p.answer.value,null);
 assert.match(p.answer.answer,/100/);assert.match(p.answer.answer,/附注/);assert.ok(p.answer.missing_evidence.length);assert.ok(p.answer.must_not_infer.some(s=>s.includes('商誉')));
 assert.deepEqual(adopt(fs,'取合并2025年末商誉账面金额。').coverage.missing,[]);
});
test('完整现金流项目中的资产名称不能被拆成另外两个任务',()=>{
 const fs=[f('购建固定资产、无形资产和其他长期资产支付的现金','120'),f('固定资产','800'),f('无形资产','900')];
 const a=adopt(fs,'报告合并2025年度购建固定资产、无形资产和其他长期资产支付的现金。',draft([fs[0]]));
 assert.deepEqual(a.coverage.missing,[]);assert.equal(a.answerLines.length,1);
 const p=buildProtocolExport({id:'dev',sha256:'dev',mode:'single_model',question:'报告合并2025年度购建固定资产、无形资产和其他长期资产支付的现金。',draft:draft(fs)},doc(fs));assert.equal(p.answer.value,'120');
});
for(const [metric,table,question,required] of [
 ['使用权资产','合并资产负债表','报告合并2025年末使用权资产，再判断能否仅凭主表确定全部租赁未来未折现付款额及逐年到期分布。','租赁'],
 ['研发费用','合并利润表','报告合并2025年度研发费用，再判断能否仅凭主表确定研发支出资本化金额及资本化率。','资本化'],
 ['分配股利、利润或偿付利息支付的现金','合并现金流量表','报告合并2025年度分配股利、利润或偿付利息支付的现金，再判断能否仅凭主表分离其中仅支付股利的现金总额。','股利'],
 ['实收资本（或股本）','合并资产负债表','报告合并2025年末实收资本（或股本）金额，再判断能否仅据此确定最后交易日总市值。','股价'],
 ['营业收入','合并利润表','报告合并2025年度营业收入，再判断能否仅凭主表确定美国地区营业收入金额。','地区'],
 ['支付的各项税费','合并现金流量表','报告合并2025年度支付的各项税费，再判断能否仅凭主表分离企业所得税现金支付额。','税种'],
 ['基本每股收益','合并利润表','报告合并2025年度基本每股收益，再判断能否用净利润除以已披露每股收益精确还原加权平均普通股股数，要求精确到股。','舍入'],
])test(`旧开发边界：${metric}保留金额并明确缺失依据`,()=>{
 const fs=[f(metric,'100',{tableTitle:table,...(table.endsWith('资产负债表')?{period:'2025-12-31'}:{})})],a=adopt(fs,question),p=buildProtocolExport({id:'dev',sha256:'dev',mode:'current_evidence',question,draft:draft(fs),adoptedReport:a},doc(fs));
 assert.match(p.answer.answer,/100/);assert.match(p.answer.must_not_infer.join(''),new RegExp(required));assert.ok(a.boundaryMissing.length);assert.equal(p.answer.status,'insufficient_evidence');assert.equal(p.answer.value,null);
 assert.equal(adopt(fs,`取合并2025年${table.endsWith('资产负债表')?'末':'度'}${metric}。`).boundaryMissing.length,0);
});
test('计算前的共享年度和指标仍约束净合计，顺序或单位错误仍拦截',()=>{
 const fs=[f('信用减值损失','3'),f('资产减值损失','-13')];
 const q='合并2025年度信用减值损失与资产减值损失均采用带符号原值，计算其净合计：信用减值损失+资产减值损失。输出人民币元。';
 const c={label:'净合计',operation:'sum',operands:[0,1],value:'-10',unit:'元'};
 assert.deepEqual(adopt(fs,q,draft(fs,[c])).coverage.missing,[]);
 assert.equal(adopt(fs,q,draft(fs,[{...c,value:'16'}])).calculations.length,0);
});
test('明确减法公式可核验，说明不排除的项目不产生额外交付任务',()=>{
 const fs=[f('流动资产合计','120',{period:'2025-12-31',tableTitle:'合并资产负债表'}),f('流动负债合计','100',{period:'2025-12-31',tableTitle:'合并资产负债表'}),f('货币资金','70'),f('短期借款','40')];
 const q='计算合并2025年末净营运资金，指定公式=流动资产合计-流动负债合计；本题不排除货币资金或短期借款。输出人民币元。';
 const c={label:'净营运资金',operation:'difference',operands:[0,1],value:'20',unit:'元'};
 const a=adopt(fs,q,draft(fs.slice(0,2),[c]));assert.deepEqual(a.coverage.missing,[]);assert.equal(a.calculations.length,1);
 assert.equal(adopt(fs,q,draft(fs.slice(0,2),[{...c,operands:[1,0],value:'-20'}])).calculations.length,0);
});
test('三类现金流短名公式已经逐项绑定时，不再报未知指标；未知操作数仍失败',()=>{
 const fs=[f('经营活动产生的现金流量净额','100'),f('投资活动产生的现金流量净额','-30'),f('筹资活动产生的现金流量净额','-10')];
 const q='计算合并2025年度三类活动净现金流合计，指定公式=经营净现金流+投资净现金流+筹资净现金流，输出人民币元。';
 const c={label:'合计',operation:'sum',operands:[0,1,2],value:'60',unit:'元'};
 assert.deepEqual(adopt(fs,q,draft(fs,[c])).coverage.missing,[]);
 assert.equal(adopt(fs,q.replace('筹资净现金流','未知净现金流'),draft(fs,[c])).calculations.length,0);
});
