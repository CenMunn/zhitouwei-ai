import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {hashBytes,canReadGold} from './v5-execution-core.mjs';

export async function loadFrozenScoringData(root){
  const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
  const seal=await read(root+'/OUTPUTS_LOCK.json');
  assert.ok(canReadGold(seal),'all240 sealed before scoring data access');
  const runBytes=await fs.readFile(root+'/RUN_LOCK.json'),runHash=hashBytes(runBytes);
  assert.equal(runHash,seal.runLockSha256,'output/run lock mismatch');
  assert.equal((await fs.readFile(root+'/RUN_LOCK.sha256','utf8')).trim().split(/\s+/)[0],runHash,'detached run lock mismatch');
  const lock=JSON.parse(runBytes);
  for(const f of seal.files){const bytes=await fs.readFile(root+'/'+f.path);assert.equal(bytes.length,f.bytes,'output size changed '+f.path);assert.equal(hashBytes(bytes),f.sha256,'output changed '+f.path);}
  const dataBytes=await fs.readFile(lock.dataRoot+'/DATA_LOCK.json');
  assert.equal(hashBytes(dataBytes),lock.dataLockSha256,'pre-run DATA_LOCK changed');
  const dataLock=JSON.parse(dataBytes),loaded=new Map();
  for(const f of dataLock.files){const p=path.resolve(lock.dataRoot,f.path),relative=path.relative(path.resolve(lock.dataRoot),p);assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative),'unsafe DATA_LOCK path');const bytes=await fs.readFile(p);assert.equal(bytes.length,f.bytes,'frozen size changed '+f.path);assert.equal(hashBytes(bytes),f.sha256,'frozen scoring data changed '+f.path);if(['private-review/gold-private.json','evaluation/questions.json','execution-order.json','protocol.json'].includes(f.path))loaded.set(f.path,bytes);}
  for(const p of ['private-review/gold-private.json','evaluation/questions.json','execution-order.json','protocol.json'])assert.ok(loaded.has(p),'required frozen data missing '+p);
  assert.equal(hashBytes(loaded.get('protocol.json')),lock.protocolSha256);
  assert.equal(hashBytes(loaded.get('execution-order.json')),lock.executionOrderSha256);
  return {seal,lock,dataLock,gold:JSON.parse(loaded.get('private-review/gold-private.json')),goldSha256:hashBytes(loaded.get('private-review/gold-private.json')),questions:JSON.parse(loaded.get('evaluation/questions.json')),order:JSON.parse(loaded.get('execution-order.json')),protocol:JSON.parse(loaded.get('protocol.json'))};
}

export function maskReportMode(report){return typeof report==='string'?report.replace(/^模式：[^\r\n]*\r?$/m,'模式：（复核时隐藏）'):null;}
