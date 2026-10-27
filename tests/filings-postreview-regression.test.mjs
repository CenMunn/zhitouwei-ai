import test from 'node:test';
import assert from 'node:assert/strict';
import {extractFacts,reviewDraft,buildAdoptedReport} from '../src/lib/filings/core.ts';
import {positiveRequirements} from '../src/lib/filings/intent.ts';
import {buildProtocolExport} from '../src/lib/filings/protocol.ts';
const pages=(date='2023年12月31日',caption='2023年 |2022年',name='合并资产负债表')=>[{page:9,physicalPageDeclared:true,text:`开发公司\n${name}\n${date}\n金额单位：人民币元\n${caption}\n合同负债 |125 |90`}];
test('年度资产负债表独立完整表头日期绑定年份列并通过事实核验',()=>{
 const fs=extractFacts(pages(),'dev');assert.deepEqual(fs.map(f=>f.period),['2023-12-31','2022-12-31']);
 const d={answer:'原候选',facts:[{...fs[0],period:'2023-12-31'}],calculations:[],limitations:[],refused:false};
 assert.equal(reviewDraft(d,fs,{question:'取合并2023年末合同负债。'}).checks[0].ok,true);
});
test('无完整日期、非年末日期和明确日期列不被推成年末',()=>{
 assert.deepEqual(extractFacts(pages(''),'dev').map(f=>f.period),['2023','2022']);
 assert.deepEqual(extractFacts(pages('2023年6月30日'),'dev').map(f=>f.period),['2023','2022']);
 assert.deepEqual(extractFacts(pages('2023年12月31日','2023年6月30日 |2022年12月31日'),'dev').map(f=>f.period),['2023-06-30','2022-12-31']);
 assert.deepEqual(extractFacts(pages('2023年12月31日','2023年 |2022年','合并利润表'),'dev').map(f=>f.period),['2023','2022']);
});
test('不加与不改用不产生额外任务，肯定的多指标请求保留',()=>{
 assert.doesNotMatch(positiveRequirements('报告合并2023年末合同负债，不加预收款项。'),/预收款项/);
 assert.doesNotMatch(positiveRequirements('报告合并2023年度财务费用，保留原表正负，不改用利息费用。'),/利息费用/);
 assert.match(positiveRequirements('分别报告财务费用和利息费用。'),/利息费用/);
});
test('存货拆分缺证在导出状态中保留，单问账面额不被拒绝',()=>{
 const fs=[{sourceId:'pdf:dev:p9',page:9,label:'存货',value:'123',year:2023,period:'2023-12-31',scope:'consolidated',unit:'元',currency:'人民币',tableTitle:'合并资产负债表',quote:'存货 |123 |100',headerEvidence:[{sourceId:'pdf:dev:p9',page:9,relation:'own',text:'合并资产负债表 2023年12月31日 人民币元 2023年 2022年'}]}];
 const d={answer:'原候选不改写',facts:fs,calculations:[],limitations:[],refused:false};
 const q='报告合并2023年末存货账面金额，再判断能否仅凭主表分别确定存货原值和跌价准备。';
 const a=buildAdoptedReport(d,reviewDraft(d,fs,{question:q}),q,'dev',{sourceFacts:fs});
 const p=buildProtocolExport({id:'dev',sha256:'dev',mode:'current_evidence',question:q,draft:d,adoptedReport:a},{sha256:'dev',pages:[{page:9,text:'',physicalPageDeclared:true}],facts:fs});
 assert.equal(p.answer.status,'insufficient_evidence');assert.equal(p.answer.value,null);assert.match(p.answer.answer,/123/);assert.ok(p.answer.must_not_infer.some(s=>/存货/.test(s)));
 assert.equal(buildAdoptedReport(d,reviewDraft(d,fs), '取合并2023年末存货账面金额。','dev',{sourceFacts:fs}).boundaryMissing.length,0);
 assert.equal(d.answer,'原候选不改写');assert.equal(d.facts[0].value,'123');
});
for(const [label,table,period,q,term] of [
 ['无形资产','合并资产负债表','2023-12-31','报告合并2023年末无形资产账面金额，再判断能否拆出无形资产原值和累计摊销各是多少。','累计摊销'],
 ['利息费用','合并利润表','2023','报告合并2023年度利息费用，再判断能否据此精确确定借款的平均利率。','平均借款余额'],
])test(`${label}保留可答事实，附加判断缺证不得冒充确定值`,()=>{
 const fs=[{sourceId:'pdf:dev:p9',page:9,label,value:'123',year:2023,period,scope:'consolidated',unit:'元',currency:'人民币',tableTitle:table,quote:`${label} |123 |100`,headerEvidence:[{sourceId:'pdf:dev:p9',page:9,relation:'own',text:`${table} 2023年 2022年 人民币元`}]}];
 const d={answer:'候选',facts:fs,calculations:[],limitations:[],refused:false},a=buildAdoptedReport(d,reviewDraft(d,fs,{question:q}),q,'dev',{sourceFacts:fs});
 const p=buildProtocolExport({id:'dev',sha256:'dev',mode:'current_evidence',question:q,draft:d,adoptedReport:a},{sha256:'dev',pages:[{page:9,text:'',physicalPageDeclared:true}],facts:fs});
 assert.equal(p.answer.status,'insufficient_evidence');assert.equal(p.answer.value,null);assert.match(p.answer.answer,/123/);assert.match(p.answer.must_not_infer.join(''),new RegExp(term));
 const simple=`报告合并2023年${period.length>4?'末':'度'}${label}金额。`;
 assert.equal(buildAdoptedReport(d,reviewDraft(d,fs,{question:simple}),simple,'dev',{sourceFacts:fs}).boundaryMissing.length,0);
});
