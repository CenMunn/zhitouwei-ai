export function auditBody(r){return {rawDraft:r.rawDraft,adoptedFacts:r.adoptedFacts,adoptedCalculations:r.adoptedCalculations,checks:r.checks,reportMd:r.reportMd,technicalWorkflowSuccess:r.technicalWorkflowSuccess,technicalError:r.technicalError,refused:r.refused};}
export function questionReviewMarkdown(q,rows,options={}){
  let md='# '+q.id+' '+q.companyName+'输出语义复核\n\n'+q.question+'\n\n本文件包含内部金标准，不进入部署包。助手结论为预审；新的人工审核人、实际日期和结论须真实填写。\n\n## 冻结依据\n\n```json\n'+JSON.stringify(rows[0].gold,null,2)+'\n```\n\n';
  if(options.dataRoot&&q.inputPdf){md+='## 本题来源\n\n[打开本题输入PDF](<'+options.dataRoot+'/'+q.inputPdf+'>)\n\n|输入PDF物理页|原PDF物理页（导入者映射）|\n|---|---|\n';for(const [i,p] of (rows.find(r=>r.sourceDocument)?.sourceDocument?.pages??[]).entries())md+='|'+(i+1)+'|'+p.page+'|\n';md+='\n金额所在页须连同表头页核对单位、年度与范围。\n\n';}
  for(const r of rows){md+='## '+r.reviewId+'\n\n技术闭环：'+(r.technicalWorkflowSuccess?'通过':'不通过')+'\n\n';for(const [name,data] of [['原始五字段回答',r.rawDraft],['最终采用事实',r.adoptedFacts],['最终采用计算',r.adoptedCalculations],['核验记录',r.checks]])md+=name+'：\n\n```json\n'+JSON.stringify(data,null,2)+'\n```\n\n';md+='完整保存报告（仅显式模式元数据隐藏）：\n\n```markdown\n'+(r.reportMd??'无保存报告')+'\n```\n\n';md+=r.assistantReview?'助手逐条预审（人工待确认）：\n\n```json\n'+JSON.stringify(r.assistantReview,null,2)+'\n```\n\n':'助手预审：待填。\n\n';md+='人工结论：待实际审核；审核人：；实际日期：；原稿通过/不通过：；最终答案通过/不通过：；修改理由：。\n\n';}
  return md;
}
