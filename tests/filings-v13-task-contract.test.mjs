import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewDraft,buildAdoptedReport} from '../src/lib/filings/core.ts';
const f=(label,year,value,period=String(year))=>({sourceId:'pdf:synthetic:p1',page:1,label,year,value,period,scope:'consolidated',unit:'千元',currency:'人民币'});
const render=(q,fs,calculations=[],blocks=[])=>{
 const d={refused:false,answer:'不能采用的自由文字',limitations:[],facts:fs,calculations};
 return buildAdoptedReport(d,reviewDraft(d,fs,{question:q}),q,'dev',{sourceFacts:fs,statementBlocks:blocks});
};
test('引号公式不能被登记为独立财务指标；缺少旧期分母必须定位到资产负债表',()=>{
 const fs=[f('净利润',2024,'10'),f('资产总计',2024,'100','2024-12-31')];
 const q='先列出2024年度净利润和2024年末资产总计，再判断能否按照“2024年度净利润÷((2023年末资产总计+2024年末资产总计)÷2)”计算简化资产收益率；合并范围。';
 const blocks=[{name:'合并利润表',page:1,status:'parsed',columns:[{year:2024,period:'2024',scope:'consolidated'}]},{name:'合并资产负债表',page:2,status:'parsed',columns:[{year:2024,period:'2024-12-31',scope:'consolidated'}]}];
 const r=render(q,fs,[],blocks);
 assert.equal(r.sourceAssessment.some(a=>a.metric.includes('÷')),false);
 assert.ok(r.sourceAssessment.some(a=>a.metric.includes('2023-12-31')&&a.metric.includes('资产总计')&&a.state==='requested_period_not_in_resolved_columns'));
 assert.equal(r.coverage.missing.some(v=>v.includes('2024-12-31合并净利润')),false);
});
test('没有请求计算时，合法但多余的增长率不进入最终报告；原始候选仍保留审计',()=>{
 const fs=[f('净利润',2025,'12'),f('净利润',2024,'10')];
 const r=render('列出2025年度与2024年度合并净利润，再判断是否由某管理措施造成。',fs,[{label:'增长',operation:'growth',operands:[0,1],value:'20',unit:'%'}]);
 assert.equal(r.calculations.length,0);
 assert.ok(r.audit.excludedCalculations.some(c=>c.originalIndex===0&&c.reason==='not_requested'));
 assert.equal(r.facts.length,2);
});
test('只请求增长率不顺便采用金额差额；明确请求两者才同时交付',()=>{
 const fs=[f('净利润',2025,'12'),f('净利润',2024,'10')],cs=[{label:'增长',operation:'growth',operands:[0,1],value:'20',unit:'%'},{label:'差额',operation:'difference',operands:[0,1],value:'2',unit:'千元'}];
 assert.deepEqual(render('计算2025年度合并净利润相对2024年度的同比增长率。',fs,cs).calculations.map(c=>c.operation),['growth']);
 assert.equal(render('计算2025年度合并净利润相对2024年度的同比增长率和差额。',fs,cs).calculations.length,2);
});
test('已解析表无母公司列，应明确范围未提供；未解析表不能冒充确定缺列',()=>{
 const fs=[f('现金',2025,'10','2025-12-31')];
 const q='列出2025年末合并现金，再判断是否能给出同日母公司现金。';
 const block={name:'合并资产负债表',page:1,status:'parsed',columns:[{year:2025,period:'2025-12-31',scope:'consolidated'}]};
 const r=render(q,fs,[],[block]);
 assert.ok(r.sourceAssessment.some(s=>s.state==='requested_scope_not_in_resolved_columns'));
 assert.equal(render(q,fs,[],[{...block,status:'unresolved'}]).sourceAssessment.some(s=>s.state==='requested_scope_not_in_resolved_columns'),false);
});
