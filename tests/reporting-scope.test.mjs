import test from 'node:test'
import assert from 'node:assert/strict'
import * as scope from '../src/lib/research-evidence/scope.ts'

const r={id:'dev:cash',kind:'filing',scope:'consolidated',label:'经营活动产生的现金流量净额',metric:'ocf',value:123,unit:'元',currency:'CNY',period:'2023年度'}
const review=(raw,records=[r])=>scope.reviewReportingClaims(raw,{records,contexts:[]})

test('table totals cannot support subsidiary attribution without an explicit source statement',()=>{
 assert.ok(review({details:'母公司投资收益主要来自对子公司的分红。'}).issues.some(i=>i.code==='UNSUPPORTED_ATTRIBUTION'))
 assert.ok(review({answer:'存货差额主要由非全资子公司形成。'}).issues.some(i=>i.code==='UNSUPPORTED_ATTRIBUTION'))
 assert.equal(review({answer:'不能认为母公司投资收益全部来自对子公司分红，缺少明细。'}).issues.length,0)
 const text='投资收益主要来自对子公司分红'
 assert.equal(scope.reviewReportingClaims({answer:text},{records:[],contexts:[{excerpt:text}]}).issues.length,0)
})
test('blank rows and PE per-share dimensions are checked in extra text',()=>{
 assert.ok(review({details:'借款一行空白，因此公司没有借款。'}).issues.some(i=>i.code==='BLANK_AS_ZERO'))
 assert.equal(review({answer:'借款行空白不能证明没有借款。'}).issues.length,0)
 assert.ok(review({answer:'市盈率=总市值/基本每股收益。'}).issues.some(i=>i.code==='VALUATION_FORMULA_MISMATCH'))
 assert.equal(review({answer:'市盈率=股价/EPS或总市值/同口径归母净利润。'}).issues.length,0)
})
test('explicit signed arithmetic contradictions are blocked without executing code',()=>{
 assert.ok(review({details:'计算：100+20-30=150元。'}).issues.some(i=>i.code==='ARITHMETIC_MISMATCH'))
 assert.equal(review({details:'计算：(100+20)-30=90元。'}).issues.length,0)
 assert.equal(scope.evaluateNumericExpression('process.exit()'),null)
 assert.equal(scope.evaluateNumericExpression('(100+20)/3'),40)
 assert.equal(scope.evaluateNumericExpression('1/0'),null)
})
test('same page changes tables by exact heading, not the first or last page-wide scope',()=>{
 const x=scope.resolveReportingScope('上页利润\n合并利润表\n净利润 200\n母公司利润表\n净利润 100')
 assert.equal(x.scope,'mixed'); assert.equal(x.tailScope,'parent_company')
 assert.equal(x.blocks.find(b=>b.text.includes('净利润 200')).scope,'consolidated')
 assert.equal(x.blocks.find(b=>b.text.includes('净利润 100')).scope,'parent_company')
})
test('a continuation inherits supplied preceding table scope and splits at the next heading',()=>{
 const x=scope.resolveReportingScope('权益合计 100\n3、合并利润表\n营业收入 150','parent_company')
 assert.equal(x.blocks[0].scope,'parent_company'); assert.equal(x.tailScope,'consolidated')
})
test('ownership notes and parent-attributable lines cannot masquerade as parent-company statements',()=>{
 assert.equal(scope.resolveReportingScope('本公司的母公司为开发控股集团。归属于母公司股东的净利润100。').scope,'unknown')
 assert.equal(scope.resolveReportingScope('公司公告提及合并利润表，未提供表格。').scope,'unknown')
})
test('no preceding heading means unknown, never infer group scope just from a value',()=>{
 assert.equal(scope.resolveReportingScope('经营活动现金流量净额 123').scope,'unknown')
})
test('group cash cannot support a parent-company claim, including nested extra citations',()=>{
 assert.ok(review({details:{nested:{evidence:[{evidenceId:r.id,claim:'母公司单体经营活动现金流量净额为123元。'}]}}}).issues.some(i=>i.code==='REPORTING_SCOPE_MISMATCH'))
 assert.equal(review({evidence:[{evidenceId:r.id,claim:'合并经营活动现金流量净额为123元。'}]}).issues.length,0)
})
test('parent-attributable is a metric within consolidated accounts, not parent-only income',()=>{
 const record={...r,metric:'netProfit',scope:'parent_attributable',label:'归属于上市公司股东的净利润'}
 assert.ok(review({evidence:[{evidenceId:r.id,claim:'母公司单体净利润123元'}]},[record]).issues.length)
 assert.equal(review({evidence:[{evidenceId:r.id,claim:'归属于上市公司股东的净利润123元'}]},[record]).issues.length,0)
 assert.ok(review({evidence:[{evidenceId:r.id,claim:'合并净利润为123元'}]},[record]).issues.some(i=>i.code==='PROFIT_ATTRIBUTION_MISMATCH'))
})
test('explicit model reporting scope must agree with server evidence even when its prose is vague',()=>{
 assert.ok(review({evidence:[{evidenceId:r.id,claim:'现金流123元',reportingScope:'parent_company'}]}).issues.length)
})
test('negative boundary explanations do not become affirmative scope assertions',()=>{
 assert.equal(review({evidence:[{evidenceId:r.id,claim:'合并经营现金净额123元，不等于母公司单体金额。'}]}).issues.length,0)
})

test('immediate 非 scope negation is accepted without hiding an affirmative claim after 扣非',()=>{
 for(const wording of ['非母公司单体净利润','而非母公司单体净利润']) {
  assert.equal(review({evidence:[{evidenceId:r.id,claim:`合并归属指标123元（${wording}）`}]}).issues.length,0)
 }
 assert.ok(review({evidence:[{evidenceId:r.id,claim:'扣非归母净利润之外，母公司单体经营现金流123元'}]}).issues.some(i=>i.code==='REPORTING_SCOPE_MISMATCH'))
 for(const wording of ['扣非','扣非 ','扣 非 ']) {
  assert.ok(review({evidence:[{evidenceId:r.id,claim:`${wording}母公司单体经营现金流123元`}]}).issues.some(i=>i.code==='REPORTING_SCOPE_MISMATCH'))
  assert.ok(review({report:`${wording}母公司单体经营现金流123元，来源dev:cash`}).issues.some(i=>i.code==='REPORTING_SCOPE_MISMATCH'))
 }
})
test('unconditional ranking and guarantees need substantive sources in any output field',()=>{
 assert.ok(review({answer:'原值123元',details:{extra:'该企业行业第一，未来保证不会亏损。'}}).issues.some(i=>i.code==='UNSUPPORTED_CERTAINTY'))
 assert.equal(review({answer:'没有同行数据，不能断定该企业行业第一，无法保证不会亏损。'}).issues.length,0)
})
test('PE definitions cannot reverse denominator in correct-answer extras',()=>{
 assert.ok(review({answer:'价格资料不足',details:'计算市盈率时，净利润作为分子，市值作为分母。'}).issues.some(i=>i.code==='VALUATION_FORMULA_MISMATCH'))
 assert.equal(review({answer:'市盈率=总市值/归母净利润。不能把净利润作为分子。'}).issues.length,0)
})
test('scope review is explicitly incomplete semantic verification and preserves raw text',()=>{
 const raw={answer:'正常来源解释'}; const copy=JSON.stringify(raw); const x=review(raw)
 assert.equal(x.completeSemanticVerification,false); assert.equal(JSON.stringify(raw),copy)
})

test('unstructured report scope claims need a traceable compatible record or stay blocked',()=>{
 assert.ok(review({report:'母公司单体经营现金流123元，来源dev:cash'}).issues.some(i=>i.code==='REPORTING_SCOPE_MISMATCH'))
 assert.ok(review({report:'母公司单体经营现金流为123元。'}).issues.some(i=>i.code==='REPORTING_SCOPE_UNVERIFIED'))
 assert.equal(review({report:'合并经营现金流123元，来源dev:cash。不能据此判断母公司单体金额。'}).issues.length,0)
})
test('a main-accounting-data heading after subsidiary context is not a causal claim',()=>{
 const result=review({summary:'财务子公司存款变动及收入确认口径差异影响可比性，比较限于主要会计数据表列示金额。'})
 assert.ok(!result.issues.some(i=>i.code==='UNSUPPORTED_ATTRIBUTION'))
 assert.ok(review({summary:'子公司是利润差额的主要原因。'}).issues.some(i=>i.code==='UNSUPPORTED_ATTRIBUTION'))
})
