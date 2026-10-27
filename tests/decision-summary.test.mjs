import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import Module, { createRequire } from 'node:module'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'

const root = path.resolve(import.meta.dirname, '..')
const require = createRequire(import.meta.url)
const cache = new Map()
function load(file) {
  if (cache.has(file)) return cache.get(file).exports
  const mod = new Module(file); cache.set(file, mod)
  mod.require = id => {
    if (id === 'lightweight-charts') return {}
    if (id.startsWith('@/')) {
      const base = path.join(root, 'src', id.slice(2))
      return load(['.ts', '.tsx', '/index.ts'].map(ext => base + ext).find(p => fs.existsSync(p)))
    }
    return require(id)
  }
  mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  }}).outputText, file)
  return mod.exports
}
const { OverviewTab } = load(path.join(root, 'src/components/research/overview-tab.tsx'))
const conclusion = {
  status: 'complete', summary: '经营现金流规模较大，但质量判断仍需结合现金流构成。',
  points: ['已比较同年度现金流金额。'], risks: ['净额不能等同于回款总额。'], missing: ['投资现金流明细'],
  sourceIds: ['annual-report-p6'], investmentRating: null, completeSemanticVerification: false,
  scoreSummary: { score: 63, confidence: 36, label: '综合投资吸引力', basis: 'ai_estimate', components: [], method: '基于本轮角色评分加权。' },
}
function render(researchConclusion, decision = null) {
  return renderToStaticMarkup(React.createElement(OverviewTab, { detail: {
    session: { id: 'regression', status: 'completed', query: '现金流比较', stockCode: null, stockName: '开发案例',
      meta: { audit: { researchConclusion } } }, agents: [], debates: [], decision,
  }, onOpenDecision: () => {} }))
}
test('completed conditional research shows its saved decision and score in overview', () => {
  const html = render(conclusion)
  assert.doesNotMatch(html, /本轮未生成投资决议/)
  assert.match(html, /投资决议/)
  assert.match(html, /63/)
  assert.ok(html.includes(conclusion.summary))
  assert.match(html, /查看完整决议/)
  assert.doesNotMatch(html, /建议仓位/)
})
test('partial research remains visibly partial while showing its available conclusion', () => {
  const html = render({ ...conclusion, status: 'partial' })
  assert.ok(html.includes(conclusion.summary))
  assert.match(html, /部分分析未完成/)
})
test('unavailable evidence never presents baseline 50 as an investment score', () => {
  const html = render({ ...conclusion, status: 'unavailable', scoreSummary: { ...conclusion.scoreSummary, score: 50, confidence: 0, basis: 'baseline' } })
  assert.match(html, /暂不作方向判断/)
  assert.match(html, /不作为投资评分/)
  assert.doesNotMatch(html, /综合投资吸引力/)
})
test('a completed record without any conclusion is not fabricated into an investment decision', () => {
  const html = render(undefined)
  assert.match(html, /本轮未生成投资决议/)
  assert.ok(!html.includes(conclusion.summary))
})
test('existing formal decisions keep their original rating and position fields', () => {
  const html = render(conclusion, { finalScore: 74, initialScore: 80, riskPenalty: 6, confidence: 60, rating: 'BUY', positionMin: 1, positionMax: 3, horizon: '中期' })
  assert.match(html, /BUY/)
  assert.match(html, /建议仓位/)
  assert.ok(!html.includes(conclusion.summary))
})
