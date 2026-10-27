import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchReportMarkdown } from '../src/lib/research/report-download.ts'

test('authenticated report download reads markdown via fetch before creating a file', async () => {
  const md = '# 报告\n\n可追溯结论'
  assert.equal(await fetchReportMarkdown('/api/evidence-export?runId=test&format=md', async (url, options) => {
    assert.equal(options.headers['ngrok-skip-browser-warning'], '1')
    assert.equal(options.credentials, 'same-origin')
    return new Response(md, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } })
  }), md)
})
test('HTML tunnel warning is never saved as a successful research report', async () => {
  await assert.rejects(fetchReportMarkdown('/api/evidence-export', async () => new Response('<html>ERR_NGROK_6024</html>', { headers: { 'Content-Type': 'text/html' } })), /有效报告/)
})
test('expired login and transport failures produce a download error', async () => {
  await assert.rejects(fetchReportMarkdown('/api/evidence-export', async () => new Response('{"error":"请重新登录"}', { status: 401, headers: { 'Content-Type': 'application/json' } })), /请重新登录/)
})
