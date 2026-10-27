import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeCompanyNews, companyNewsSymbol, fetchCompanyNews } from '../src/lib/data/company-news.ts'

const now = Date.parse('2026-10-18T06:00:00Z')
const item = { title: '<em>贵州茅台</em>公告 &amp; 动态', summary: '<b>公开新闻摘要</b>', uniqueUrl: 'http://finance.eastmoney.com/a/202610173899042577.html', showDateTime: now - 3600000 }
const payload = rows => ({ gszx: { code: 0, data: { items: rows } } })
test('company codes select their proper exchange without accepting arbitrary URLs', () => {
  assert.equal(companyNewsSymbol('600519'), 'SH600519')
  assert.equal(companyNewsSymbol('000858'), 'SZ000858')
  assert.equal(companyNewsSymbol('SH600309'), 'SH600309')
  assert.equal(companyNewsSymbol('https://localhost'), null)
  assert.equal(companyNewsSymbol('NVDA'), null)
})
test('news is sourced, timestamped, sanitized and deduplicated without model sentiment fabrication', () => {
  const rows = normalizeCompanyNews(payload([item, item]), now)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].title, '贵州茅台公告 & 动态')
  assert.equal(rows[0].summary, '公开新闻摘要')
  assert.equal(rows[0].url, item.uniqueUrl.replace('http:', 'https:'))
  assert.equal(rows[0].date, new Date(item.showDateTime).toISOString())
  assert.equal(rows[0].source, '东方财富资讯')
  assert.equal(rows[0].sentiment, undefined)
})
test('future, stale, undated and non-news links cannot masquerade as recent news', () => {
  assert.deepEqual(normalizeCompanyNews(payload([
    { ...item, showDateTime: now + 1 }, { ...item, showDateTime: now - 91 * 86400000 },
    { ...item, showDateTime: 0 }, { ...item, uniqueUrl: 'javascript:alert(1)' },
    { ...item, uniqueUrl: 'https://eastmoney.com.evil.invalid/article' },
  ]), now), [])
})
test('upstream errors are distinct from a successful empty feed', () => {
  assert.throws(() => normalizeCompanyNews({ gszx: { code: 500 } }, now), /NEWS_RESPONSE_INVALID/)
  assert.deepEqual(normalizeCompanyNews(payload([]), now), [])
})
test('server uses the actual provider endpoint and reports network errors', async () => {
  const rows = await fetchCompanyNews('600519', { now, fetcher: async url => {
    assert.equal(String(url), 'https://emweb.securities.eastmoney.com/PC_HSF10/NewsBulletin/PageAjax?code=SH600519')
    return new Response(JSON.stringify(payload([item])))
  } })
  assert.equal(rows.length, 1)
  await assert.rejects(fetchCompanyNews('600519', { now, fetcher: async () => new Response('', { status: 502 }) }), /NEWS_HTTP_502/)
})
