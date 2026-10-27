export function redact(value, secrets = []) {
  if (typeof value === 'string') {
    let output=value.replace(/Bearer\s+[\w.\-+/=]+/gi,'Bearer [REDACTED]')
    for(const secret of secrets.filter(s=>typeof s==='string' && s.length>3)) output=output.split(secret).join('[REDACTED]')
    return output
  }
  if (Array.isArray(value)) return value.map(v=>redact(v,secrets))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v])=>
    [k,/^(api[_-]?key|authorization|token|password|secret)$/i.test(k)?'[REDACTED]':redact(v,secrets)]))
  return value
}

export function summarizeEvents(events) {
  const starts=events.filter(e=>e.kind==='llm_start')
  const ends=events.filter(e=>e.kind==='llm_end')
  const successful=ends.filter(e=>e.httpStatus>=200 && e.httpStatus<300)
  const valid=successful.filter(e=>Number.isFinite(e.response?.usage?.total_tokens) && e.response.usage.total_tokens>=0)
  const subtotal=valid.reduce((n,e)=>n+e.response.usage.total_tokens,0)
  const complete=starts.length>0 && ends.length===starts.length && valid.length===starts.length
  return {requestsStarted:starts.length,requestsFinished:ends.length,httpSuccesses:successful.length,
    failedOrPending:starts.length-successful.length,usageCoverage:starts.length ? valid.length/starts.length : null,
    totalTokens:complete?subtotal:null,reportedTokenSubtotal:valid.length?subtotal:null,
    inputTokens:complete && valid.every(e=>Number.isFinite(e.response.usage.prompt_tokens))?valid.reduce((n,e)=>n+e.response.usage.prompt_tokens,0):null,
    outputTokens:complete && valid.every(e=>Number.isFinite(e.response.usage.completion_tokens))?valid.reduce((n,e)=>n+e.response.usage.completion_tokens,0):null,
    cost:{amount:null,currency:null,reason:'费用未取得服务商账单或核对费率；不能把未返回用量解释为零费用'}}
}

export function assessRun(details, events, expectedStockCodes=['600519','000858']) {
  const required=['fundamental','industry','macro','sentiment','risk']
  const sessions=details.map(d=>{
    const audit=d.session?.meta?.audit
    const missing=required.filter(key=>!d.agents?.some(a=>a.agentKey===key && a.details?.executionStatus==='ok'))
    const rounds=[1,2,3,4].filter(r=>!['bull','bear'].every(s=>d.debates?.some(t=>t.round===r && t.speakerKey===s)))
    return {sessionId:d.session?.id,stockCode:d.session?.stockCode,lifecycle:d.session?.status,
      missingOrFailedAgents:missing,missingDebateRounds:rounds,failedStages:audit?.failedAgents??['audit_missing'],
      gate:audit?.decisionGate??null,stageDurationsMs:audit?.stageDurationsMs??{},
      modelStagesSucceeded:d.session?.status==='completed' && !!audit && audit.failedAgents.length===0 && missing.length===0 && rounds.length===0,
      investmentDecisionPublished:!!d.decision,
      skippedDecisionStages:d.decision?[]:['voting','cio','investment_report']}
  })
  const calls=summarizeEvents(events)
  const actualStockCodes=sessions.map(s=>s.stockCode)
  const targetIdentityMatched=actualStockCodes.length===expectedStockCodes.length && actualStockCodes.every((code,i)=>code===expectedStockCodes[i])
  const modelAnalysisStagesSucceeded=targetIdentityMatched && sessions.length===2 && sessions.every(s=>s.modelStagesSucceeded) && calls.httpSuccesses>=28
  return {expectedStockCodes,actualStockCodes,targetIdentityMatched,modelAnalysisStagesSucceeded,
    fullModelStagesSucceeded:modelAnalysisStagesSucceeded && sessions.every(s=>s.skippedDecisionStages.length===0),
    investmentDecisionPublished:sessions.some(s=>s.investmentDecisionPublished),sessions,calls,
    note:'模型分析、辩论和风控完成与投资决策获准发布分别判断；量化输入未就绪时不强制运行CIO或生成评级。'}
}
