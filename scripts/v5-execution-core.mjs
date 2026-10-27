import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
export const hashBytes=bytes=>createHash('sha256').update(bytes).digest('hex');
export function validateOrder(order){
  assert.equal(order.length,240,'240 planned workflows required');
  const keys=new Set();
  for(const o of order){assert.ok([1,2,3].includes(o.repetition));assert.match(o.taskId,/^E0(?:0[1-9]|[1-3][0-9]|40)$/);assert.ok(['single_model','current_evidence'].includes(o.mode));const key=`${o.repetition}/${o.taskId}/${o.mode}`;assert.ok(!keys.has(key),'duplicate workflow');keys.add(key);}
  return order;
}
export function checkRequest(request,{system,transport,inputHash}){
  assert.equal(request.messages[0].role,'system');assert.equal(request.messages[0].content,system,'wire system prompt differs from RUN_LOCK');
  assert.equal(request.messages[1].role,'user');assert.equal(hashBytes(request.messages[1].content),inputHash,'wire source input differs');
  for(const [key,value] of Object.entries(transport))assert.deepEqual(request[key],value,`wire parameter ${key} differs`);
  return true;
}
export const canReadGold=lock=>lock?.sealed===true&&lock.count===lock.expected&&lock.expected===240;
export const resolveResume=record=>!record?'run':record.state==='started'?'recover_without_regeneration':'skip';
export const executionInputAllowed=p=>['evaluation/questions.json','source-packets-manifest.json','execution-order.json'].includes(p)||/^evaluation\/inputs\/[^/\\]+\.pdf$/.test(p);
export async function waitForSettled(read,sleep=ms=>new Promise(r=>setTimeout(r,ms)),limit=13){let run=await read();for(let i=0;run?.status==='running'&&i<limit;i++){await sleep(20000);run=await read();}assert.notEqual(run?.status,'running','server model still running; next workflow prohibited');return run;}
export async function claimLease(file){const lease={pid:process.pid,token:randomUUID(),startedAt:new Date().toISOString()};try{await fs.writeFile(file,JSON.stringify(lease),{flag:'wx'});return lease;}catch(e){if(e.code!=='EEXIST')throw e;}const recovery=file+'.recovery';await fs.writeFile(recovery,lease.token,{flag:'wx'});try{const old=JSON.parse(await fs.readFile(file,'utf8'));let alive=false;try{process.kill(old.pid,0);alive=true;}catch{}assert.equal(alive,false,'another runner is active');assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')),old,'lease changed during recovery');await fs.unlink(file);await fs.writeFile(file,JSON.stringify(lease),{flag:'wx'});return lease;}finally{await fs.unlink(recovery);}}
export async function releaseLease(file,lease){const active=JSON.parse(await fs.readFile(file,'utf8'));assert.equal(active.token,lease.token,'only lease owner may release');await fs.unlink(file);}
