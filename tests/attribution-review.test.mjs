import test from 'node:test'
import assert from 'node:assert/strict'
import { reviewAttributionSupport } from '../src/lib/research/attribution-review.ts'

const excerpt='经营活动产生的现金流量净额减少主要是本期公司控股子公司贵州茅台集团财务有限公司吸收集团公司成员单位存款减少及不可随时支取的同业存款增加。'
const claim='茅台该项减少主要来自财务子公司存款变动，不能当作主业回款信号'
const input={query:'比较茅台与五粮液2025年度现金流',companies:{'600519':'贵州茅台','000858':'五粮液'},aliases:{'600519':['茅台']},
  contexts:[{id:'context:600519:2025:accounting',stockCode:'600519',period:'2025年度',excerpt}],
  issues:[{code:'UNSUPPORTED_ATTRIBUTION',field:'output.summary',excerpt:claim}]}
const row=(overrides={})=>({index:0,claimText:claim,sourceId:input.contexts[0].id,evidenceQuote:excerpt,classification:'supported',reason:'同为茅台本年度经营现金流净额减少的主要原因，未外推其他主体。',...overrides})
const generate=(rows)=>async()=>({value:{assessments:rows},calls:[{model:'test'}]})

test('actual bear paraphrase is supported with exact quoted source; candidate is not rewritten',async()=>{
 const before=JSON.stringify(input),result=await reviewAttributionSupport(input,generate([row()]))
 assert.equal(result.eligible,true);assert.deepEqual(result.supported,[{field:'output.summary',excerpt:claim}])
 assert.equal(JSON.stringify(input),before);assert.equal(result.calls.length,1);assert.equal(result.assessment.assessments[0].classification,'supported')
})

test('non-attribution issues, absent source and ambiguous companies never call the model',async()=>{
 let calls=0;const model=async()=>{calls++;return {value:{assessments:[row()]},calls:[]}}
 const bad=[{...input,issues:[{...input.issues[0],code:'ARITHMETIC_MISMATCH'}]}, {...input,contexts:[]},
  {...input,issues:[{...input.issues[0],excerpt:'该项减少主要来自财务子公司存款变动'}]},
  {...input,issues:[{...input.issues[0],excerpt:'茅台与五粮液减少主要来自财务子公司存款变动'}]}]
 for(const candidate of bad){const result=await reviewAttributionSupport(candidate,model);assert.equal(result.eligible,false);assert.deepEqual(result.supported,[])}
 assert.equal(calls,0)
})

test('source company, year and query boundaries reject mismatched approval',async()=>{
 const other={...input.contexts[0],id:'other',stockCode:'000858'}
 const result=await reviewAttributionSupport({...input,contexts:[...input.contexts,other]},generate([row({sourceId:'other'})]))
 assert.deepEqual(result.supported,[])
 for(const candidate of [{...input,query:'比较2024年度现金流'}, {...input,contexts:[{...input.contexts[0],period:'2024年度'}]},
  {...input,issues:[{...input.issues[0],excerpt:claim.replace('该项','2024年度该项')}]}, {...input,query:'比较现金流'},
  {...input,issues:[{...input.issues[0],excerpt:claim.replace('茅台','五粮液')}]}]){
  assert.deepEqual((await reviewAttributionSupport(candidate,generate([row()]))).supported,[])
 }
})

test('complete unique coverage and verbatim claims are required',async()=>{
 for(const rows of [[],[row(),row()], [row({index:1})], [row({claimText:claim+'。'})], [row({reason:''})], [row({classification:'yes'})]]){
  assert.deepEqual((await reviewAttributionSupport(input,generate(rows))).supported,[])
 }
 const second={code:'UNSUPPORTED_ATTRIBUTION',field:'output.points[0]',excerpt:'贵州茅台经营现金流减少主要来自财务子公司存款变动'}
 const two={...input,issues:[...input.issues,second]}
 assert.deepEqual((await reviewAttributionSupport(two,generate([row(),row()]))).supported,[])
})

test('invented, short, missing or non-contiguous quotations cannot support a claim',async()=>{
 for(const overrides of [{sourceId:'missing'},{evidenceQuote:'存款减少'}, {evidenceQuote:'财务公司存款减少及同业存款增加，这是已确认的原因'},
  {evidenceQuote:'经营活动产生的现金流量净额减少……不可随时支取的同业存款增加。'}]){
  assert.deepEqual((await reviewAttributionSupport(input,generate([row(overrides)]))).supported,[])
 }
 const duplicate={...input,contexts:[input.contexts[0],{...input.contexts[0]}]}
 assert.deepEqual((await reviewAttributionSupport(duplicate,generate([row()]))).supported,[])
})

test('all, exclusively and universal causes cannot be inferred from a major cause',async()=>{
 for(const strength of ['全部来自','均来自','完全来自','唯一原因是']){
  const stronger=claim.replace('主要来自',strength),candidate={...input,issues:[{...input.issues[0],excerpt:stronger}]}
  assert.deepEqual((await reviewAttributionSupport(candidate,generate([row({claimText:stronger})]))).supported,[])
 }
})

test('model rejects using a change explanation for a profit gap or company gap',async()=>{
 for(const unsupported of ['茅台经营现金流低于归母净利润主要来自财务子公司存款变动','茅台与竞争对手的现金流金额差额主要来自财务子公司存款变动']){
  const candidate={...input,issues:[{...input.issues[0],excerpt:unsupported}]}
  const result=await reviewAttributionSupport(candidate,generate([row({claimText:unsupported,classification:'unsupported',reason:'原文解释现金流减少，没有解释利润差额或公司间差额。'})]))
  assert.deepEqual(result.supported,[]);assert.equal(result.assessment.assessments[0].classification,'unsupported')
 }
})

test('only supported issue pairs are returned while all assessments and calls are retained',async()=>{
 const second={code:'UNSUPPORTED_ATTRIBUTION',field:'output.points[0]',excerpt:'茅台现金流差额主要来自财务子公司'}
 const result=await reviewAttributionSupport({...input,issues:[...input.issues,second]},generate([row(),row({index:1,claimText:second.excerpt,classification:'uncertain',sourceId:'',evidenceQuote:'',reason:'差额对象不明确。'})]))
 assert.deepEqual(result.supported,[{field:'output.summary',excerpt:claim}]);assert.equal(result.assessment.assessments.length,2);assert.equal(result.calls.length,1)
})

test('model failure retains trace metadata and never approves an issue',async()=>{
 const result=await reviewAttributionSupport(input,async()=>{const error=new Error('private upstream detail');error.llmCalls=[{status:'failed'}];throw error})
 assert.deepEqual(result.supported,[]);assert.deepEqual(result.calls,[{status:'failed'}]);assert.deepEqual(result.assessment,{error:'ATTRIBUTION_REVIEW_FAILED'})
})
