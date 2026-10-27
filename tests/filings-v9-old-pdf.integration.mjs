import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {parseFilingPdf} from '../src/lib/filings/pdf.ts';
const old='D:/北大金融比赛/复赛深化/evaluation/holdout-v8-draft-20261008/inputs/';
test('exposed PDF restores staggered consolidated headers and wrapped parent dates',async()=>{
 const p=await parseFilingPdf(new Uint8Array(await fs.readFile(old+'shenhua-main.pdf')),'147-163');
 for(const [page,label,scope,period,value] of [[148,'资产总计','consolidated','2025-12-31','627761'],[149,'流动负债合计','consolidated','2024-12-31','105116'],[152,'货币资金','parent','2025-12-31','83347'],[155,'一、营业收入','consolidated','2025','294916'],[158,'四、净利润','parent','2025','62360']]){
  const found=p.facts.find(f=>f.page===page&&f.label===label&&f.scope===scope&&f.period===period);assert.ok(found,`${page}/${label}/${scope}/${period}`);assert.equal(found.value,value);assert.equal(found.unit,'百万元');
 }
 // A precision footnote does not turn -* into an exact zero.
 assert.ok(!p.facts.some(f=>f.page===147&&f.label==='交易性金融资产'&&f.year===2025));
});
test('previously unreadable CID-font PDF now restores native Chinese and original four-column amounts',async()=>{
 const p=await parseFilingPdf(new Uint8Array(await fs.readFile(old+'ccb-main.pdf')),'185-188,193-194');
 assert.match(p.pages[0].text,/以人民币百万元列示/);assert.match(p.pages[0].text,/发放贷款和垫款/);
 for(const [scope,value] of [['consolidated','45631818'],['parent','44584505']]){
  const f=p.facts.find(f=>f.page===185&&f.label==='资产总计'&&f.period==='2025-12-31'&&f.scope===scope);assert.ok(f);assert.equal(f.value,value);assert.equal(f.unit,'百万元');
 }
});
