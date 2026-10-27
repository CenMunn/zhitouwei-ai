import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {callFilingModel,buildFilingRequest} from '../src/lib/filings/model.ts';

// Dedicated test process: overwrite configuration with synthetic values before
// any production call. Never inspect host credential values or credential files.
const envNames=['FILINGS_PROVIDER','MIMO_API_KEY','MIMO_BASE_URL','MIMO_MODEL','DEEPSEEK_API_KEY','DEEPSEEK_BASE_URL','DEEPSEEK_MODEL','FILINGS_RETRY_POLICY'];
function configure(overrides={}) {
  for(const key of envNames)delete process.env[key];
  Object.assign(process.env,{FILINGS_PROVIDER:'mimo',MIMO_API_KEY:'synthetic-mimo-only',DEEPSEEK_API_KEY:'synthetic-deepseek-only',FILINGS_RETRY_POLICY:'no_content_only'},overrides);
}
globalThis.fetch=async()=>{throw new Error('REAL_NETWORK_DISABLED_BY_PROVIDER_CONTRACT_TEST');};
const sha='a'.repeat(64),pages=[{page:188,uploadedPage:1,physicalPageDeclared:true,text:'合并资产负债表\n人民币元\n2025年12月31日 2024年12月31日\n货币资金 100 80'}];
const draft={refused:true,answer:'仅为合成测试材料',facts:[],calculations:[],limitations:[]};
function response(model='response-model-observed') {return new Response(JSON.stringify({id:'synthetic-response-id',object:'chat.completion',created:0,model,choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(draft)}}],usage:{prompt_tokens:31,completion_tokens:17,total_tokens:48}}),{status:200});}
function run(fetchFn,extra={}) {return callFilingModel('请核对货币资金',pages,sha,'current_evidence',{fetchFn,wait:async()=>{},retryPolicy:'no_content_only',...extra});}

test('explicit legacy MiMo remains usable through the legacy options.apiKey override',async()=>{
  configure();let sent;
  const result=await run(async(url,options)=>{sent={url,body:JSON.parse(options.body),auth:options.headers.Authorization};return response('mimo-actual');},{apiKey:'synthetic-override'});
  assert.equal(sent.url,'https://api.xiaomimimo.com/v1/chat/completions');
  assert.equal(sent.auth,'Bearer synthetic-override');
  assert.deepEqual(Object.fromEntries(['model','temperature','top_p','max_tokens','stream','thinking','response_format'].map(k=>[k,sent.body[k]])),{model:'mimo-v2.5',temperature:1,top_p:0.95,max_tokens:6000,stream:false,thinking:{type:'disabled'},response_format:{type:'json_object'}});
  assert.deepEqual(result.draft,draft);
});

test('DeepSeek selection sends its own endpoint key model and records observed response identity',async()=>{
  configure({FILINGS_PROVIDER:'deepseek'});let sent;
  const result=await run(async(url,options)=>{sent={url,body:JSON.parse(options.body),auth:options.headers.Authorization};return response('deepseek-v4-pro-observed');});
  assert.equal(sent.url,'https://api.deepseek.com/chat/completions');
  assert.equal(sent.auth,'Bearer synthetic-deepseek-only');
  assert.equal(sent.body.model,'deepseek-flash');
  assert.deepEqual(sent.body.thinking,{type:'disabled'});
  assert.deepEqual(sent.body.response_format,{type:'json_object'});
  assert.deepEqual(result.modelIdentity,{provider:'deepseek',requestedModel:'deepseek-flash',responseModel:'deepseek-v4-pro-observed',endpoint:'https://api.deepseek.com/chat/completions'});
  assert.deepEqual(result.attempts[0].modelIdentity,result.modelIdentity);
  assert.equal(result.attempts[0].requestSha256,createHash('sha256').update(JSON.stringify(sent.body)).digest('hex'));
});

test('DeepSeek custom URL and model are isolated from the MiMo configuration',async()=>{
  configure({FILINGS_PROVIDER:'deepseek',DEEPSEEK_BASE_URL:'https://deepseek.example.invalid/v1/',DEEPSEEK_MODEL:'deepseek-flash',MIMO_BASE_URL:'https://mimo.example.invalid/v1',MIMO_MODEL:'mimo-custom'});let sent;
  await run(async(url,options)=>{sent={url,body:JSON.parse(options.body)};return response('deepseek-flash');});
  assert.equal(sent.url,'https://deepseek.example.invalid/v1/chat/completions');assert.equal(sent.body.model,'deepseek-flash');
});

test('MiMo model override is explicit while standalone request builder defaults to Flash',async()=>{
  configure({MIMO_MODEL:'mimo-configured'});let sent;
  const result=await run(async(_url,options)=>{sent=JSON.parse(options.body);return response('mimo-actual');});
  assert.equal(sent.model,'mimo-configured');assert.equal(result.modelIdentity.requestedModel,'mimo-configured');
  assert.equal(buildFilingRequest('问题',pages,sha,'single_model').model,'deepseek-flash');
});

test('provider and complete request snapshot stay fixed across a permitted pre-response retry',async()=>{
  configure({FILINGS_PROVIDER:'deepseek',DEEPSEEK_MODEL:'deepseek-flash'});const sent=[];
  const result=await run(async(url,options)=>{sent.push({url,body:JSON.parse(options.body),auth:options.headers.Authorization});if(sent.length===1){Object.assign(process.env,{FILINGS_PROVIDER:'mimo',DEEPSEEK_MODEL:'deepseek-flash',DEEPSEEK_BASE_URL:'https://changed.example.invalid',DEEPSEEK_API_KEY:'synthetic-changed'});throw new TypeError('fetch failed');}return response('actual-retry-model');});
  assert.equal(sent.length,2);assert.deepEqual(sent[0],sent[1]);assert.equal(sent[0].body.model,'deepseek-flash');
  assert.equal(result.modelIdentity.provider,'deepseek');assert.equal(result.modelIdentity.requestedModel,'deepseek-flash');
  assert.equal(result.attempts[0].modelIdentity.responseModel,'unknown');assert.equal(result.attempts[1].modelIdentity.responseModel,'actual-retry-model');
});

test('missing DeepSeek credential fails closed even with a configured MiMo credential',async()=>{
  configure({FILINGS_PROVIDER:'deepseek'});delete process.env.DEEPSEEK_API_KEY;let calls=0;
  const result=await run(async()=>{calls++;return response();});
  assert.equal(calls,0);assert.equal(result.draft,null);assert.equal(result.attempts.length,0);assert.match(result.error,/DEEPSEEK_API_KEY/);
});

test('invalid provider and malformed unsafe URLs fail closed before transport',async()=>{
  for(const overrides of [{FILINGS_PROVIDER:'automatic'},{FILINGS_PROVIDER:'deepseek',DEEPSEEK_BASE_URL:'not-a-url'},{FILINGS_PROVIDER:'deepseek',DEEPSEEK_BASE_URL:'https://user:synthetic-secret@example.invalid/v1'},{FILINGS_PROVIDER:'deepseek',DEEPSEEK_BASE_URL:'https://example.invalid/v1?api_key=synthetic-secret'},{FILINGS_PROVIDER:'deepseek',DEEPSEEK_MODEL:'   '}]){
    configure(overrides);let calls=0;const result=await run(async()=>{calls++;return response();});
    assert.equal(calls,0,JSON.stringify(Object.keys(overrides)));assert.equal(result.draft,null);assert.ok(result.error);assert.equal(JSON.stringify(result).includes('synthetic-secret'),false);
  }
});

test('DeepSeek HTTP and transport errors never leak credentials or silently switch providers',async()=>{
  for(const kind of ['http','transport']){
    configure({FILINGS_PROVIDER:'deepseek'});const sent=[];
    const result=await run(async(url)=>{sent.push(url);if(kind==='transport')throw new TypeError('failure synthetic-deepseek-only');return new Response('{"error":"synthetic-deepseek-only"}',{status:401});});
    assert.equal(result.draft,null);assert.equal(JSON.stringify(result).includes('synthetic-deepseek-only'),false);
    assert.ok(sent.every(url=>url==='https://api.deepseek.com/chat/completions'));assert.equal(sent.length,kind==='http'?1:2);
  }
});

test('missing response model is explicitly unknown rather than inferred from the requested model',async()=>{
  configure({FILINGS_PROVIDER:'deepseek'});const result=await run(async()=>{const payload=await response().json();delete payload.model;return new Response(JSON.stringify(payload));});
  assert.ok(result.modelIdentity,'resolved model identity must be returned');assert.equal(result.modelIdentity.responseModel,'unknown');assert.equal(result.attempts[0].modelIdentity.responseModel,'unknown');assert.equal(result.modelIdentity.requestedModel,'deepseek-flash');
});

test('both DeepSeek modes preserve identical source text and transport contracts',async()=>{
  configure({FILINGS_PROVIDER:'deepseek'});const sent=[];
  for(const mode of ['single_model','current_evidence'])await callFilingModel('请核对货币资金',pages,sha,mode,{fetchFn:async(url,options)=>{sent.push({url,body:JSON.parse(options.body)});return response();},wait:async()=>{},retryPolicy:'no_content_only'});
  assert.equal(sent[0].url,'https://api.deepseek.com/chat/completions');assert.equal(sent[0].body.messages[1].content,sent[1].body.messages[1].content);
  const input=JSON.parse(sent[0].body.messages[1].content);assert.equal(input.pages[0].text,pages[0].text);assert.equal(input.pages[0].sourceId,`pdf:${sha}:p188`);
  for(const k of ['model','temperature','top_p','max_tokens','stream','thinking','response_format'])assert.deepEqual(sent[0].body[k],sent[1].body[k]);
});

test('DeepSeek retains a single shared 120-second budget and does not regenerate after content',async()=>{
  configure({FILINGS_PROVIDER:'deepseek'});let clock=1000,calls=0;
  const result=await run(async()=>{calls++;clock+=119000;throw new TypeError('fetch failed');},{now:()=>clock,wait:async ms=>{clock+=ms;}});
  assert.equal(calls,1);assert.equal(result.draft,null);assert.ok(result.modelIdentity,'budget failure must retain selected provider');assert.equal(result.modelIdentity.provider,'deepseek');
  configure({FILINGS_PROVIDER:'deepseek'});let contentCalls=0;const malformed=await run(async()=>{contentCalls++;return new Response(JSON.stringify({model:'actual',choices:[{finish_reason:'stop',message:{content:'broken JSON'}}]}));});
  assert.equal(contentCalls,1);assert.equal(malformed.draft,null);assert.equal(malformed.modelIdentity.responseModel,'actual');
});
