import test from 'node:test';import assert from 'node:assert/strict';
import {reviewDraft,parseDraft} from '../src/lib/filings/core.ts';
const fact=(value,extra={})=>({sourceId:'pdf:'+ 'a'.repeat(64)+':p1',page:1,label:'营业收入',year:2025,scope:'consolidated',unit:'元',value,...extra});
const calc=(operation,operands,value,unit,extra={})=>({label:'开发计算',operation,operands,value,unit,...extra});
const check=(facts,c,question='')=>reviewDraft({answer:'',facts,calculations:[c],limitations:[],refused:false},facts,{question}).checks.at(-1);
test('server question determines two-decimal rounding, not a fixed tolerance',()=>{
  const facts=[fact('108.011286'),fact('100',{year:2024})];
  assert.equal(check(facts,calc('growth',[0,1],'8.01','%'),'同比保留两位小数').ok,true);
  assert.equal(check(facts,calc('growth',[0,1],'8.02','%'),'同比保留两位小数').ok,false);
  assert.equal(check(facts,calc('growth',[0,1],'8.01','%'),'同比保留四位小数').ok,false);
  assert.equal(check(facts,calc('growth',[0,1],'8.0113','%')).ok,true);
});
test('exact rational rounding handles ties, negative signs and large amounts',()=>{
  for(const [a,b,value] of [['1.005','1','100.50'],['-1.005','1','-100.50'],['9007199254740993.005','1','9007199254740993.01']]){
    const facts=[fact(a),fact(b,{label:'参考金额'})];
    const c=value.startsWith('9007')?calc('sum',[0,1],'9007199254740994.01','元'):calc('ratio',[0,1],value,'%');
    assert.equal(check(facts,c,'保留2位小数').ok,true);
    if(value.startsWith('9007'))assert.equal(check(facts,{...c,value:'9007199254740994.02'},'保留2位小数').ok,false);
  }
});
test('same-metric annual difference accepts new minus old and rejects reversed, mixed metric/scope',()=>{
  const facts=[fact('120'),fact('100',{year:2024})];
  assert.equal(check(facts,calc('difference',[0,1],'20','元')).ok,true);
  assert.equal(check(facts,calc('difference',[1,0],'-20','元')).ok,false);
  for(const change of [{label:'净利润'},{scope:'parent'}])assert.equal(check([facts[0],{...facts[1],...change}],calc('difference',[0,1],'20','元')).ok,false);
  assert.equal(check(facts,calc('growth',[1,0],'-16.6667','%')).ok,false);
});
test('unit conversion uses exact denomination factors and never recasts EPS',()=>{
  for(const [from,to,value,want] of [['元','万元','12345678','1234.5678'],['万元','亿元','12500','1.25'],['百万元','亿元','1234','12.34'],['亿元','元','2','200000000'],['千元','万元','12','1.2']]){
    assert.equal(check([fact(value,{unit:from})],calc('unit_conversion',[0],want,to)).ok,true);
    assert.equal(check([fact(value,{unit:from})],calc('unit_conversion',[0],'999',to)).ok,false);
  }
  assert.equal(check([fact('3.2',{unit:'元/股'})],calc('unit_conversion',[0],'0.00032','万元')).ok,false);
});
test('percentage point change uses four verified operands and is not percent growth',()=>{
  const facts=[fact('40',{label:'负债合计'}),fact('100',{label:'资产总计'}),fact('30',{label:'负债合计',year:2024}),fact('100',{label:'资产总计',year:2024})];
  assert.equal(check(facts,calc('percentage_point_change',[0,1,2,3],'10','百分点')).ok,true);
  assert.equal(check(facts,calc('percentage_point_change',[0,1,2,3],'10','%')).ok,false);
  assert.equal(check(facts,calc('ratio',[0,1],'40','百分点')).ok,false);
  assert.equal(check(facts,calc('percentage_point_change',[2,3,0,1],'-10','百分点')).ok,false);
});
test('zero denominators and invalid indices are rejected without operand repair',()=>{
  const facts=[fact('120'),fact('0')];
  for(const c of [calc('ratio',[0,1],'0','%'),calc('ratio',[0,5],'12','倍'),calc('sum',[],'0','元'),calc('difference',[0],'0','元')])assert.equal(check(facts,c).ok,false);
  assert.equal(check([fact('100'),fact('90')],calc('sum',[0,1],'190.0001','元')).ok,false);
});
test('model cannot widen precision and conversion schema is shared and strict',()=>{
  const d={answer:'',facts:[],calculations:[calc('unit_conversion',[0],'1','亿元')],limitations:[],refused:false};
  assert.equal(parseDraft(JSON.stringify(d)).calculations[0].operation,'unit_conversion');
  assert.throws(()=>parseDraft(JSON.stringify({...d,calculations:[{...d.calculations[0],roundingDigits:0}]})));
});
test('unsupported written precision and conflicting per-question precision fail closed',()=>{
  const facts=[fact('108.011286'),fact('100',{year:2024})],c=calc('growth',[0,1],'8.0113','%');
  for(const question of ['保留十一位小数','保留9位小数','金额保留2位小数，比例保留3位小数'])assert.equal(check(facts,c,question).ok,false);
});
