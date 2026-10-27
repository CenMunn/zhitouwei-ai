import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
const base=process.env.TEST_BASE_URL??'http://127.0.0.1:3141'
const call=(route,{method='GET',body,cookie,origin=base}={})=>fetch(base+route,{method,headers:{...(method!=='GET'?{'Content-Type':'application/json',Origin:origin}:{}),...(cookie?{Cookie:cookie}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})})
const stamp=Date.now().toString(36),password='TestPassword12345'
let a,b,admin,runId
test('private routes require a session before revealing or modifying data',async()=>{
 for(const route of ['/api/sessions','/api/research','/api/research/ev_missing','/api/watchlist','/api/evidence-export?runId=ev_missing','/api/admin/users'])assert.equal((await call(route)).status,401,route)
 for(const route of ['/api/research','/api/evidence-check','/api/evidence-comparison','/api/compare','/api/watchlist','/api/portfolio'])assert.equal((await call(route,{method:'POST',body:{}})).status,401,route)
 assert.equal((await call('/api/sessions/ev_missing',{method:'DELETE'})).status,401)
})
test('self-registration cannot elevate privileges, creates hashed SQL accounts and HttpOnly cookies',async()=>{
 assert.equal((await call('/api/auth/register',{method:'POST',body:{username:'elevate_'+stamp,password,role:'ADMIN'}})).status,400)
 for(const label of ['a','b']){
  const res=await call('/api/auth/register',{method:'POST',body:{username:'tester_'+label+'_'+stamp,password,displayName:'权限验证'+label}})
  assert.equal(res.status,201,await res.clone().text());const body=await res.json()
  assert.equal(body.user.role,'USER');assert.equal(body.user.passwordHash,undefined)
  assert.match(res.headers.get('set-cookie'),/HttpOnly/i);assert.match(res.headers.get('set-cookie'),/SameSite=Lax/i)
  const cookie=res.headers.get('set-cookie').split(';')[0]
  if(label==='a')a={...body.user,cookie};else b={...body.user,cookie}
 }
 assert.equal((await call('/api/admin/users',{cookie:a.cookie})).status,403)
})
test('source-check results persist for their owner and stay hidden from another user',async()=>{
 const res=await call('/api/evidence-check',{method:'POST',body:{stockCode:'600519'},cookie:a.cookie});assert.equal(res.status,200)
 runId=(await res.json()).sessionId
 assert.equal((await call('/api/research/'+runId,{cookie:a.cookie})).status,200)
 assert.equal((await call('/api/research/'+runId,{cookie:b.cookie})).status,404)
 assert.equal((await call('/api/evidence-export?runId='+runId,{cookie:b.cookie})).status,404)
 const rows=await (await call('/api/sessions',{cookie:b.cookie})).json();assert.ok(!rows.sessions.some(s=>s.id===runId));assert.equal(rows.sessions.length,0)
 assert.equal((await call('/api/sessions/'+runId,{method:'DELETE',cookie:b.cookie})).status,404)
 assert.equal((await call('/api/watchlist',{method:'POST',cookie:b.cookie,body:{sessionId:runId}})).status,404)
 assert.equal((await call('/api/evidence-export?runId='+runId,{cookie:a.cookie})).status,200)
})
test('origin checks protect login, logout, admin changes and private mutation routes',async()=>{
 for(const route of ['/api/auth/login','/api/auth/register','/api/auth/logout','/api/evidence-check','/api/research','/api/admin/users']){
  const res=await call(route,{method:route==='/api/admin/users'?'PATCH':'POST',body:{},cookie:a.cookie,origin:'https://evil.example'})
  assert.equal(res.status,403,route)
 }
})
test('administrator can inspect records, disable a user, and invalidate existing sessions',async()=>{
 const accounts=JSON.parse(await fs.readFile(process.env.TEST_ADMIN_CREDENTIALS_PATH??new URL('../.local/admin-credentials.json',import.meta.url),'utf8'))
 const credentials=Array.isArray(accounts)?accounts.find(a=>a.role==='ADMIN'):accounts
 const login=await call('/api/auth/login',{method:'POST',body:credentials});assert.equal(login.status,200)
 admin=login.headers.get('set-cookie').split(';')[0]
 const users=await (await call('/api/admin/users',{cookie:admin})).json();assert.ok(users.users.some(u=>u.id===a.id));assert.ok(users.users.every(u=>!('passwordHash'in u)))
 assert.equal((await call('/api/research/'+runId,{cookie:admin})).status,200)
 assert.equal((await call('/api/admin/users',{method:'PATCH',cookie:admin,body:{id:a.id,disabled:true}})).status,200)
 assert.equal((await call('/api/sessions',{cookie:a.cookie})).status,401)
 assert.equal((await call('/api/auth/login',{method:'POST',body:{username:a.username,password}})).status,401)
 assert.equal((await call('/api/admin/users',{method:'PATCH',cookie:admin,body:{id:a.id,disabled:false}})).status,200)
})
test('logout revokes the server-side session and direct calls cannot bypass the UI',async()=>{
 assert.equal((await call('/api/auth/logout',{method:'POST',cookie:b.cookie})).status,200)
 assert.equal((await call('/api/sessions',{cookie:b.cookie})).status,401)
 const result=await (await call('/api/questions',{method:'POST',body:{query:'什么是市盈率'}})).json()
 assert.equal(result.kind,'explanation');assert.equal(result.researchAllowed,false)
})
