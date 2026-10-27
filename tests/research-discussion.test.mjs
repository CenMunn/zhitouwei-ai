import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import Module from 'node:module'
import * as engine from '../src/lib/research-evidence/engine.ts'
import * as scope from '../src/lib/research-evidence/scope.ts'
import * as scoring from '../src/lib/research/investment-score.ts'
import * as attribution from '../src/lib/research/attribution-review.ts'
const code=ts.transpileModule(fs.readFileSync(new URL('../src/lib/research/discussion.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const mod=new Module('discussion-test');mod.require=id=>id.endsWith('/engine')?engine:id.endsWith('/investment-score')?scoring:id.endsWith('/attribution-review')?attribution:scope;mod._compile(code,'discussion-test.cjs')
const {discussionSources,validateResearchTurn,buildDiscussionReport,runResearchDiscussion}=mod.exports
const now='2026-10-18T01:00:00Z'
const record={id:'f1',stockCode:'600519',kind:'filing',metric:'operatingCashFlow',label:'经营活动现金流量净额',value:100,unit:'元',currency:'CNY',period:'2025年度',scope:'consolidated',reportingScope:'consolidated',publishedAt:'2026-04-01',capturedAt:now,validUntil:'2027-01-01',source:'年报',sourceUrl:'https://example.org/annual.pdf',locator:'第6页',excerpt:'经营活动现金流量净额100元',verification:'source_checked'}
const input={query:'比较2025年度现金流',stockName:'贵州茅台',records:[record],contexts:[],now,analyses:[]}
const valid={summary:'经营现金流为正，可作为观察经营回款的起点。',points:['需结合现金流明细进一步判断。'],risks:['不能单凭现金流判断估值。'],missing:['投资和筹资现金流明细'],sourceIds:['f1']}

test('detailed report carries accepted analysis and limitations beyond the card summary',()=>{
 const report=buildDiscussionReport({...input,runId:'rich',turns:[],ratingReasons:[],analyses:[{
  key:'fundamental',name:'基本面分析师',summary:'金额比较只是研究起点。',executionStatus:'ok',
  highlights:['净额规模与主业回款的解释需要区分。'],concerns:['尚无投资和筹资活动现金流明细。'],evidence:[],
 }]})
 assert(report.includes('净额规模与主业回款的解释需要区分。'))
 assert(report.includes('尚无投资和筹资活动现金流明细。'))
 assert(report.includes('分析与判断'))
})

test('baseline sections explain conditional transmission without restoring unsupported original candidates',()=>{
 const report=buildDiscussionReport({...input,runId:'baseline',turns:[],ratingReasons:[],analyses:[{
  key:'industry',name:'行业分析师',summary:'信息不足，先观察。',executionStatus:'ok',basis:'baseline',
  highlights:['行业已进入强复苏。'],details:{baselineAnalysis:{summary:'行业排名第一，需求增长99%。'}},evidence:[],
 },{key:'macro',name:'宏观策略分析师',summary:'先观察宏观条件。',executionStatus:'ok',basis:'baseline'},
 {key:'sentiment',name:'舆情分析师',summary:'没有可用事件。',executionStatus:'ok',basis:'baseline'}]})
 assert(report.includes('条件性分析'))
 assert(report.includes('渠道库存'))
 assert(report.includes('融资成本'))
 assert(report.includes('公告日期'))
 assert(!report.includes('强复苏'));assert(!report.includes('99%'));assert(!report.includes('排名第一'))
})

test('technical report uses registered current-company indicators and retains their sources',()=>{
 const q=(id,stockCode,metric,value)=>({...record,id,stockCode,kind:'calculation',metric,label:metric,value,unit:metric==='ma20'?'元':'分',period:'截至2026-10-18',scope:undefined})
 const report=buildDiscussionReport({...input,stockCode:'600519',records:[record,q('quant:600519:momentum','600519','momentum',61),q('quant:600519:ma20','600519','ma20',1320),q('quant:000858:momentum','000858','momentum',41),{...q('quant:600519:rsi14','600519','rsi14',65),validUntil:'2025-01-01'}],runId:'quant',turns:[],ratingReasons:[],analyses:[{key:'quant',name:'量化分析师',summary:'短摘要',executionStatus:'limited',basis:'source_based'}]})
 assert(report.includes('技术指标明细'));assert(report.includes('61'));assert(report.includes('1,320'))
 assert(report.includes('quant:600519:momentum'));assert(report.includes('动量'))
 assert(!report.includes('quant:000858:momentum'));assert(!report.includes('quant:600519:rsi14'))
})

test('failed and rejected analysis text is not promoted into detailed conclusions',()=>{
 const report=buildDiscussionReport({...input,runId:'rejected',turns:[],ratingReasons:[],analyses:[{
  key:'fundamental',name:'基本面分析师',summary:'未经核实的强烈看好',executionStatus:'review_required',
  highlights:['确定增长999%'],concerns:[],evidence:[],
 }]})
 assert(!report.includes('未经核实的强烈看好'));assert(!report.includes('999%'))
 assert(report.includes('原始候选'))
})

test('report comparisons require equal period, unit, currency and reporting scope',()=>{
 const a={...record,id:'a',metric:'ocf',value:100,stockCode:'A'},b={...record,id:'b',metric:'ocf',value:60,stockCode:'B'}
 const options={...input,stockCode:'A',companies:{A:'甲公司',B:'乙公司'},runId:'comparison',turns:[],ratingReasons:[],analyses:[{key:'fundamental',name:'基本面分析师',summary:'财报比较',executionStatus:'ok'}]}
 const report=buildDiscussionReport({...options,records:[a,b]})
 assert(report.includes('甲公司'));assert(report.includes('乙公司'));assert(report.includes('相差40'))
 const mixed=buildDiscussionReport({...options,records:[a,{...b,unit:'千元'}]})
 assert(!mixed.includes('相差40'))
})

test('numeric citation metadata cannot endorse a different number hidden in model prose',()=>{
 for(const amount of ['999','2025']){
 const claim={claim:`经营现金流净额为${amount}元。`,evidenceId:'f1',value:'100',unit:'元',currency:'CNY',period:'2025年度',reportingScope:'consolidated'}
 const report=buildDiscussionReport({...input,records:[{...record,metric:'ocf'}],runId:'prose',turns:[],ratingReasons:[],analyses:[{key:'fundamental',name:'基本面分析师',summary:'研究摘要',executionStatus:'ok',highlights:[claim.claim],evidence:[claim]}]})
 assert(!report.includes(`${amount}元`))
 }
})

test('cash differences retain source decimal precision rather than floating-point noise',()=>{
 const records=[{...record,id:'a',metric:'ocf',stockCode:'600519',value:61522204989.35},{...record,id:'b',metric:'ocf',stockCode:'000858',value:29706259919.13}]
 const report=buildDiscussionReport({...input,records,runId:'decimal',turns:[],ratingReasons:[],analyses:[{key:'fundamental',name:'基本面分析师',summary:'研究摘要',executionStatus:'ok'}]})
 assert(report.includes('相差31,815,945,070.22元'))
 assert(!report.includes('219997'))
})

test('discussion display is concise while full sources and missing details remain in raw turns',()=>{
 assert.equal(typeof mod.exports.discussionDisplay,'function')
 const turn={...valid,status:'ok',issues:[],role:'bull',durationMs:1,calls:[]}
 const text=mod.exports.discussionDisplay(turn)
 assert.ok(text.length<=220);assert.ok(!text.includes('依据：'));assert.ok(!text.includes('待补：'))
 assert.ok(turn.missing.length);assert.ok(turn.sourceIds.length)
})

test('risk score metadata is separate from numeric financial claims',()=>{
 const r=validateResearchTurn({...valid,score:68,confidence:35,scoreReason:'现金流方向明确，构成仍需细看'},input)
 assert.equal(r.status,'ok');assert.equal(r.score,68);assert.equal(r.confidence,35)
})

test('negative responses and warnings from actual QA are accepted while positive claims remain blocked',()=>{
 for(const summary of ['把绝对额领先当成现金转化更优，容易误判。','我只把它当规模比较，不当回款质量更优。','现金转化并不更好。','现金转化更好这个判断不成立。']){
  assert.equal(validateResearchTurn({...valid,summary},input).status,'ok',summary)
 }
 assert.equal(validateResearchTurn({...valid,summary:'不能说甲公司现金转化更好，但乙公司回款质量更强。'},input).status,'review_required')
 assert.equal(validateResearchTurn({...valid,summary:'乙公司现金转化更好，应该看好。'},input).status,'review_required')
})

test('AI polarity review clears an exact archived warning without rewriting it or pretending human approval',async()=>{
 const warning={...valid,points:['规模优势成立，但不延伸为回款质量或现金转化更优。']}
 let reviews=0,repairs=0
 const result=await runResearchDiscussion(input,async(role,_s,u)=>{
  if(role.endsWith(':semantic_review')){reviews++;return {value:{assessments:JSON.parse(u).passages.map((quotedText,index)=>({index,quotedText,classification:'negation_or_warning',reason:'明确否定延伸'}))},calls:[{responseModel:'test-semantic'}]}}
  if(role.endsWith(':repair'))repairs++
  return {value:warning,calls:[]}
 },async()=>{})
 assert.equal(result.conclusion.status,'complete');assert.equal(reviews,6);assert.equal(repairs,0)
 assert(result.turns.every(t=>t.polarityReviews[0].accepted));assert.deepEqual(result.turns[0].original,warning)
 assert.equal(result.conclusion.completeSemanticVerification,false)
})

test('an AI warning verdict never overrides an unknown source',async()=>{
 let reviews=0
 const result=await runResearchDiscussion(input,async(role)=>{if(role.endsWith(':semantic_review'))reviews++;return {value:{...valid,points:['不延伸为现金转化更优。'],sourceIds:['unknown-source']},calls:[]}},async()=>{})
 assert.equal(reviews,0);assert.equal(result.conclusion.status,'unavailable')
})

test('a cited note can support a paraphrased cause while retaining the exact candidate and review',async()=>{
 const ctx={id:'note1',stockCode:'600519',period:'2025年度',documentSha256:'doc',verification:'source_checked',publishedAt:'2026-04-01',validUntil:'2027-01-01',sourceUrl:'https://example.org/annual.pdf',locator:'第6页说明',excerpt:'经营活动产生的现金流量净额减少主要是本期公司控股子公司贵州茅台集团财务有限公司吸收集团公司成员单位存款减少及不可随时支取的同业存款增加。',source:'年报'}
 const p={...input,companies:{'600519':'贵州茅台','000858':'五粮液'},records:[{...record,documentSha256:'doc'}],contexts:[ctx]}
 const candidate={...valid,summary:'茅台经营现金流净额减少主要来自财务子公司存款变动，不能当作主业回款信号。',sourceIds:['f1','note1']}
 let reviews=0
 const result=await runResearchDiscussion(p,async(role,_s,user)=>{
  if(role.endsWith(':attribution_review')){reviews++;return {value:{assessments:JSON.parse(user).claims.map((claim,index)=>({index,claimText:claim.claimText,sourceId:'note1',evidenceQuote:ctx.excerpt,classification:'supported',reason:'同主体、同年度且只解释经营现金流净额减少。'}))},calls:[{responseModel:'test-review'}]}}
  return {value:candidate,calls:[]}
 },async()=>{})
 assert.equal(result.conclusion.status,'complete');assert.equal(reviews,6)
 assert.deepEqual(result.turns[0].original,candidate)
 assert.equal(result.turns[0].attributionReviews[0].supported.length,1)
 assert.equal(result.conclusion.completeSemanticVerification,false)
 const uncited=await runResearchDiscussion(p,async(role)=>{
  assert.ok(!role.endsWith(':attribution_review'))
  return {value:{...candidate,sourceIds:['f1']},calls:[]}
 },async()=>{})
 assert.equal(uncited.conclusion.status,'unavailable')
 const wrongObject={...candidate,summary:'茅台经营现金流低于归母净利润主要来自财务子公司存款变动。'}
 assert.equal(validateResearchTurn(wrongObject,p).status,'review_required')
 let attributionCalls=0
 const wrong=await runResearchDiscussion(p,async(role)=>{
  if(role.endsWith(':attribution_review'))attributionCalls++
  return {value:wrongObject,calls:[]}
 },async()=>{})
 assert.equal(attributionCalls,0,'A different causal object must not be sent for a soft override')
 assert.equal(wrong.conclusion.status,'unavailable')
})
test('discussion accepts source facts without opening the investment gate',()=>{
 assert.equal(discussionSources(input).length,1)
 assert.equal(engine.canStartDecisionStages({records:[record],claims:[],failedAgents:[],quantitativeReady:false,now}).ready,false)
 assert.equal(discussionSources({...input,records:[{...record,verification:'demo'}]}).length,0)
 assert.equal(discussionSources({...input,query:'比较2024年度现金流'}).length,0)
})
test('unknown source and unsupported year are rejected, raw candidate retained',()=>{
 assert.equal(validateResearchTurn(valid,input).status,'ok')
 assert.equal(validateResearchTurn({...valid,sourceIds:['invented']},input).status,'review_required')
 const result=validateResearchTurn({...valid,summary:'2024年度经营现金流为100元。'},input)
 assert.equal(result.status,'review_required');assert.ok(result.original)
})
test('research-only report retains conclusion, debate and original unit with source locator',()=>{
 const turn={...valid,status:'ok',issues:[],role:'conclusion',durationMs:1,calls:[]}
 const md=buildDiscussionReport({...input,runId:'r1',turns:[{...turn,role:'bull'},turn],ratingReasons:['估值资料不全']})
 for(const text of ['研究结论','数据对照','分析','辩论与风险','来源附录','100','CNY','第6页'])assert.ok(md.includes(text),text)
 assert.ok(!md.includes('建议买入'))
})
test('all research stages run with partial evidence; failure never becomes a successful conclusion',async()=>{
 const seen=[]
 const result=await runResearchDiscussion(input,async(role)=>{seen.push(role);if(role==='risk')throw new Error('TIMEOUT');return {value:valid,calls:[]}},async()=>{})
 assert.deepEqual(seen,['bull','bear','bull_rebuttal','bear_rebuttal','risk','conclusion'])
 assert.equal(result.turns.find(t=>t.role==='risk').status,'failed')
 assert.equal(result.conclusion.status,'partial')
 assert.equal(result.conclusion.investmentRating,null)
})
test('no usable source means no model calls and no invented deliberation',async()=>{
 let calls=0;const result=await runResearchDiscussion({...input,records:[]},async()=>{calls++;return {value:valid,calls:[]}},async()=>{})
 assert.equal(calls,0);assert.equal(result.conclusion.status,'unavailable')
})

test('same-document accounting notes reach every debate role and the export',async()=>{
 const doc='abc',ctx={id:'context1',stockCode:'600519',period:'2025年度',documentSha256:doc,verification:'source_checked',publishedAt:'2026-04-01',validUntil:'2027-01-01',sourceUrl:'https://example.org/annual.pdf',locator:'第6页说明',excerpt:'经营现金流受成员单位存款变化影响',source:'年报'}
 const withContext={...input,records:[{...record,documentSha256:doc}],contexts:[ctx]}
 const result=await runResearchDiscussion(withContext,async(role,system,user)=>{assert.equal(JSON.parse(user).filingNotes[0].excerpt,ctx.excerpt);return {value:{...valid,sourceIds:['context1']},calls:[]}},async()=>{})
 assert.equal(result.conclusion.status,'complete')
 assert.match(buildDiscussionReport({...withContext,runId:'r1',turns:result.turns,ratingReasons:[]}),/经营现金流受成员单位存款变化影响/)
})

test('cash flow versus attributable profit direction is checked per company, not inferred from its peer',()=>{
 const p={...input,companies:{'600519':'甲公司','000858':'乙公司'},records:[{...record,metric:'ocf',value:60},{...record,id:'p1',metric:'netProfit',label:'归母净利润',value:80,scope:'parent_attributable'},{...record,id:'f2',stockCode:'000858',metric:'ocf',value:30},{...record,id:'p2',stockCode:'000858',metric:'netProfit',label:'归母净利润',value:9,scope:'parent_attributable'}]}
 assert.equal(validateResearchTurn({...valid,summary:'两家公司经营现金流均低于各自归母净利润。'},p).status,'review_required')
 assert.equal(validateResearchTurn({...valid,summary:'乙公司经营现金流低于归母净利润。'},p).status,'review_required')
 assert.equal(validateResearchTurn({...valid,summary:'甲公司经营现金流低于归母净利润，乙公司经营现金流高于归母净利润。'},p).status,'ok')
 assert.equal(validateResearchTurn({...valid,summary:'两家公司情况不同：甲公司经营现金流低于归母净利润，乙公司则高于归母净利润。'},p).status,'ok')
 assert.equal(validateResearchTurn({...valid,summary:'无法仅根据经营现金流高于归母净利润就判断回款质量。'},p).status,'ok')
 assert.equal(validateResearchTurn({...valid,summary:'乙公司经营现金流高于净利润，现金转化更好。'},p).status,'review_required')
 assert.equal(validateResearchTurn({...valid,summary:'乙公司现金转化更好，回款质量更强。'},p).status,'review_required')
 assert.equal(validateResearchTurn({...valid,summary:'不能据此认定乙公司现金转化更好。'},p).status,'ok')
 assert.equal(validateResearchTurn({...valid,summary:'所以我不接受用绝对额推出哪家现金创造更强。'},p).status,'ok')
 assert.equal(validateResearchTurn({...valid,summary:'甲公司现金创造规模处于行业前列。'},p).status,'review_required')
 assert.equal(validateResearchTurn({...valid,summary:'其经营现金流低于归母净利润，有财务子公司存款变动的附注解释。'},p).status,'review_required')
 assert.equal(validateResearchTurn({...valid,summary:'你用附注解释茅台低于归母净利润，这个解释只覆盖茅台一侧。'},p).status,'review_required')
 assert.equal(validateResearchTurn({...valid,summary:'附注解释现金流减少，不能解释其低于归母净利润的金额差额。'},p).status,'ok')
 assert.equal(validateResearchTurn({...valid,summary:'规模领先不等于现金转化更优。',missing:['乙公司经营现金流高于其归母净利润的具体成因说明。']},p).status,'ok')
})

test('a failed corrective call still retains the original rejected candidate and usage',async()=>{
 const result=await runResearchDiscussion(input,async role=>{if(role.endsWith(':repair'))throw new Error('TIMEOUT');return {value:{...valid,sourceIds:['invented']},calls:[{status:'ok',usage:{total_tokens:12}}]}},async()=>{})
 assert.equal(result.turns[0].status,'failed');assert.equal(result.turns[0].attempts.length,1);assert.equal(result.turns[0].original.sourceIds[0],'invented');assert.equal(result.turns[0].calls[0].usage.total_tokens,12)
 assert.equal(result.conclusion.status,'unavailable')
})
