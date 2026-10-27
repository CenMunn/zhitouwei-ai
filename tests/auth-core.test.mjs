import test from 'node:test'
import assert from 'node:assert/strict'
const auth=await import('../src/lib/auth/core.ts')
test('password hashes have independent salts and verify without storing plaintext',async()=>{
 const a=await auth.hashPassword('StrongPassword123'),b=await auth.hashPassword('StrongPassword123')
 assert.notEqual(a,b);assert.ok(!a.includes('StrongPassword123'))
 assert.equal(await auth.verifyPassword('StrongPassword123',a),true)
 assert.equal(await auth.verifyPassword('WrongPassword123',a),false)
 assert.equal(await auth.verifyPassword('StrongPassword123','scrypt:broken'),false)
})
test('credential validation canonicalizes names and rejects unsafe or unbounded input',()=>{
 assert.deepEqual(auth.validateCredentials({username:' Analyst_A ',password:'StrongPassword123'}),{username:'analyst_a',password:'StrongPassword123'})
 for(const v of [{username:'admin;DROP',password:'StrongPassword123'},{username:'ab',password:'StrongPassword123'},{username:'validname',password:'short'},{username:'validname',password:'a'.repeat(129)},{username:[],password:'StrongPassword123'}])assert.throws(()=>auth.validateCredentials(v))
})
test('ownership defaults to the actual user; only a server-loaded administrator may view all',()=>{
 assert.deepEqual(auth.ownerFilter({id:'A',role:'USER'}),{ownerId:'A'})
 assert.deepEqual(auth.ownerFilter({id:'A',role:'ADMIN'}),{})
})
test('write requests reject missing and foreign origins including misleading host prefixes',()=>{
 const req=(origin,extra={})=>new Request('http://127.0.0.1:3141/api/auth/login',{method:'POST',headers:{...(origin?{origin}:{}),...extra}})
 assert.doesNotThrow(()=>auth.assertSameOrigin(req('http://127.0.0.1:3141')))
 for(const origin of [null,'null','http://evil.example','http://127.0.0.1:3141.evil.example'])assert.throws(()=>auth.assertSameOrigin(req(origin)))
 assert.throws(()=>auth.assertSameOrigin(req('http://127.0.0.1:3141',{'sec-fetch-site':'cross-site'})))
})
test('tokens use 256 random bits and only a one-way digest is stored',()=>{
 const a=auth.createToken(),b=auth.createToken();assert.notEqual(a,b)
 assert.equal(a.length,43);assert.equal(auth.hashToken(a).length,64);assert.notEqual(auth.hashToken(a),a)
})
