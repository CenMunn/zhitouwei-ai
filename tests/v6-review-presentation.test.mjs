import test from 'node:test';
import assert from 'node:assert/strict';
import {finalEvidence,questionReviewMarkdown,auditBody} from '../scripts/v6-review-presentation.mjs';

test('V6 final evidence uses persisted adoption and remapped operands, never older accepted draft',()=>{
 const run={id:'fr_fixture',mode:'current_evidence',status:'completed',draft:{answer:'无依据原稿'},review:{acceptedFacts:[{label:'旧行名'}]},adoptedReport:{version:'facts-calculations-v1',runId:'fr_fixture',facts:[{label:'原页规范行名',originalIndex:4}],calculations:[{operands:[0,0]}],coverage:{status:'incomplete',missing:['缺2024年']},answerVerified:false,semanticReview:'pending'}};
 const e=finalEvidence(run,'current_evidence');
 assert.deepEqual(e.facts,run.adoptedReport.facts);assert.deepEqual(e.calculations,run.adoptedReport.calculations);assert.deepEqual(e.adoptedReport.coverage,run.adoptedReport.coverage);
 assert.throws(()=>finalEvidence({...run,adoptedReport:{...run.adoptedReport,runId:'fr_other'}},'current_evidence'),/snapshot/);
 assert.throws(()=>finalEvidence({...run,adoptedReport:undefined},'current_evidence'),/missing adopted/);
});

test('technical failure has no invented adopted evidence; baseline keeps raw answer',()=>{
 assert.deepEqual(finalEvidence({id:'fr_f',mode:'current_evidence',status:'failed',draft:null},'current_evidence'),{facts:[],calculations:[],adoptedReport:null});
 const draft={answer:'直接原稿',facts:[{label:'模型行名'}],calculations:[{label:'模型公式'}]};
 assert.deepEqual(finalEvidence({id:'fr_s',mode:'single_model',draft},'single_model'),{facts:draft.facts,calculations:draft.calculations,adoptedReport:null});
});

test('review packet preserves raw prose and actual final gap separately, including technical failure',()=>{
 const r={reviewId:'R001',gold:{fixture:true},rawDraft:{answer:'有争议的原稿'},adoptedFacts:[],adoptedCalculations:[],adoptedReport:{coverage:{status:'incomplete',missing:['缺2024年']},semanticReview:'pending'},checks:[],reportMd:'缺口报告',technicalWorkflowSuccess:false,technicalError:'原错误',refused:false};
 const md=questionReviewMarkdown({id:'V6-fixture',companyName:'开发合成公司',question:'合成问题'},[r]);
 for(const s of ['有争议的原稿','缺2024年','缺口报告','原错误','人工结论：待实际审核'])assert.ok(md.includes(s));
 assert.notDeepEqual(auditBody(r),auditBody({...r,adoptedReport:{coverage:{status:'needs_semantic_review'}}}));
});
