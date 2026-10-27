import test from 'node:test';import assert from 'node:assert/strict';
test('switching source restores stored identity and physical page map while retaining unsent user question',async()=>{
 const {sourceForm,sampleQuestions}=await import('../src/lib/filings/workbench-state.ts');
 const question='我尚未提交的问题';
 const state=sourceForm({companyCode:'600600',companyName:'青岛啤酒',reportYear:2025,mappingDeclared:true,pages:[{page:70},{page:71},{page:73}]},question);
 assert.deepEqual(state,{code:'600600',name:'青岛啤酒',year:'2025',map:'70, 71, 73',question});
 assert.equal(sourceForm({companyCode:'601166',companyName:'兴业银行',reportYear:2024,mappingDeclared:false,pages:[{page:1}]},question).map,'');
 const samples=sampleQuestions(2024);assert.ok(samples.every(s=>!s.question.includes('2025')));assert.ok(samples.some(s=>s.question.includes('2023')));
 assert.ok(samples.some(s=>s.question.includes('现金流')&&s.question.includes('不要推测')));
});
