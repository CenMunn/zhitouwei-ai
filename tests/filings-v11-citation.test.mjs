import test from 'node:test';
import assert from 'node:assert/strict';
import {renderReport} from '../src/lib/filings/core.ts';
import {buildFilingRequest} from '../src/lib/filings/model.ts';
const sha='e'.repeat(64),sourceId=`pdf:${sha}:p188`;
const run={id:'fr_test',question:'列出资产总计',mode:'single_model',companyName:'开发公司',sha256:sha,sourcePages:[188],createdAt:'2026-10-10',durationMs:1,review:null,draft:{answer:'',facts:[{sourceId,label:'资产总计',year:2025,scope:'consolidated',unit:'元',value:'100'}],calculations:[],limitations:[],refused:false}};
test('report preserves uploaded physical page and declared original physical page separately',()=>{
 const md=renderReport({...run,sourcePageMap:[{sourceId,uploadedPage:1,originalPage:188}]});
 assert.match(md,/上传PDF物理页 1/);assert.match(md,/原报告物理页 188/);
 assert.match(md,/上传者声明/);
});
test('a missing original declaration does not manufacture an original report page',()=>{
 const sid=`pdf:${sha}:p1`,md=renderReport({...run,sourcePages:[1],sourcePageMap:[{sourceId:sid,uploadedPage:1,originalPage:null}],draft:{...run.draft,facts:[{...run.draft.facts[0],sourceId:sid}]}});
 assert.match(md,/上传PDF物理页 1/);assert.match(md,/原报告物理页未声明/);
 assert.ok(!md.includes('原报告物理页 1'));
});
test('legacy report regeneration explicitly labels missing uploaded-page mapping',()=>assert.match(renderReport(run),/上传页映射未记录/));
test('malformed or duplicate page mappings cannot become trusted citations',()=>{
 for(const sourcePageMap of [[{sourceId,uploadedPage:0,originalPage:188}],[{sourceId,uploadedPage:1,originalPage:187}],[{sourceId,uploadedPage:1,originalPage:188},{sourceId,uploadedPage:2,originalPage:188}]])assert.match(renderReport({...run,sourcePageMap}),/来源待核对/);
});
test('both models receive identical dual page mapping and never confuse upload and original index',()=>{
 const pages=[{page:188,uploadedPage:1,physicalPageDeclared:true,text:'开发资料'}];
 const requests=['single_model','current_evidence'].map(mode=>buildFilingRequest('列出资产总计',pages,sha,mode));
 assert.equal(requests[0].messages[1].content,requests[1].messages[1].content);
 const input=JSON.parse(requests[0].messages[1].content).pages[0];
 assert.equal(input.physicalPage,1);assert.equal(input.uploadedPhysicalPage,1);assert.equal(input.originalPhysicalPage,188);assert.equal(input.sourceId,sourceId);
});
