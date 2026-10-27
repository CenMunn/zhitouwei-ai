import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import Module from 'node:module'
import ts from 'typescript'
import { NextResponse } from 'next/server.js'

let authorized, existing, providerFails, query, newsCalls
const news = [{ title: '真实来源测试夹具', source: '东方财富资讯', url: 'https://finance.eastmoney.com/a/fixture.html' }]
const code = ts.transpileModule(fs.readFileSync(new URL('../src/app/api/research/[id]/news/route.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const mod = new Module('company-news-route-test')
mod.require = id => {
  if (id === 'next/server') return { NextResponse }
  if (id.endsWith('/auth/server')) return {
    requireUser: async () => { if (!authorized) throw new Error('AUTH'); return { id: 'owner' } },
    authErrorResponse: e => e.message === 'AUTH' ? NextResponse.json({ error: '登录' }, { status: 401 }) : null,
    ownerFilter: user => ({ ownerId: user.id }),
  }
  if (id.endsWith('/db')) return { db: { researchSession: { findFirst: async q => { query = q; return existing ? { stockCode: '600519', stockName: '贵州茅台' } : null } } } }
  if (id.endsWith('/ai/search')) return { collectCompanyNews: async (name, code) => { newsCalls++; assert.equal(code, '600519'); if (providerFails) throw new Error('provider failed'); return news } }
  throw new Error(id)
}
mod._compile(code, 'company-news-route-test.cjs')
async function run(options = {}) {
  authorized = true; existing = true; providerFails = false; query = null; newsCalls = 0
  if (options.guest) authorized = false
  if (options.missing) existing = false
  if (options.failed) providerFails = true
  return mod.exports.GET(new Request('https://local/api/research/run/news'), { params: Promise.resolve({ id: 'run' }) })
}
test('latest feed enforces session ownership and does not update historical report metadata', async () => {
  const response = await run()
  assert.equal(response.status, 200)
  assert.deepEqual(query.where, { id: 'run', ownerId: 'owner' })
  const body = await response.json()
  assert.deepEqual(body.news, news)
  assert.equal(body.status, 'ok')
  assert.ok(Date.parse(body.fetchedAt))
  assert.equal(response.headers.get('cache-control'), 'no-store')
})
test('guest and inaccessible sessions never invoke the upstream provider', async () => {
  assert.equal((await run({ guest: true })).status, 401); assert.equal(newsCalls, 0)
  assert.equal((await run({ missing: true })).status, 404); assert.equal(newsCalls, 0)
})
test('provider failure returns an actionable JSON error rather than empty successful news', async () => {
  const response = await run({ failed: true })
  assert.equal(response.status, 502)
  assert.match((await response.json()).error, /刷新重试/)
})
