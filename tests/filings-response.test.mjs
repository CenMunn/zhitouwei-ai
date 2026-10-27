import test from 'node:test';
import assert from 'node:assert/strict';
import {readFilingResponse} from '../src/lib/filings/response.ts';

test('an empty server error explains the failed service instead of exposing JSON parser errors',async()=>{
  await assert.rejects(readFilingResponse(new Response(null,{status:500})),/财报服务.*HTTP 500/);
});
test('HTML gateway errors are reported without rendering their contents',async()=>{
  await assert.rejects(readFilingResponse(new Response('<html>private upstream detail</html>',{status:502})),e=>e.message.includes('HTTP 502')&&!e.message.includes('private upstream'));
});
test('a truncated successful response is not mistaken for an imported document',async()=>{
  await assert.rejects(readFilingResponse(new Response('{"document":',{status:201})),/返回数据不完整/);
});
test('structured API validation errors are preserved',async()=>{
  await assert.rejects(readFilingResponse(Response.json({error:'请上传 1–40 页财务原页'},{status:400})),/1–40/);
});
test('valid JSON success remains available to the workbench',async()=>{
  assert.deepEqual(await readFilingResponse(Response.json({document:{id:'test'}})),{document:{id:'test'}});
});
test('null or array JSON are not valid filing API responses',async()=>{
  for(const value of [null,[]])await assert.rejects(readFilingResponse(Response.json(value)),/返回数据不完整/);
});
