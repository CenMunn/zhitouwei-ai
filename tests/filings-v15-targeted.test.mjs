import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewDraft,buildAdoptedReport} from '../src/lib/filings/core.ts';
import {buildProtocolExport} from '../src/lib/filings/protocol.ts';
import {extractStatementBlocks} from '../src/lib/filings/statements.ts';
import {nonNumericEpsCells} from '../src/lib/filings/source-state.ts';
const f=(label,value='100',extra={})=>({sourceId:'pdf:dev:p9',page:9,label,value,year:2025,period:'2025',scope:'parent',unit:'百万元',currency:'人民币',tableTitle:'母公司利润表',quote:label+' |100 |90',headerEvidence:[{sourceId:'pdf:dev:p9',page:9,relation:'own',text:'母公司利润表 2025年度 2024年度 人民币百万元'}],...extra});
const draft=(facts,calculations=[])=>({answer:'MODEL PROSE MUST NOT BE ADOPTED',facts,calculations,limitations:[],refused:false});
const adopt=(fs,q,d=draft(fs),blocks=[])=>buildAdoptedReport(d,reviewDraft(d,fs,{question:q}),q,'dev',{sourceFacts:fs,statementBlocks:blocks});
test('收益负号格式不得变成指标，中文未知指标仍保留缺口',()=>{
 const fs=[f('财务费用（收益以“-”号填列）','-12')];
 const a=adopt(fs,'取母公司2025年度财务费用（收益以“-”号填列），保留负号“-”。');
 assert.deepEqual(a.coverage.missing,[]);assert.match(a.answerLines.join(''),/-12/);
 assert.ok(adopt(fs,'取母公司2025年度财务费用和“未知收益”。').coverage.missing.some(s=>s.includes('未知收益')));
});
test('事实括注允许实际来源表名，错误表名或范围及实质限定词不能删',()=>{
 const s=f('资产总计','100',{scope:'consolidated',period:'2025-12-31',tableTitle:'合并资产负债表及资产负债表'});
 const base='资产总计（本集团，2025年12月31日，';
 assert.equal(reviewDraft(draft([{...s,label:base+'合并资产负债表）'}]),[s]).checks[0].ok,true);
 for(const name of ['合并利润表','母公司资产负债表','合并资产负债表，表列数'])assert.equal(reviewDraft(draft([{...s,label:base+name+'）'}]),[s]).checks[0].ok,false);
 assert.equal(reviewDraft(draft([{...s,label:'资产总计（本行，2025年12月31日，合并资产负债表）'}]),[s]).checks[0].ok,false);
});
test('现金题定短名匹配双向流量原行，不新增现金指标且不接受集团代本行',()=>{
 const fs=[f('经营活动产生╱（使用）的现金流量净额','100'),f('投资活动使用的现金流量净额','-30'),f('筹资活动（使用）╱产生的现金流量净额','-10'),f('汇率变动对现金及现金等价物的影响','-2'),f('现金及现金等价物净增加额','58'),f('现金','999')];
 const q='复算本行2025年度现金及现金等价物净增加额，指定公式=经营净现金流+投资净现金流+筹资净现金流+汇率变动影响，均按带符号数相加；输出人民币百万元。';
 const c={label:'untrusted',operation:'sum',operands:[0,1,2,3],value:'58',unit:'百万元'},a=adopt(fs,q,draft(fs,[c]));
 assert.equal(a.calculations.length,1);assert.deepEqual(a.coverage.missing,[]);
 assert.equal(adopt(fs,q,draft(fs,[{...c,operands:[1,0,2,3]}])).calculations.length,0);
 const group=fs.map(s=>({...s,scope:'consolidated'}));assert.equal(adopt(group,q,draft(group,[c])).calculations.length,0);
});
const epsBlock=(cell='—')=>({id:'pdf:dev:p9:s1',name:'合并利润表及利润表',page:9,status:'parsed',columns:[{year:2025,period:'2025',scope:'consolidated'},{year:2024,period:'2024',scope:'consolidated'},{year:2025,period:'2025',scope:'parent'},{year:2024,period:'2024',scope:'parent'}],rows:[{text:`基本每股收益 |1.20 |1.10 |${cell} |—`,unitEvidence:'每股收益（人民币元）'}],headerEvidence:[{sourceId:'pdf:dev:p9',page:9,relation:'own',text:'合并利润表及利润表 本集团 本行 2025年 2024年 2025年 2024年'}]});
test('母公司EPS横杠是来源支持的非金额边界，不能写零或借用集团数',()=>{
 const fs=[f('基本每股收益','1.20',{scope:'consolidated',unit:'元/股'})],q='先报告本集团2025年度基本每股收益，再判断本行2025年度基本每股收益能否提供数值。',b=epsBlock(),a=adopt(fs,q,draft(fs),[b]);
 assert.match(a.answerLines.join(''),/横杠/);assert.match(a.answerLines.join(''),/不能.*0/);assert.match(a.answerLines.join(''),/不能.*(?:集团|范围).*替代/);
 assert.equal(a.sourceAssessment.find(s=>s.metric.includes('母公司')).state,'source_cell_non_numeric');
 assert.equal(a.facts.length,1);assert.equal(a.answerVerified,false);
 const p=buildProtocolExport({id:'dev',mode:'current_evidence',sha256:'dev',draft:draft(fs),adoptedReport:a},{sha256:'dev',pages:[{page:9,text:'',physicalPageDeclared:true}],facts:fs,statementBlocks:[b]});
 assert.ok(p.answer.evidence.some(e=>e.data_rows.some(r=>r.includes('|—'))));assert.equal(p.answer.status,'insufficient_evidence');
});
test('不明确EPS列或缺来源行不得断言横杠，坐标空白必须有完整列绑定',()=>{
 const fs=[],q='本行2025年度基本每股收益能否提供数值。';
 for(const b of [{...epsBlock(),status:'unresolved'},epsBlock('1.3'),{...epsBlock(),rows:[]}]){
  const a=adopt(fs,q,draft(fs),[b]);assert.deepEqual(a.boundaryEvidence,[]);assert.doesNotMatch(a.answerLines.join(''),/对应列为(?:横杠|空白)/);
 }
 const b={...epsBlock(),rows:[{label:'基本每股收益',text:'基本每股收益 |1.20 |1.10 | |—',cells:['1.20','1.10',null,'—']}]};
 assert.match(adopt(fs,q,draft(fs),[b]).answerLines.join(''),/空白/);
});
test('OCI资产负债表存量差不交付成年度流量，保留明确缺证与禁止推断',()=>{
 const fs=[f('其他综合收益','100',{scope:'consolidated',period:'2025-12-31',tableTitle:'合并资产负债表'}),f('其他综合收益','70',{scope:'consolidated',year:2024,period:'2024-12-31',tableTitle:'合并资产负债表'})];
 const q='先报告合并2025年末其他综合收益余额，再判断能否将2025年末与2024年末该余额差额当作2025年度其他综合收益税后净额。';
 const a=adopt(fs,q,draft(fs,[{label:'自由解释',operation:'difference',operands:[0,1],value:'30',unit:'百万元'}]));
 assert.match(a.answerLines.join(''),/余额差额不能直接.*年度/);assert.match(a.answerLines.join(''),/所有者权益变动表/);assert.ok(a.coverage.missing.some(s=>/期间发生额/.test(s)));assert.doesNotMatch(a.answerLines.join(''),/MODEL PROSE/);
 assert.doesNotMatch(adopt(fs,'取合并2025年末其他综合收益余额。').answerLines.join(''),/余额差额不能直接/);
});
test('真实联名表标题可完整保留在括注，不能仅支持旧题中的标题缩写',()=>{
 const s=f('资产总计','100',{scope:'parent',period:'2025-12-31',tableTitle:'合并资产负债表及资产负债表'});
 assert.equal(reviewDraft(draft([{...s,label:'资产总计（本行，2025年12月31日，合并资产负债表及资产负债表）'}]),[s]).checks[0].ok,true);
});
test('同一EPS坐标有横杠及数值的冲突行时不得断言非金额状态',()=>{
 const b=epsBlock();b.rows.push({text:'基本每股收益 |1.20 |1.10 |0.80 |0.70'});
 const a=adopt([],'本行2025年度基本每股收益能否提供数值。',draft([]),[b]);
 assert.equal(a.boundaryEvidence.length,0);assert.doesNotMatch(a.answerLines.join(''),/对应列为横杠/);
});
test('文本EPS行的多余数值不能作为附注删除后错绑横杠列',()=>{
 const prefix='示例公司\n母公司利润表\n单位：人民币百万元\n2025年度 2024年度\n';
 const blocks=row=>extractStatementBlocks([{page:9,physicalPageDeclared:true,text:prefix+row}],'dev');
 for(const extra of ['1.20','12','(1.20)']){
  const source=blocks(`基本每股收益（元/股） |${extra} |— |0.90`);
  assert.equal(source[0].status,'parsed');assert.deepEqual(nonNumericEpsCells(source),[]);
  assert.deepEqual(adopt([],'本行2025年度基本每股收益能否提供数值。',draft([]),source).boundaryEvidence,[]);
 }
 const valid=nonNumericEpsCells(blocks('基本每股收益（元/股） |— |0.90'));
 assert.equal(valid.length,1);assert.equal(valid[0].year,2025);assert.equal(valid[0].state,'dash');
});
