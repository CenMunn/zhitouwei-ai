import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { redact } from './model-run-utils.mjs'

// Optional runtime observer; no model selection, prompt, score or gate changes.
// Only chat/completions requests are copied. Headers and other HTTP traffic are excluded.
const traceFile=process.env.MODEL_TRACE_FILE
if(traceFile) {
  fs.mkdirSync(path.dirname(traceFile),{recursive:true})
  const knownSecrets=[]
  for(const p of [path.resolve('.z-ai-config'),path.join(os.homedir(),'.z-ai-config')]) {
    try{const c=JSON.parse(fs.readFileSync(p,'utf8'));knownSecrets.push(c.apiKey,c.token)}catch{}
  }
  const secrets=()=>[...knownSecrets,...Object.entries(process.env).filter(([k])=>/API_KEY|SECRET|PASSWORD|ACCESS_TOKEN/.test(k)).map(([,v])=>v)]
  const append=event=>{try{fs.appendFileSync(traceFile,JSON.stringify(redact(event,secrets()))+'\n')}catch{}}
  const original=globalThis.fetch.bind(globalThis)
  globalThis.fetch=async function(input,init) {
    const url=input instanceof Request ? input.url : String(input)
    let address
    try{address=new URL(url)}catch{return original(input,init)}
    if(!address.pathname.endsWith('/chat/completions')) return original(input,init)
    const requestId=crypto.randomUUID()
    let request
    try{const body=init?.body??(input instanceof Request?await input.clone().text():null);request=typeof body==='string'?JSON.parse(body):{capture:'unsupported_body'}}catch{request={capture:'unreadable_body'}}
    const started=Date.now()
    append({kind:'llm_start',requestId,pid:process.pid,startedAt:new Date(started).toISOString(),endpoint:address.origin+address.pathname,request})
    try {
      const response=await original(input,init)
      let content
      try{content=await response.clone().json()}catch{content={capture:'non_json_or_unreadable_response'}}
      append({kind:'llm_end',requestId,pid:process.pid,finishedAt:new Date().toISOString(),durationMs:Date.now()-started,httpStatus:response.status,response:content})
      return response
    }catch(e){
      append({kind:'llm_end',requestId,pid:process.pid,finishedAt:new Date().toISOString(),durationMs:Date.now()-started,httpStatus:null,error:{name:e.name,message:e.message}})
      throw e
    }
  }
}
