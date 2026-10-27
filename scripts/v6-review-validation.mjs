import assert from 'node:assert/strict';

export function validateReviews(packets, mapping, annotations, opportunities) {
  assert.equal(packets.length, 240, 'all sealed packets required');
  assert.equal(mapping.length, 240, 'all private mappings required');
  assert.equal(annotations.length, 240, 'all assistant conclusions required');
  assert.ok(Array.isArray(opportunities)&&opportunities.length===40,'frozen per-task opportunities required');
  assert.equal(new Set(opportunities.map(o=>o.taskId)).size,40,'duplicate opportunity task');
  const byId = new Map();
  for (const a of annotations) {
    assert.ok(!byId.has(a.reviewId), 'duplicate review '+a.reviewId);
    byId.set(a.reviewId, a);
  }
  const rows = packets.map(p => {
    const a=byId.get(p.reviewId), m=mapping.find(m=>m.reviewId===p.reviewId), expected=opportunities.find(o=>o.taskId===p.taskId);
    assert.ok(a && m, 'missing review or mapping '+p.reviewId);
    assert.equal(m.taskId,p.taskId,'mapping task mismatch');
    assert.ok(expected,'missing frozen task opportunity');
    assert.equal(expected.category,p.category,'frozen category mismatch');
    for(const k of ['rawPass','finalPass','refusalWrong']) assert.equal(typeof a[k],'boolean',p.reviewId+' missing '+k);
    for(const k of ['requiredFactsTotal','requiredFactsCorrect','rawRequiredFactsCorrect','requiredCalculationsTotal','requiredCalculationsCorrect','rawRequiredCalculationsCorrect','citationTotal','citationCorrect']) assert.ok(Number.isInteger(a[k])&&a[k]>=0,p.reviewId+' invalid '+k);
    for(const [value,total] of [['requiredFactsCorrect','requiredFactsTotal'],['rawRequiredFactsCorrect','requiredFactsTotal'],['requiredCalculationsCorrect','requiredCalculationsTotal'],['rawRequiredCalculationsCorrect','requiredCalculationsTotal'],['citationCorrect','citationTotal']]) assert.ok(a[value]<=a[total],p.reviewId+' numerator exceeds denominator');
    assert.equal(a.requiredFactsTotal,expected.requiredFactsTotal,p.reviewId+' frozen task fact denominator');
    assert.equal(a.requiredCalculationsTotal,expected.requiredCalculationsTotal,p.reviewId+' frozen task calculation denominator');
    if(a.finalPass){assert.equal(a.requiredFactsCorrect,a.requiredFactsTotal,p.reviewId+' final pass omits required fact');assert.equal(a.requiredCalculationsCorrect,a.requiredCalculationsTotal,p.reviewId+' final pass omits required calculation');assert.equal(a.refusalWrong,false,p.reviewId+' final pass contradicts wrong refusal');assert.ok(p.rawDraft!=null,p.reviewId+' final pass without usable draft');assert.equal(a.citationCorrect,a.citationTotal,p.reviewId+' final pass contradicts unsupported adopted citation');if(a.requiredFactsTotal+a.requiredCalculationsTotal>0)assert.ok(a.citationTotal>0,p.reviewId+' final pass without required evidence citation');}
    if(a.rawPass){assert.equal(a.rawRequiredFactsCorrect,a.requiredFactsTotal,p.reviewId+' raw pass omits required fact');assert.equal(a.rawRequiredCalculationsCorrect,a.requiredCalculationsTotal,p.reviewId+' raw pass omits required calculation');assert.ok(p.rawDraft!=null,p.reviewId+' raw pass without usable draft');}
    if(p.category==='evidence_boundary')assert.equal(a.refusalWrong,false,p.reviewId+' boundary outside answerable refusal denominator');
    assert.ok(typeof a.reason==='string' && a.reason.trim().length>0,p.reviewId+' missing rationale');
    assert.ok(Array.isArray(a.evidence) && a.evidence.length>0 && a.evidence.every(x=>typeof x==='string'&&x.trim()),p.reviewId+' missing evidence');
    assert.ok(Array.isArray(a.errorCategories) && a.errorCategories.every(x=>typeof x==='string'),p.reviewId+' invalid errors');
    assert.equal(typeof p.technicalWorkflowSuccess,'boolean');
    return {...a,taskId:p.taskId,category:p.category,company:p.company,repetition:m.repetition,mode:m.mode,technicalWorkflowSuccess:p.technicalWorkflowSuccess};
  });
  assert.equal(new Set(rows.map(r=>r.taskId)).size,40,'40 unique tasks required');
  for(const mode of ['single_model','current_evidence']){
    const g=rows.filter(r=>r.mode===mode);
    assert.equal(g.length,120,'group denominator');
    assert.equal(g.reduce((s,r)=>s+r.requiredFactsTotal,0),141,'frozen fact denominator');
    assert.equal(g.reduce((s,r)=>s+r.requiredCalculationsTotal,0),36,'frozen calculation denominator');
    assert.equal(g.filter(r=>r.category==='evidence_boundary').length,36,'boundary denominator');
    for(const rep of [1,2,3]) assert.equal(g.filter(r=>r.repetition===rep).length,40,'round denominator');
    assert.equal(new Set(g.map(r=>r.repetition+'/'+r.taskId)).size,120,'duplicate execution pair');
  }
  return rows;
}
