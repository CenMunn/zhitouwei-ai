import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {parseFilingPdf} from '../src/lib/filings/pdf.ts';
const old='D:/北大金融比赛/复赛深化/evaluation/holdout-v9-draft-20261009/inputs/';
test('exposed V9 Haier dates and sparse cash-flow opening retain original evidence',async()=>{
 const p=await parseFilingPdf(new Uint8Array(await fs.readFile(old+'haier-main.pdf')),'118-128');
 for(const [page,name,period,scope,value] of [[118,'应收账款','2025-12-31','consolidated','27065839108.45'],[120,'应收账款','2025-12-31','parent','3380866320.45'],[126,'经营活动产生的现金流量净额','2025','consolidated','26002941969.92'],[127,'筹资活动产生的现金流量净额','2025','consolidated','-17670708963.02']]){
  const found=p.facts.find(f=>f.page===page&&f.label.replace(/\s/g,'')===name&&f.period===period&&f.scope===scope);assert.ok(found,`${page}/${name}/${period}/${scope}`);assert.equal(found.value,value);
 }
 const continued=p.statementBlocks.find(b=>b.page===126&&b.name==='合并现金流量表');assert.equal(continued.status,'parsed');assert.ok(continued.headerSourceIds.includes(`pdf:${p.sha256}:p125`));
});
test('exposed CID-font bank PDF loads bundled CMaps and retains group/bank columns',async()=>{
 const p=await parseFilingPdf(new Uint8Array(await fs.readFile(old+'abc-main.pdf')),'156-159,162-163');
 assert.match(p.pages.find(p=>p.page===158).text,/手续费及佣金净收入/);
 for(const [page,name,period,scope,value] of [[158,'手续费及佣金净收入','2025','consolidated','88085'],[158,'一、营业收入','2025','parent','698550']]){
  const found=p.facts.find(f=>f.page===page&&f.label.replace(/\s/g,'')===name&&f.period===period&&f.scope===scope);assert.ok(found,`${page}/${name}/${scope}`);assert.equal(found.value,value);assert.equal(found.unit,'百万元');
 }
 const eps=p.facts.find(f=>f.page===159&&/基本及稀释每股收益/.test(f.label)&&f.year===2025&&f.scope==='consolidated');assert.ok(eps);assert.equal(eps.value,'0.78');assert.equal(eps.unit,'元/股');assert.ok(!p.facts.some(f=>f.page===159&&/每股收益/.test(f.label)&&f.scope==='parent'));
});
