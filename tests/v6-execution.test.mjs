import test from 'node:test';import assert from 'node:assert/strict';
import * as core from '../scripts/v6-execution-core.mjs';
const order=Array.from({length:40},(_,i)=>['single_model','current_evidence'].flatMap(mode=>[1,2,3].map(repetition=>({taskId:'V6-'+String(i+1).padStart(3,'0'),mode,repetition})))).flat();
test('new task IDs remain 40 distinct tasks with exactly 3 paired repeats and no duplicate',()=>{
  assert.equal(core.validateOrder(order).length,240);
  assert.throws(()=>core.validateOrder(order.map((v,i)=>i===1?order[0]:v)),/duplicate|配对/);
  assert.throws(()=>core.validateOrder(order.map(v=>({...v,taskId:'V6-001'}))),/duplicate|40/);
});
test('wire prompt locks are task-specific because precision varies with the actual question',()=>{
  const a={prompts:{single_model:{DEV:'two-decimals'},current_evidence:{DEV:'two-decimals-current'}}};
  assert.equal(core.lockedPrompt(a,'single_model','DEV'),'two-decimals');
  assert.throws(()=>core.lockedPrompt(a,'single_model','MISSING'),/prompt|提示词/);
});
test('new formal output cannot be evaluated before all 240 rows are sealed',()=>{
  assert.equal(core.canReadGold({sealed:true,count:239,expected:240}),false);
  assert.equal(core.canReadGold({sealed:true,count:240,expected:240}),true);
});
