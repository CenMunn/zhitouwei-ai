import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {parseFilingPdf} from '../src/lib/filings/pdf.ts';
const root='D:/北大金融比赛/复赛深化/evaluation/locked-v7/evaluation/inputs/';
for(const [code,checks] of [
 ['000651',[[86,'资产总计','consolidated','2025-12-31','391371999819.49'],[86,'资产总计','consolidated','2025-01-01','368031704522.86'],[87,'负债合计','consolidated','2025-12-31','241580719144.79']]],
 ['000001',[[118,'资产总计','parent','2025-12-31','5852096'],[119,'负债合计','parent','2025-12-31','5309854']]]
])test('previously exposed PDF preserves full dates and bank scope '+code,async()=>{
 const meta=JSON.parse(await fs.readFile(root+code+'-financial-input.json','utf8'));
 const bytes=new Uint8Array(await fs.readFile(root+code+'-financial-pages.pdf'));
 const parsed=await parseFilingPdf(bytes,meta.sourcePages.map(p=>p.physicalPdfPage).join(','));
 for(const [page,label,scope,period,value] of checks){const f=parsed.facts.find(f=>f.page===page&&f.label===label&&f.scope===scope&&f.period===period);assert.ok(f,`${page}/${label}/${period}`);assert.equal(f.value,value);}
});
