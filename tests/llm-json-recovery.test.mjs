import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import http from 'node:http'
import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'

// Exercise the real wrapper against a local upstream, with no live credentials.
async function exercise(responses, mode='chatJSON') {
  const bodies=[]
  const server=http.createServer(async(req,res)=>{
    let body='';for await(const chunk of req)body+=chunk
    bodies.push(JSON.parse(body))
    const response=responses[Math.min(bodies.length-1,responses.length-1)]
    res.setHeader('Content-Type','application/json')
    res.end(JSON.stringify({choices:[{finish_reason:response.finish??'stop',message:{content:response.content,reasoning_content:response.reasoning}}]}))
  })
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  const source=await fs.readFile(new URL('../src/lib/ai/llm.ts',import.meta.url),'utf8')
  const script=`
    const Module=require('node:module');const ts=require('typescript');let source='';
    process.stdin.setEncoding('utf8');process.stdin.on('data',s=>source+=s);
    process.stdin.on('end',async()=>{
      const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
      const mod=new Module('actual-json-wrapper');
      mod.require=id=>id==='z-ai-web-dev-sdk'?{create:async()=>{throw new Error('UNEXPECTED_PROVIDER_FALLBACK')}}:require(id);
      mod._compile(code,'actual-json-wrapper.cjs');
      try{process.stdout.write(JSON.stringify({value:await mod.exports.${mode}('synthetic-role','synthetic-task',3000,'mimo')}));}
      catch(e){process.stdout.write(JSON.stringify({error:e.message}));}
    });`
  try {
    const child=spawn(process.execPath,['-e',script],{cwd:fileURLToPath(new URL('../',import.meta.url)),env:{...process.env,MIMO_API_KEY:'fake-json-test-only',MIMO_BASE_URL:`http://127.0.0.1:${server.address().port}`,MIMO_MODEL:'legacy-should-not-run',DEEPSEEK_API_KEY:'fake-json-test-only',DEEPSEEK_BASE_URL:`http://127.0.0.1:${server.address().port}`,DEEPSEEK_MODEL:'deepseek-flash'}})
    let output='',errors='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>errors+=b)
    const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve)})
    child.stdin.end(source)
    assert.equal(await done,0,errors)
    return {bodies,result:JSON.parse(output)}
  } finally {await new Promise(resolve=>server.close(resolve))}
}

test('JSON calls request native JSON mode from the first attempt',async()=>{
  const {bodies,result}=await exercise([{content:'{"answer":"ok"}'}])
  assert.deepEqual(result.value,{answer:'ok'})
  assert.equal(bodies[0].model,'deepseek-flash')
  assert.deepEqual(bodies[0].response_format,{type:'json_object'})
  assert.match(bodies[0].messages[0].content,/JSON/)
})

test('plain text calls preserve text output mode',async()=>{
  const {bodies,result}=await exercise([{content:'plain text'}],'chatText')
  assert.equal(result.value,'plain text')
  assert.equal(bodies[0].response_format,undefined)
  assert.equal(bodies[0].messages[0].content,'synthetic-role')
})

test('malformed output is regenerated with syntax guidance and a non-accumulating correction',async()=>{
  const {bodies,result}=await exercise([
    {content:'{"answer":"embedded "quote""}'},
    {content:'{"unit":null"}'},
    {content:'{"answer":"regenerated"}'},
  ])
  assert.deepEqual(result.value,{answer:'regenerated'})
  assert.equal(bodies.length,3)
  assert.match(bodies[1].messages[1].content,/转义/)
  assert.equal(bodies[1].messages[1].content,bodies[2].messages[1].content)
  assert.ok(bodies.every(b=>b.response_format?.type==='json_object'))
})

test('a length-limited response is rejected even if its visible content parses',async()=>{
  const {bodies,result}=await exercise([{content:'{"answer":"partial"}',finish:'length'},{content:'{"answer":"complete"}'}])
  assert.deepEqual(result.value,{answer:'complete'})
  assert.equal(bodies.length,2)
})

test('reasoning alone cannot be promoted to a final JSON answer',async()=>{
  const {bodies,result}=await exercise([{content:null,reasoning:'Draft {"answer":"unfinalized"}'},{content:'{"answer":"final"}'}])
  assert.deepEqual(result.value,{answer:'final'})
  assert.equal(bodies.length,2)
})

test('a JSON scalar is rejected with a bounded three-output budget',async()=>{
  const {bodies,result}=await exercise([{content:'null'}])
  assert.match(result.error,/JSON_OBJECT_REQUIRED/)
  assert.equal(bodies.length,3)
})
