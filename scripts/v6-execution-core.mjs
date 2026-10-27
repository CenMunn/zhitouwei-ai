import assert from 'node:assert/strict';
export {hashBytes,checkRequest,canReadGold,resolveResume,executionInputAllowed,waitForSettled,claimLease,releaseLease} from './v5-execution-core.mjs';
export function validateOrder(order){
  assert.equal(order.length,240,'240 planned workflows required');
  const keys=new Set(),ids=new Set();
  for(const o of order){
    assert.ok([1,2,3].includes(o.repetition));assert.match(o.taskId,/^V6-0(?:0[1-9]|[1-3][0-9]|40)$/);
    assert.ok(['single_model','current_evidence'].includes(o.mode));
    const key=`${o.repetition}/${o.taskId}/${o.mode}`;assert.ok(!keys.has(key),'duplicate workflow');keys.add(key);ids.add(o.taskId);
  }
  assert.equal(ids.size,40,'40 distinct tasks required');return order;
}
export function lockedPrompt(config,mode,taskId){
  const prompt=config.prompts?.[mode]?.[taskId];
  assert.ok(typeof prompt==='string'&&prompt.length>0,'Missing task-specific frozen prompt');return prompt;
}
