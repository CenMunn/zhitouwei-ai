import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import http from 'node:http'
import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'

test('actual product retries a transient DeepSeek HTTP500 with unchanged input and returns the recovered JSON',async()=>{
  // Exercise the real llm.ts wrapper; only the upstream HTTP service is local.
  // No genuine credentials, external calls, source questions or gold answers.
  const bodies=[]
  const server=http.createServer(async(req,res)=>{
    let body='';for await(const chunk of req)body+=chunk
    bodies.push(JSON.parse(body))
    assert.equal(req.headers.authorization,'Bearer fake-recovery-test-only')
    res.setHeader('Content-Type','application/json')
    if(bodies.length===1){res.statusCode=500;res.end(JSON.stringify({error:{code:'500',message:'Internal Server Error'}}))}
    else res.end(JSON.stringify({choices:[{message:{content:'{"answer":"recovered","facts":[]}'}}],usage:{prompt_tokens:5,completion_tokens:3,total_tokens:8}}))
  })
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  const sourcePath=fileURLToPath(new URL('../src/lib/ai/llm.ts',import.meta.url))
  const source=await fs.readFile(sourcePath,'utf8')
  const childScript=`
    const Module=require('node:module');const ts=require('typescript');let source='';
    process.stdin.setEncoding('utf8');process.stdin.on('data',s=>source+=s);
    process.stdin.on('end',async()=>{
      const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
      const mod=new Module('actual-llm-recovery');
      mod.require=id=>id==='z-ai-web-dev-sdk'?{create:async()=>{throw new Error('UNEXPECTED_PROVIDER_FALLBACK')}}:require(id);
      mod._compile(code,'actual-llm-recovery.cjs');
      try{const value=await mod.exports.chatJSON('synthetic-role','synthetic-task',3000,'mimo');process.stdout.write(JSON.stringify(value));}
      catch(e){process.stderr.write(e.message);process.exitCode=1;}
    });`
  try{
    const child=spawn(process.execPath,['-e',childScript],{cwd:fileURLToPath(new URL('../',import.meta.url)),env:{...process.env,DEEPSEEK_API_KEY:'fake-recovery-test-only',DEEPSEEK_BASE_URL:`http://127.0.0.1:${server.address().port}`,DEEPSEEK_MODEL:'local-synthetic-only'}})
    let output='',errors='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>errors+=b)
    const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve)})
    child.stdin.end(source)
    assert.equal(await done,0,errors)
    assert.deepEqual(JSON.parse(output),{answer:'recovered',facts:[]})
    assert.equal(bodies.length,2)
    assert.deepEqual(bodies[0],bodies[1])
    assert.equal(bodies[0].messages[1].content,'synthetic-task')
  }finally{await new Promise(resolve=>server.close(resolve))}
})
