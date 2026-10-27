// Explicit local regression on previously seen sources. Not V6 evaluation.
import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {parseFilingPdf} from '../src/lib/filings/pdf.ts';
const base='D:/北大金融比赛/复赛深化/evaluation/locked-v5/evaluation/inputs/';
for(const [code,expected] of [
  ['002142',[[90,'经营活动产生的现金流量净额','consolidated','百万元','235516'],[92,'资产总计','parent','百万元','3363291'],[94,'一、 营业收入','parent','百万元','57947']]],
  ['600887',[[82,'资产总计','consolidated','元','152098516632.34'],[84,'资产总计','parent','元','135873622729.68'],[89,'经营活动产生的现金流量净额','consolidated','元','14343920490.32']]]
])test(`old ${code} actual PDF binds independently checked amounts to original headers`,async()=>{
  const input=JSON.parse(await fs.readFile(base+code+'-financial-input.json','utf8'));
  const bytes=new Uint8Array(await fs.readFile(base+code+'-financial-pages.pdf'));
  const p=await parseFilingPdf(bytes,input.sourcePages.map(p=>p.physicalPdfPage).join(','));
  assert.ok(Array.isArray(p.statementBlocks),'import returns statement gaps and header provenance');
  assert.ok(p.pages.every(page=>page.layoutItems?.length>0),'import preserves positions for safe block segmentation');
  for(const [page,label,scope,unit,value] of expected){
    const fact=p.facts.find(f=>f.page===page&&f.label.replace(/\s/g,'')===label.replace(/\s/g,'')&&f.scope===scope&&f.year===2025);
    assert.ok(fact,`${page}/${label}`);assert.equal(fact.unit,unit);assert.equal(fact.value,value);
    assert.deepEqual(fact.headerSourceIds,[`pdf:${p.sha256}:p${page}`]);
  }
});
