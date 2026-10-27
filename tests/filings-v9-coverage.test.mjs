import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAdoptedReport,reviewDraft} from '../src/lib/filings/core.ts';

const sourceId=`pdf:${'9'.repeat(64)}:p1`;
const fact=(label,extra={})=>({sourceId,page:1,label,year:2025,scope:'consolidated',unit:'元',value:'120',...extra});
function adopt(facts,question,calculations=[],context={}){
 const draft={answer:'不可采用的猜测',facts,calculations,limitations:[],refused:false};
 return buildAdoptedReport(draft,reviewDraft(draft,facts,{question}),question,null,{sourceFacts:facts,...context});
}

test('current and noncurrent totals never collapse into total liabilities',()=>{
 for(const name of ['流动负债合计','非流动负债合计','流动资产合计','非流动资产合计']){
  const q=`列示2025年合并${name}`;
  assert.deepEqual(adopt([fact(name)],q).coverage.missing,[]);
  assert.ok(adopt([fact('负债合计')],q).coverage.missing.some(s=>s.includes(name)));
 }
});

test('negative replacement phrases do not introduce unrelated requirements',()=>{
 for(const suffix of ['不替换为2024年母公司营业收入','不是2024年母公司营业收入','请勿用2024年母公司营业收入替代','不能用2024年母公司营业收入替代']){
  const a=adopt([fact('净利润')],`列示2025年合并净利润，${suffix}。`);
  assert.deepEqual(a.coverage.missing,[],suffix);
  assert.ok(!a.answerLines.join(' ').includes('营业收入'));
 }
 assert.ok(adopt([fact('净利润')],'比较2025年合并净利润和营业收入').coverage.missing.some(s=>s.includes('营业收入')));
});

test('report publication year does not become the comparative metric year',()=>{
 const q='2025年报列示的2024年12月31日合并流动负债合计是多少';
 const a=adopt([fact('流动负债合计',{year:2024,period:'2024-12-31'})],q);
 assert.deepEqual(a.coverage.missing,[]);
 assert.equal(a.coverage.present.length,1);
 assert.ok(adopt([fact('流动负债合计',{period:'2025-12-31'})],q).coverage.missing.some(s=>s.includes('2024-12-31')));
});

test('explicit local years and scopes bind to their own metric',()=>{
 const fs=[fact('资产总计',{year:2024,period:'2024-12-31'}),fact('净利润',{scope:'parent',period:'2025'})];
 const q='列示2024年12月31日合并资产总计和2025年度母公司净利润';
 const a=adopt(fs,q);
 assert.deepEqual(a.coverage.missing,[]);
 assert.equal(a.coverage.present.length,2);
 assert.equal(a.answerLines.length,2);
 assert.ok(adopt([fs[0],fact('净利润',{scope:'consolidated'})],q).coverage.missing.some(s=>s.includes('母公司')));
});

test('shared year and scope prefixes still require all explicit combinations',()=>{
 const q='列示2025年、2024年合并与母公司资产总计和净利润';
 const a=adopt([fact('资产总计'),fact('净利润')],q);
 assert.equal(a.coverage.present.length,2);
 assert.equal(a.coverage.missing.length,6);
});

test('repeated metric requests retain each local date and scope without cross pairs',()=>{
 const q='列示2024年12月31日合并资产总计和2025年12月31日母公司资产总计';
 const fs=[fact('资产总计',{year:2024,period:'2024-12-31'}),fact('资产总计',{period:'2025-12-31',scope:'parent'})];
 assert.deepEqual(adopt(fs,q).coverage.missing,[]);
 assert.equal(adopt([fs[0]],q).coverage.missing.length,1);
});

test('ratio requirements bind each explicitly requested year and scope locally',()=>{
 const fs=[fact('负债合计',{year:2024,value:'60'}),fact('资产总计',{year:2024}),fact('负债合计',{scope:'parent',value:'30'}),fact('资产总计',{scope:'parent'})];
 const cs=[{label:'',operation:'ratio',operands:[0,1],value:'50',unit:'%'},{label:'',operation:'ratio',operands:[2,3],value:'25',unit:'%'}];
 for(const q of ['计算2024年合并资产负债率和2025年母公司资产负债率','计算2024年合并资产负债率，再计算2025年母公司资产负债率']){
  assert.deepEqual(adopt(fs,q,cs).coverage.missing,[]);
  assert.ok(adopt(fs,q,[cs[1]]).coverage.missing.some(s=>s.includes('2024')&&s.includes('合并')));
 }
});
test('implicit liquidity operands inherit the local formula coordinates without cross pairs',()=>{
 const fs=[fact('流动资产合计',{year:2024,value:'120'}),fact('流动负债合计',{year:2024,value:'60'}),fact('流动资产合计',{scope:'parent',value:'90'}),fact('流动负债合计',{scope:'parent',value:'30'})];
 const cs=[{label:'',operation:'ratio',operands:[0,1],value:'2',unit:'倍'},{label:'',operation:'ratio',operands:[2,3],value:'3',unit:'倍'}];
 const q='计算2024年合并流动比率和2025年母公司流动比率，以倍数回答';
 assert.deepEqual(adopt(fs,q,cs).coverage.missing,[]);
 assert.ok(adopt(fs.slice(0,2),q,[cs[0]]).coverage.missing.some(s=>s.includes('2025')&&s.includes('母公司')));
});

test('a verified joint EPS row covers both requests but a single basic row cannot',()=>{
 for(const label of ['基本及稀释每股收益（人民币元/股）','基本和稀释每股收益（元）']){
  const a=adopt([fact(label,{unit:'元/股'})],'列示2025年度合并基本及稀释每股收益');
  assert.deepEqual(a.coverage.missing,[]);
  assert.equal(a.coverage.present.length,2);
  assert.equal(a.answerLines.length,1);
 }
 const a=adopt([fact('基本每股收益',{unit:'元/股'})],'列示2025年度合并基本及稀释每股收益');
 assert.ok(a.coverage.missing.some(s=>s.includes('稀释每股收益')));
});

test('profit-only liquidity refusal identifies both balance sheet operands',()=>{
 const q='本题只有利润表，能否计算2025年末合并流动比率？请列明缺失数据与所需财务表';
 const a=adopt([],q,[],{statementBlocks:[{name:'合并利润表',page:1,status:'parsed'}]});
 assert.ok(a.answerLines.some(s=>s.includes('流动资产合计')&&s.includes('资产负债表')));
 assert.ok(a.answerLines.some(s=>s.includes('流动负债合计')&&s.includes('资产负债表')));
 assert.ok(!a.coverage.missing.some(s=>/年合并负债合计$/.test(s)));
 assert.ok(a.sourceAssessment.every(s=>s.state==='target_table_not_identified'));
});

test('unresolved balance sheet is not described as an absent source',()=>{
 const a=adopt([],'计算2025年合并流动比率',[],{statementBlocks:[{name:'合并资产负债表',page:1,status:'unresolved',gap:'表头不可读'}]});
 assert.equal(a.sourceAssessment.length,2);
 assert.ok(a.sourceAssessment.every(s=>s.state==='table_present_unresolved_amount'));
 assert.ok(!a.answerLines.some(s=>s.includes('未识别所问资产负债表')));
});

test('liquidity calculation coverage requires ordered operands and the requested date',()=>{
 const fs=[fact('流动资产合计',{value:'120',period:'2025-12-31'}),fact('流动负债合计',{value:'60',period:'2025-12-31'})];
 const q='计算2025年末合并流动比率，以倍数回答';
 const right={label:'',operation:'ratio',operands:[0,1],value:'2',unit:'倍'};
 assert.deepEqual(adopt(fs,q,[right]).coverage.missing,[]);
 for(const [facts,calculation] of [[fs,{...right,operands:[1,0],value:'0.5'}],[fs.map(f=>({...f,period:'2025-01-01'})),right],[[fact('资产总计'),fs[1]],right]]){
  assert.ok(adopt(facts,q,[calculation]).coverage.missing.some(s=>s.includes('流动比率')&&s.includes('计算')));
 }
});

test('slash cash flow ratio covers only the exact operating numerator and net-profit denominator',()=>{
 const fs=[fact('经营活动产生的现金流量净额',{value:'120'}),fact('净利润',{value:'60'})];
 const q='计算2025年度合并经营活动现金流量净额/合并净利润总额，以倍数回答';
 const c={label:'',operation:'ratio',operands:[0,1],value:'2',unit:'倍'};
 assert.deepEqual(adopt(fs,q,[c]).coverage.missing,[]);
 assert.ok(adopt([fact('投资活动产生的现金流量净额'),fs[1]],q,[c]).coverage.missing.some(s=>s.includes('计算')));
 assert.ok(adopt(fs,'计算2025年合并自定义经营质量指数',[c]).coverage.missing.some(s=>s.includes('公式')));
});
