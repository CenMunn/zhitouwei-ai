// Independent, synthetic protocol contract. No evaluation questions, answers,
// PDFs, provider requests, environment files, or saved model runs are loaded.
// Expectations below are literal contract values, not implementation output.
import test from 'node:test';
import assert from 'node:assert/strict';
import {z} from 'zod';
import {buildProtocolExport} from '../src/lib/filings/protocol.ts';

// Equivalent to the allowed, frozen V13 answer-schema.json. Only the root
// disallows additional properties; nested objects permit them in that schema.
const answerSchema=z.object({
  question_id:z.string(),
  status:z.enum(['answered','insufficient_evidence']),
  scope:z.string(),period:z.string(),unit:z.string(),
  currency:z.string().nullable(),answer:z.string(),
  value:z.string().nullable(),formula:z.string().nullable(),
  operands:z.array(z.object({
    name:z.string(),value:z.string(),scope:z.string(),period:z.string(),unit:z.string(),
  })),
  evidence:z.array(z.object({
    input_physical_page:z.number().int().min(1),
    source_physical_page:z.number().int().min(1),
    table_title:z.string(),data_rows:z.array(z.string()),
    source_printed_page:z.union([z.number().int(),z.string()]).optional(),
    header_evidence:z.string().min(1),
  })),
  answerable_facts:z.array(z.unknown()),
  missing_evidence:z.array(z.string()),must_not_infer:z.array(z.string()),
}).strict();

const SHA='a'.repeat(64);
const SOURCE=`pdf:${SHA}:p71`;
const RUN_ID='fr_synthetic_protocol';
const TITLE='合并资产负债表';
const RAW_ROW='货币资金 附注六、1 125 90';
const ROW='货币资金 附注六、1 |125 |90';
const HEAD=[TITLE,'金额单位：人民币千元','2031年12月31日 |2030年12月31日'];
const MODES=['single_model','current_evidence'];
const item=(str,x,y,width=100)=>({str,transform:[10,0,0,10,x,y],width});

function page(pageNumber=71){
  return {
    page:pageNumber,uploadedPage:1,physicalPageDeclared:true,
    text:[TITLE,'金额单位：人民币千元','2031年12月31日  2030年12月31日',RAW_ROW].join('\n'),
    layoutRows:[...HEAD,ROW].map(text=>({text})),
    layoutItems:[
      item(TITLE,20,800,180),item('金额单位：人民币千元',20,770,200),
      item('2031年12月31日',300,720),item('2030年12月31日',450,720),
      item('货币资金',20,670),item('附注六、1',180,670),
      item('125',330,670,30),item('90',480,670,30),
    ],
  };
}

function fact(patch={}){
  return {
    sourceId:SOURCE,page:71,label:'货币资金',year:2031,period:'2031-12-31',
    scope:'consolidated',unit:'千元',currency:'人民币',value:'125',quote:ROW,
    statementId:'synthetic-bs-71',tableTitle:TITLE,headerSourceIds:[SOURCE],
    headerEvidence:[{sourceId:SOURCE,page:71,text:HEAD.join('\n'),relation:'own'}],
    ...patch,
  };
}

// The native five-field draft contract does not allow parser provenance fields.
function nativeFact(f){
  const {sourceId,label,year,period,scope,unit,value}=f;
  return {sourceId,label,year,period,scope,unit,value};
}

function report(facts,calculations=[],patch={}){
  return {
    version:'facts-calculations-v2',runId:RUN_ID,
    facts:facts.map((f,originalIndex)=>({...f,originalIndex})),
    calculations:calculations.map((c,originalIndex)=>({...c,originalIndex})),
    answerLines:['2031年末合并货币资金为125千元。'],conclusions:[],
    sourceAssessment:[],boundaryFindings:[],
    coverage:{status:'needs_semantic_review',present:['货币资金'],missing:[],limitations:[]},
    answerVerified:false,semanticReview:'pending',
    audit:{originalDraftInJson:true,rawProseAdopted:false,refusalFlag:false,
      rejected:[],excludedCalculations:[],excludedProseFields:['answer','limitations','calculations.label']},
    ...patch,
  };
}

function fixture(mode='current_evidence'){
  const f=fact();
  const doc={
    id:'pdf_synthetic_protocol',sha256:SHA,companyCode:'SYNTHETIC',companyName:'合成协议甲',
    reportYear:2031,filename:'synthetic-only.pdf',createdAt:'2032-01-01T00:00:00Z',
    importDurationMs:0,identityStatus:'declared',pages:[page()],facts:[structuredClone(f)],
    mappingDeclared:true,bytes:100,parserVersion:'synthetic-contract',
    statementBlocks:[{
      id:'synthetic-bs-71',page:71,name:TITLE,entity:'合成协议甲',unit:'千元',currency:'人民币',
      columns:[{year:2031,period:'2031-12-31',scope:'consolidated'},
        {year:2030,period:'2030-12-31',scope:'consolidated'}],
      rows:[{text:ROW,label:'货币资金',cells:['125','90']}],
      headerSourceIds:[SOURCE],headerEvidence:structuredClone(f.headerEvidence),status:'parsed',
    }],
  };
  const draft={refused:false,answer:'原答：2031年末合并货币资金125千元。',
    facts:[nativeFact(f)],calculations:[],limitations:[]};
  const run={
    id:RUN_ID,documentId:doc.id,sha256:SHA,companyName:doc.companyName,
    question:'读取2031年末合并货币资金。',mode,createdAt:doc.createdAt,durationMs:0,
    sourcePages:[71],sourcePageMap:[{sourceId:SOURCE,uploadedPage:1,originalPage:71}],
    draft,attempts:[],request:{messages:[]},status:'completed',reportMd:'',stageDurations:{},
    review:{checks:[{kind:'fact',index:0,ok:true,reason:'synthetic source match'}],
      acceptedFacts:[structuredClone(f)],acceptedCalculations:[],
      factSources:[{originalIndex:0,source:structuredClone(f)}],answerVerified:false,semanticReview:'pending'},
    adoptedReport:report([f]),
  };
  return {run,doc};
}

function strictAnswer(result){
  assert.equal(typeof result.version,'string');
  assert.ok(result.version.length>0);
  assert.equal(typeof result.validation.valid,'boolean');
  assert.equal(typeof result.validation.schemaValid,'boolean');
  assert.ok(Array.isArray(result.validation.issues));
  assert.ok(Array.isArray(result.evidenceGaps));
  const parsed=answerSchema.safeParse(result.answer);
  assert.equal(parsed.success,true,parsed.success?'':JSON.stringify(parsed.error.issues));
  assert.equal(result.validation.schemaValid,true,'export must report the same strict schema result');
  return result.answer;
}

function missingSource(result){
  const a=strictAnswer(result);
  assert.equal(result.validation.valid,false,'a structural pass cannot erase a provenance gap');
  assert.ok(result.evidenceGaps.length>0,'retain the actual provenance gap');
  assert.ok(a.missing_evidence.length>0,'deliver the gap in the protocol answer');
  return a;
}

for(const mode of MODES){
  test(`${mode}: nonempty source-backed fact has strict schema and both physical page numbers`,()=>{
    const {run,doc}=fixture(mode),before=structuredClone({run,doc});
    const result=buildProtocolExport(run,doc),a=strictAnswer(result);
    assert.equal(result.validation.valid,true);
    assert.deepEqual(result.evidenceGaps,[]);
    assert.equal(a.question_id,RUN_ID);
    assert.equal(a.status,'answered');
    assert.equal(a.value,'125');
    assert.equal(a.period,'2031-12-31');
    assert.equal(a.unit,'千元');
    assert.equal(a.currency,'人民币');
    assert.ok(a.answerable_facts.length>0);
    assert.ok(a.evidence.some(e=>e.input_physical_page===1&&e.source_physical_page===71));
    const e=a.evidence.find(e=>e.source_physical_page===71);
    assert.equal(e.table_title,TITLE);
    assert.ok(e.data_rows.some(row=>row.includes('货币资金')&&row.includes('125')));
    assert.match(e.header_evidence,/金额单位：人民币千元/);
    assert.match(e.header_evidence,/2031年12月31日/);
    if(mode==='single_model')assert.equal(a.answer,run.draft.answer,'baseline prose must remain verbatim');
    assert.deepEqual({run,doc},before,'mechanical export must not mutate the source or run');
  });

  test(`${mode}: PDF text and positioned rows may use different spaces, pipes and line endings`,()=>{
    for(const separator of [' ','\t',' | ','  ']){
      const {run,doc}=fixture(mode);
      doc.pages[0].text=[TITLE,'金额单位：人民币千元',
        `2031年12月31日${separator}2030年12月31日`,
        `货币资金${separator}附注六、1${separator}125${separator}90`].join('\r\n');
      const result=buildProtocolExport(run,doc),a=strictAnswer(result);
      assert.equal(result.validation.valid,true,`text separator ${JSON.stringify(separator)}`);
      assert.equal(a.value,'125');
      assert.ok(a.evidence[0].header_evidence.includes('人民币千元'));
    }
  });

  test(`${mode}: inherited header gets its own page evidence and is never attributed to the data page`,()=>{
    const {run,doc}=fixture(mode),continuation=`pdf:${SHA}:p72`;
    doc.pages.push({page:72,uploadedPage:2,physicalPageDeclared:true,
      text:`合并资产负债表（续）\n${RAW_ROW}`,
      layoutRows:[{text:'合并资产负债表（续）'},{text:ROW}],
      layoutItems:[item('合并资产负债表（续）',20,800,220),item('货币资金',20,670),
        item('附注六、1',180,670),item('125',330,670,30),item('90',480,670,30)]});
    const f=fact({sourceId:continuation,page:72,statementId:'synthetic-bs-72',
      tableTitle:'合并资产负债表（续）',headerSourceIds:[continuation,SOURCE],
      headerEvidence:[{sourceId:continuation,page:72,text:'合并资产负债表（续）',relation:'own'},
        {sourceId:SOURCE,page:71,text:HEAD.join('\n'),relation:'inherited'}]});
    doc.facts=[structuredClone(f)];run.draft.facts=[nativeFact(f)];
    run.adoptedReport=report([f]);
    run.sourcePages=[71,72];run.sourcePageMap.push({sourceId:continuation,uploadedPage:2,originalPage:72});
    const result=buildProtocolExport(run,doc),a=strictAnswer(result);
    assert.equal(result.validation.valid,true);
    const local=a.evidence.find(e=>e.source_physical_page===72);
    const inherited=a.evidence.find(e=>e.source_physical_page===71);
    assert.ok(local,'actual row page needs an evidence entry');
    assert.ok(inherited,'actual header page needs a separate evidence entry');
    assert.equal(local.input_physical_page,2);
    assert.equal(inherited.input_physical_page,1);
    assert.ok(local.data_rows.some(row=>row.includes('货币资金')));
    assert.equal(local.header_evidence.includes('金额单位'),false,'the continuation has no local unit');
    assert.equal(local.header_evidence.includes('2031年12月31日'),false,'the continuation has no local date');
    assert.match(inherited.header_evidence,/金额单位：人民币千元/);
    assert.match(inherited.header_evidence,/2031年12月31日/);
    assert.deepEqual(inherited.data_rows,[],'header-only reference must not duplicate the following page row');
  });

  test(`${mode}: a wrong source hash cannot be repaired using the page number`,()=>{
    const {run,doc}=fixture(mode),wrong=`pdf:${'b'.repeat(64)}:p71`;
    run.draft.facts[0].sourceId=wrong;
    run.adoptedReport.facts[0].sourceId=wrong;
    const before=structuredClone(run);
    const result=buildProtocolExport(run,doc),a=missingSource(result);
    assert.deepEqual(a.evidence,[],'a guessed correct ID cannot become source evidence');
    assert.deepEqual(run,before,'bad ID remains visible in the original run');
  });

  test(`${mode}: undeclared original physical page is a gap, even with a stale source map`,()=>{
    const {run,doc}=fixture(mode);
    doc.mappingDeclared=false;doc.pages[0].physicalPageDeclared=false;
    // The stale run map still claims originalPage=71. doc.pages is authoritative.
    const a=missingSource(buildProtocolExport(run,doc));
    assert.deepEqual(a.evidence,[],'do not invent original page 71 or copy uploaded page 1 into it');
  });

  test(`${mode}: unavailable header is a gap rather than null, an empty header or a guessed prefix`,()=>{
    const {run,doc}=fixture(mode);
    for(const f of [doc.facts[0],run.adoptedReport.facts[0]]){
      f.headerEvidence=[];f.headerSourceIds=[];delete f.tableTitle;delete f.statementId;
    }
    doc.statementBlocks=[];
    const a=missingSource(buildProtocolExport(run,doc));
    assert.deepEqual(a.evidence,[],'the visible whole-page text is not an established fact-header binding');
  });

  test(`${mode}: ambiguous same-page tables cannot supply an unbound fact header`,()=>{
    const {run,doc}=fixture(mode);
    doc.pages[0].text=[TITLE,'金额单位：人民币千元','2031年12月31日 2030年12月31日',RAW_ROW,
      '母公司资产负债表','金额单位：人民币元','2031年12月31日 2030年12月31日',RAW_ROW].join('\n');
    doc.pages[0].layoutRows=doc.pages[0].text.split('\n').map(text=>({text}));
    delete doc.pages[0].layoutItems;
    for(const f of [doc.facts[0],run.adoptedReport.facts[0]]){
      f.headerEvidence=[];f.headerSourceIds=[];delete f.tableTitle;delete f.statementId;
    }
    doc.statementBlocks.push({...structuredClone(doc.statementBlocks[0]),
      id:'synthetic-parent-71',name:'母公司资产负债表',unit:'元',
      columns:[{year:2031,period:'2031-12-31',scope:'parent'}]});
    const a=missingSource(buildProtocolExport(run,doc));
    assert.deepEqual(a.evidence,[],'do not choose a table using unverified model scope or nearest prefix');
  });

  test(`${mode}: legitimate empty facts stay schema-valid and explicitly insufficient`,()=>{
    const {run,doc}=fixture(mode);
    doc.facts=[];doc.statementBlocks=[];
    run.draft={refused:true,answer:'缺少合成指标对应的原页，无法核实。',facts:[],calculations:[],
      limitations:['缺少对应原页；不得推算。']};
    run.adoptedReport=report([],[],{answerLines:['缺少对应原页，无法核实。'],
      coverage:{status:'incomplete',present:[],missing:['缺少对应原页'],limitations:['不得推算。']}});
    const a=strictAnswer(buildProtocolExport(run,doc));
    assert.equal(a.status,'insufficient_evidence');
    assert.equal(a.scope,'未核实');assert.equal(a.period,'未核实');assert.equal(a.unit,'未核实');
    assert.equal(a.value,null);assert.equal(a.formula,null);assert.equal(a.currency,null);
    assert.deepEqual(a.operands,[]);assert.deepEqual(a.evidence,[]);assert.deepEqual(a.answerable_facts,[]);
    assert.ok(a.missing_evidence.length>0);
    if(mode==='single_model')assert.equal(a.answer,run.draft.answer);
  });

  test(`${mode}: a model error cannot be exported as answered despite an existing draft`,()=>{
    const {run,doc}=fixture(mode);
    run.error='synthetic HTTP 200 response-body timeout';run.status='failed';
    const result=buildProtocolExport(run,doc),a=strictAnswer(result);
    assert.equal(result.validation.valid,false);
    assert.equal(a.status,'insufficient_evidence');
    assert.ok(a.missing_evidence.some(s=>/timeout|失败|错误|error/i.test(s)));
  });

  test(`${mode}: no usable model result remains a valid schema failure record`,()=>{
    const {run,doc}=fixture(mode);
    run.error='synthetic strict draft validation failed';run.status='failed';
    run.draft=null;run.review=null;run.adoptedReport=null;
    const result=buildProtocolExport(run,doc),a=strictAnswer(result);
    assert.equal(result.validation.valid,false);
    assert.equal(a.status,'insufficient_evidence');
    assert.deepEqual(a.answerable_facts,[]);assert.deepEqual(a.evidence,[]);
    assert.ok(a.missing_evidence.length>0);
  });
}

test('an explicit question ID is used without changing the run ID or source coordinates',()=>{
  const {run,doc}=fixture();
  const a=strictAnswer(buildProtocolExport(run,doc,'synthetic-question-17'));
  assert.equal(a.question_id,'synthetic-question-17');assert.equal(run.id,RUN_ID);
  assert.equal(a.evidence[0].input_physical_page,1);assert.equal(a.evidence[0].source_physical_page,71);
});

test('uploaded physical page comes from doc.pages order, not stale run or page metadata',()=>{
  const {run,doc}=fixture();
  doc.pages[0].uploadedPage=99;run.sourcePageMap[0].uploadedPage=99;
  const result=buildProtocolExport(run,doc),a=strictAnswer(result);
  assert.equal(result.validation.valid,true);
  assert.equal(a.evidence[0].input_physical_page,1);
  assert.equal(a.evidence[0].source_physical_page,71);
});

test('baseline wrong amount and original prose survive mechanical source localization unchanged',()=>{
  const {run,doc}=fixture('single_model');
  run.draft.facts[0].value='999';run.draft.answer='模型原答：货币资金999千元；保留原句。';
  const before=structuredClone({run,doc});
  const a=strictAnswer(buildProtocolExport(run,doc));
  assert.equal(a.value,'999','the exporter must not replace baseline value with parsed source value 125');
  assert.equal(a.answer,'模型原答：货币资金999千元；保留原句。');
  assert.ok(a.evidence.some(e=>e.data_rows.some(row=>row.includes('125'))),'source evidence retains actual row');
  assert.equal(a.evidence.some(e=>e.data_rows.some(row=>row.includes('999'))),false,'do not fabricate a matching source row');
  assert.deepEqual({run,doc},before);
});

test('current mode cannot fall back to a rejected raw fact when adopted facts are empty',()=>{
  const {run,doc}=fixture('current_evidence');
  run.draft.facts[0].value='999';run.draft.refused=false;
  run.adoptedReport=report([],[],{answerLines:['金额未通过来源核验。'],
    coverage:{status:'incomplete',present:[],missing:['金额未通过来源核验'],limitations:[]}});
  run.review.checks=[{kind:'fact',index:0,ok:false,reason:'synthetic value mismatch'}];
  run.review.acceptedFacts=[];
  const a=strictAnswer(buildProtocolExport(run,doc));
  assert.equal(a.status,'insufficient_evidence');assert.equal(a.value,null);
  assert.deepEqual(a.answerable_facts,[]);assert.deepEqual(a.evidence,[]);
  assert.ok(a.missing_evidence.length>0);
});

for(const mode of MODES)for(const fiveTerms of [false,true]){
  test(`${mode}: ${fiveTerms?'five':'two'}-term cash roll-forward exports year-end result and original operand periods`,()=>{
    const {run,doc}=fixture(mode);
    const labels=fiveTerms?
      ['年初现金及现金等价物余额','经营活动产生的现金流量净额','投资活动产生的现金流量净额',
        '筹资活动产生的现金流量净额','汇率变动对现金及现金等价物的影响']:
      ['年初现金及现金等价物余额','现金及现金等价物净增加额'];
    const values=fiveTerms?['100','30','-10','-5','2']:['100','17'];
    const cashHead=['合并现金流量表','金额单位：人民币千元','2031年度 |2030年度'];
    const fs=labels.map((label,i)=>fact({label,value:values[i],
      period:i===0?'2031-01-01':'2031',quote:`${label} |${values[i]} |0`,
      statementId:'synthetic-cash-71',tableTitle:'合并现金流量表',
      headerEvidence:[{sourceId:SOURCE,page:71,text:cashHead.join('\n'),relation:'own'}]}));
    const calc={label:'期末现金及现金等价物余额',operation:'sum',
      operands:labels.map((_,i)=>i),value:'117',unit:'千元'};
    doc.facts=structuredClone(fs);doc.statementBlocks=[];
    doc.pages[0]={page:71,uploadedPage:1,physicalPageDeclared:true,
      text:[...cashHead.map(s=>s.replaceAll('|',' ')),...fs.map(f=>f.quote.replaceAll('|',' '))].join('\n'),
      layoutRows:[...cashHead,...fs.map(f=>f.quote)].map(text=>({text}))};
    run.question=fiveTerms?
      '计算2031年末合并现金及现金等价物余额，按年初余额+经营+投资+筹资+汇率影响计算。':
      '计算2031年末合并现金及现金等价物余额，按年初余额+现金及现金等价物净增加额计算。';
    run.draft={refused:false,answer:'期末现金及现金等价物余额117千元。',facts:fs.map(nativeFact),
      calculations:[structuredClone(calc)],limitations:[]};
    run.adoptedReport=report(fs,[calc],{answerLines:['2031年末合并现金及现金等价物余额117千元。']});
    const result=buildProtocolExport(run,doc),a=strictAnswer(result);
    assert.equal(result.validation.valid,true);
    assert.equal(a.status,'answered');assert.equal(a.value,'117');
    assert.equal(a.period,'2031-12-31','result is the closing stock, not a joined set of input periods');
    assert.equal(typeof a.formula,'string');assert.ok(a.formula.length>0);
    assert.deepEqual(a.operands.map(o=>o.value),fiveTerms?['100','30','-10','-5','2']:['100','17']);
    assert.deepEqual(a.operands.map(o=>o.period),fiveTerms?['2031-01-01','2031','2031','2031','2031']:['2031-01-01','2031']);
    assert.ok(a.evidence.every(e=>!e.header_evidence.includes('2031-01-01')&&!e.header_evidence.includes('2031-12-31')),
      'derived stock dates must not be invented as verbatim annual source headers');
  });
}
