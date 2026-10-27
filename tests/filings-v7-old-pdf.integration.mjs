// Previously exposed V6 cases only. No V7 questions or source files.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {parseFilingPdf} from '../src/lib/filings/pdf.ts';import {reviewDraft} from '../src/lib/filings/core.ts';
const root='D:/北大金融比赛/复赛深化/evaluation/formal-v6-2026-10-06/outputs';
for(const dir of ['002-V6-009-current_evidence','003-V6-025-current_evidence'])test('old PDF correct emitted facts are no longer falsely rejected: '+dir,async()=>{
 const run=JSON.parse(await fs.readFile(root+'/'+dir+'/run.json','utf8'));
 const doc=JSON.parse(await fs.readFile(root+'/'+dir+'/document.json','utf8'));
 const bytes=await fs.readFile('D:/北大金融比赛/复赛深化/evaluation/formal-v6-2026-10-06/runtime-data/filing-documents/'+doc.id+'.pdf');
 const parsed=await parseFilingPdf(new Uint8Array(bytes),doc.sourcePages?.join(',')??doc.pages.map(p=>p.page).join(','));
 const checked=reviewDraft(run.draft,parsed.facts,{question:run.question});
 const required=doc.companyCode==='600926'?[0]:[0];
 for(const index of required)assert.equal(checked.checks.find(c=>c.kind==='fact'&&c.index===index)?.ok,true,'old independently sourced mandatory amount');
 assert.equal(run.sha256,parsed.sha256);
 if(doc.companyCode==='603288'){
   assert.ok(parsed.facts.some(f=>f.page===87&&f.label==='资产总计'&&f.scope==='consolidated'));
   assert.ok(parsed.facts.some(f=>f.page===88&&f.label==='负债合计'&&f.scope==='consolidated'));
 }
});
