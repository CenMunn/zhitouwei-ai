import test from 'node:test';import assert from 'node:assert/strict';
import {taskResponse} from '../src/lib/filings/task-response.ts';
const answer=q=>taskResponse(q,[],[],[],[],[],{}).answerLines.join(' ');
test('shareholder-equity wording preserves the regulatory capital evidence boundary',()=>{
 const text=answer('本集团股东权益合计是否足以计算资本充足率？');assert.match(text,/风险加权资产/);assert.match(text,/扣减|扣除/);assert.match(text,/不能/);
});
test('bank central-bank balances do not determine exact cash-equivalent balances',()=>{
 const text=answer('现金及存放中央银行款项能否直接当作同日现金及现金等价物余额？还需核对哪些资料？');assert.match(text,/不能.*精确金额|不能.*确定.*金额/);assert.match(text,/现金流量表/);assert.match(text,/受限/);
});
test('monetary-fund balances do not determine exact cash-equivalent balances',()=>{
 const text=answer('货币资金与现金及现金等价物余额能否直接相等替代？');assert.match(text,/不能.*精确金额|不能.*确定.*金额/);assert.match(text,/现金流量表/);
});

import {reviewDraft,buildAdoptedReport} from '../src/lib/filings/core.ts';
test('generic formula-formatting instructions neither invent nor mask an actual calculation',()=>{
 const sourceId='pdf:'+('a'.repeat(64))+':p1',facts=[{sourceId,label:'资产总计',year:2023,period:'2023-12-31',scope:'consolidated',unit:'元',value:'100'},{sourceId,label:'负债合计',year:2023,period:'2023-12-31',scope:'consolidated',unit:'元',value:'20'}];
 const run=(q,calculations=[])=>{const d={refused:false,answer:'',facts,calculations,limitations:[]};return buildAdoptedReport(d,reviewDraft(d,facts,{question:q}),q,'dev',{sourceFacts:facts});};
 const suffix='计算须列唯一指定公式、操作数与最终舍入；证据不足须说明。';
 assert.deepEqual(run('读取2023年12月31日合并资产总计；'+suffix).coverage.missing,[]);
 const q='列出2023年12月31日合并资产总计和负债合计，计算资产负债率；'+suffix;
 assert.ok(run(q).coverage.missing.some(s=>s.includes('资产负债率')));
 assert.deepEqual(run(q,[{label:'比率',operation:'ratio',operands:[1,0],value:'20',unit:'%'}]).coverage.missing,[]);
});

test('cash-equivalent amount questions preserve the boundary even without the word balance',()=>{
 const text=answer('报告货币资金；仅凭本输入能否确定同日现金及现金等价物的精确金额，能否将货币资金直接等同于该余额？');
 assert.match(text,/不能.*精确金额|不能.*确定.*金额/);assert.match(text,/现金流量表/);assert.match(text,/受限/);
});
import {positiveRequirements} from '../src/lib/filings/intent.ts';
test('report provenance in a comparison-column qualifier does not invent a second requested financial year',()=>{
 assert.equal(positiveRequirements('读取2022年度（2023表内比较列）合并信用减值损失'),'读取2022年度合并信用减值损失');
 assert.match(positiveRequirements('读取2022年度和2023年度合并信用减值损失'),/2022年度和2023年度/);
 assert.match(positiveRequirements('读取2022年度（2023年比较列）合并信用减值损失'),/2023年比较列/);
});
