import assert from 'node:assert/strict';

export function finalEvidence(run,mode){
 assert.ok(['current_evidence','single_model'].includes(mode),'unknown review mode');
 if(run)assert.equal(run.mode,mode,'snapshot mode differs');
 if(mode==='single_model')return {facts:run?.draft?.facts??[],calculations:run?.draft?.calculations??[],adoptedReport:null};
 if(!run?.draft)return {facts:[],calculations:[],adoptedReport:null};
 const adopted=run.adoptedReport;
 assert.ok(adopted,'missing adopted snapshot in V6 model output');
 assert.equal(adopted.version,'facts-calculations-v1','unknown adopted version');
 assert.equal(adopted.runId,run.id,'adopted snapshot runId differs');
 assert.ok(Array.isArray(adopted.facts)&&Array.isArray(adopted.calculations),'invalid adopted arrays');
 return {facts:adopted.facts,calculations:adopted.calculations,adoptedReport:adopted};
}

export function auditBody(r){return {rawDraft:r.rawDraft,adoptedFacts:r.adoptedFacts,adoptedCalculations:r.adoptedCalculations,adoptedReport:r.adoptedReport,checks:r.checks,reportMd:r.reportMd,technicalWorkflowSuccess:r.technicalWorkflowSuccess,technicalError:r.technicalError,refused:r.refused};}

export function questionReviewMarkdown(q,rows,options={}){
 let md='# '+q.id+' '+q.companyName+'输出语义复核\n\n'+q.question+'\n\n本文件含内部金标准，不进入部署包。助手结论仅为预审；请记录本轮实际人工审核人和日期。原稿与最终报告分别判断，不能因正文被拦截而把错误原稿判对。\n\n## 冻结依据\n\n```json\n'+JSON.stringify(rows[0].gold,null,2)+'\n```\n\n';
 if(options.dataRoot&&q.inputPdf){md+='## 本题来源\n\n[本题输入PDF](<'+options.dataRoot+'/'+q.inputPdf+'>)\n\n|输入文件物理页|原PDF物理页 上传者映射|\n|---|---|\n';for(const [i,p] of (rows.find(r=>r.sourceDocument)?.sourceDocument?.pages??[]).entries())md+='|'+(i+1)+'|'+p.page+'|\n';md+='\n金额所在页须连同表头页核对单位、年度和范围。\n\n';}
 for(const r of rows){
  md+='## '+r.reviewId+'\n\n技术闭环：'+(r.technicalWorkflowSuccess?'通过':'不通过')+'。这不是语义判定。\n\n';
  if(r.technicalError)md+='实际技术错误：\n\n```text\n'+r.technicalError+'\n```\n\n';
  for(const [name,data] of [['原始五字段回答',r.rawDraft],['最终采用事实',r.adoptedFacts],['最终采用计算 下标引用最终采用事实',r.adoptedCalculations],['最终采用状态与缺口',r.adoptedReport],['核验记录',r.checks]])md+=name+'：\n\n```json\n'+JSON.stringify(data,null,2)+'\n```\n\n';
  md+='完整保存报告，仅隐藏显式模式元数据：\n\n```markdown\n'+(r.reportMd??'无保存报告')+'\n```\n\n';
  md+=r.assistantReview?'助手逐条预审，待人工确认：\n\n```json\n'+JSON.stringify(r.assistantReview,null,2)+'\n```\n\n':'助手预审：待填。\n\n';
  md+='人工结论：待实际审核；审核人：；实际日期：；原稿通过/不通过：；最终答案通过/不通过：；修改理由：。\n\n';
 }
 return md;
}
