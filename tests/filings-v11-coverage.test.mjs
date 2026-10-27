import test from 'node:test';import assert from 'node:assert/strict';
import {reviewDraft,buildAdoptedReport} from '../src/lib/filings/core.ts';
const sourceId='pdf:'+('a'.repeat(64))+':p1',facts=[{sourceId,label:'资产总计',year:2025,period:'2025-12-31',scope:'consolidated',unit:'元',value:'100'},{sourceId,label:'负债合计',year:2025,period:'2025-12-31',scope:'consolidated',unit:'元',value:'20'}];
const adopt=(question,calculations=[])=>{const d={refused:false,answer:'',limitations:[],facts,calculations};return buildAdoptedReport(d,reviewDraft(d,facts,{question}),question,'fr_dev',{sourceFacts:facts});};
test('formula-documentation instruction does not invent a calculation task in a reading question',()=>{
 for(const suffix of ['计算列公式与操作数。','如有计算，列出公式和操作数。','计算时请注明公式及操作数。'])assert.deepEqual(adopt('读取2025年12月31日合并资产总计；'+suffix).coverage.missing,[],suffix);
});
test('formula-documentation suffix does not override the actual earlier ratio request',()=>{
 const q='列出2025年12月31日合并资产总计和负债合计，计算资产负债率；计算列公式与操作数。';
 assert.ok(adopt(q).coverage.missing.some(s=>s.includes('资产负债率')));
 assert.deepEqual(adopt(q,[{label:'比率',operation:'ratio',operands:[1,0],value:'20',unit:'%'}]).coverage.missing,[]);
});
