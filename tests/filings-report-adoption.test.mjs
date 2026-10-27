import test from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../src/lib/filings/core.ts';
import {buildFilingRequest} from '../src/lib/filings/model.ts';
const sha='a'.repeat(64),sourceId=`pdf:${sha}:p188`;
const fact=(label,value,extra={})=>({sourceId,label,value,year:2025,scope:'consolidated',unit:'元',...extra});
const draft=(facts=[],extra={})=>({answer:'',facts,calculations:[],limitations:[],refused:false,...extra});
function adopted(d,source,q='列出2025年合并资产总计'){
  assert.equal(typeof core.buildAdoptedReport,'function');
  return core.buildAdoptedReport(d,core.reviewDraft(d,source,{question:q}),q,'fr_development');
}
const run=(d,q='列出2025年合并资产总计')=>({id:'fr_development',question:q,mode:'current_evidence',companyName:'开发公司',sha256:sha,sourcePages:[188],createdAt:'2026-10-06',draft:d,review:core.reviewDraft(d,d.facts,{question:q}),durationMs:1});
test('old unsupported profit and cash classifications never enter adopted conclusions or MD',()=>{
  for(const answer of ['净利润与归母净利润必然不同。','财务公司存款属于非经营性因素。','总市值即流通市值，未来股价必涨。']){
    const f=fact('资产总计','100'),d=draft([f],{answer,limitations:[answer]});
    const a=adopted(d,[f]);assert.ok(!JSON.stringify(a).includes(answer));
    assert.ok(!core.renderReport(run(d)).includes(answer));assert.equal(d.answer,answer);
  }
});
test('contradicting raw prose cannot replace verified figures and raw draft remains intact',()=>{
  const f=fact('资产总计','100'),d=draft([f],{answer:'资产总计为999元。'}),a=adopted(d,[f]);
  assert.equal(a.facts[0].value,'100');assert.ok(!JSON.stringify(a).includes('999'));
  assert.equal(d.answer,'资产总计为999元。');assert.equal(a.runId,'fr_development');
  assert.equal(a.semanticReview,'pending');assert.equal(a.answerVerified,false);
});
test('unchecked calculation labels cannot smuggle a false classification into the final report',()=>{
  const f=[fact('资产总计','100'),fact('负债合计','20')];
  const d=draft(f,{calculations:[{label:'股价必涨的净利率',operation:'ratio',operands:[1,0],value:'20',unit:'%'}]});
  const a=adopted(d,f,'计算2025年合并资产负债率');
  assert.equal(a.calculations.length,1);assert.ok(!JSON.stringify(a).includes('股价必涨'));
  assert.match(a.calculations[0].label,/负债合计.*资产总计/);
});
test('accepted calculation operands are remapped after a rejected fact and reference the same snapshot',()=>{
  const a=fact('资产总计','100'),b=fact('负债合计','20'),wrong=fact('资产总计','999');
  const d=draft([wrong,a,b],{calculations:[{label:'比率',operation:'ratio',operands:[2,1],value:'20',unit:'%'}]});
  const report=adopted(d,[a,b],'计算2025年合并资产负债率');
  assert.deepEqual(report.facts.map(f=>f.originalIndex),[1,2]);
  assert.deepEqual(report.calculations[0].operands,[1,0]);
  assert.equal(report.facts[report.calculations[0].operands[0]].label,'负债合计');
  assert.equal(report.runId,'fr_development');
});
test('missing explicit metric/year/scope remains incomplete even when other facts pass',()=>{
  const f=fact('资产总计','100'),a=adopted(draft([f]),[f],'列出2025年、2024年合并与母公司资产总计和营业收入');
  assert.equal(a.coverage.status,'incomplete');
  assert.ok(a.coverage.missing.some(s=>s.includes('2024')));
  assert.ok(a.coverage.missing.some(s=>s.includes('母公司')));
  assert.ok(a.coverage.missing.some(s=>s.includes('营业收入')));
});
test('answerable calculation with verified inputs but no calculation is explicitly incomplete',()=>{
  const facts=[fact('资产总计','100'),fact('负债合计','20')];
  const a=adopted(draft(facts),facts,'计算2025年合并资产负债率');
  assert.equal(a.coverage.status,'incomplete');assert.ok(a.coverage.missing.some(s=>s.includes('计算')));
});
test('empty/refused source gap is exportable without adopting a invented reason',()=>{
  const d=draft([],{answer:'收入是因为经济下行减少',refused:true}),a=adopted(d,[],'列出2025年合并营业收入');
  assert.equal(a.coverage.status,'incomplete');assert.deepEqual(a.facts,[]);
  assert.ok(a.coverage.missing.some(s=>s.includes('营业收入')));
  const md=core.renderReport(run(d,'列出2025年合并营业收入'));
  assert.match(md,/未完成|缺口/);assert.ok(!md.includes('经济下行'));
});
test('partial numbers and free assertions cannot masquerade as fully checked semantics',()=>{
  const f=fact('资产总计','100'),a=adopted(draft([f]),[f]);
  assert.equal(a.coverage.status,'needs_semantic_review');assert.equal(a.answerVerified,false);
  assert.ok(a.coverage.limitations.length>0);
});
test('simple-model baseline retains raw answer while candidate MD leaves raw draft in JSON audit only',()=>{
  const d=draft([fact('资产总计','100')],{answer:'未经验证的模型自由文字'});
  assert.ok(core.renderReport({...run(d),mode:'single_model',review:null}).includes(d.answer));
  assert.ok(!core.renderReport(run(d)).includes(d.answer));
});
test('both modes share a concise no-extra-claims instruction without changing request budgets',()=>{
  const a=buildFilingRequest('开发问题',[],sha,'single_model'),b=buildFilingRequest('开发问题',[],sha,'current_evidence');
  for(const r of [a,b])assert.match(r.messages[0].content,/只回答.*所问|仅回答.*所问/);
  for(const k of ['model','temperature','top_p','max_tokens','thinking','response_format'])assert.deepEqual(a[k],b[k]);
});
test('persisted adopted JSON and regenerated MD bind the identical run and remapped operands',()=>{
  const f=fact('资产总计','100'),d=draft([f]),r=run(d);
  const a=adopted(d,[f]),snapshot={...r,adoptedReport:a};
  const reopened=JSON.parse(JSON.stringify(snapshot));
  assert.deepEqual(reopened.adoptedReport,a);
  assert.equal(core.renderReport(reopened),core.renderReport(snapshot));
  assert.throws(()=>core.renderReport({...snapshot,id:'fr_other'}),/编号|snapshot|快照/);
});
test('attributable profit metric does not invent parent scope or a second net-profit requirement',()=>{
  const pages=[{page:188,text:'合并利润表\n人民币元\n2025年 2024年\n归属于母公司股东的净利润 |100 |90'}];
  const facts=core.extractFacts(pages,sha),q='列出2025年合并归属于母公司股东的净利润';
  const d=core.parseDraft(JSON.stringify(draft(facts.filter(f=>f.year===2025).map(({sourceId,label,year,scope,unit,value})=>({sourceId,label,year,scope,unit,value})))));
  const a=adopted(d,facts,q);assert.deepEqual(a.coverage.missing,[]);assert.equal(a.coverage.present.length,1);
});
test('supported source EPS metadata is preserved for display and normalized only for coverage',()=>{
  for(const unit of ['元/股','元','人民币元']){
    const facts=core.extractFacts([{page:188,text:`合并利润表\n人民币百万元\n2025年 2024年\n基本每股收益（${unit}） |29 |27`}],sha);
    const d=core.parseDraft(JSON.stringify(draft(facts.filter(f=>f.year===2025).map(({sourceId,label,year,scope,unit,value})=>({sourceId,label,year,scope,unit,value})))));
    const a=adopted(d,facts,'列出2025年合并基本每股收益');assert.deepEqual(a.coverage.missing,[]);assert.match(a.facts[0].label,/基本每股收益（/);
  }
});
test('failed run without draft does not claim an adopted report was generated',()=>{
  const md=core.renderReport({...run(draft([])),draft:null,review:null,error:'开发模拟模型超时'});
  assert.match(md,/运行失败/);assert.ok(!md.includes('已生成限定证据报告'));
});
test('emoji before metric names does not erase an explicit following scope',()=>{
  const f=fact('归属于母公司股东的净利润','100'),q='📈列出2025年归属于母公司股东的净利润母公司';
  const a=adopted(draft([f]),[f],q);assert.ok(a.coverage.missing.some(s=>s.includes('母公司')));
});
