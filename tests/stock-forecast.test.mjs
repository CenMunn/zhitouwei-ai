import test from 'node:test'
import assert from 'node:assert/strict'
import * as f from '../src/lib/forecast/model.ts'
const bars=Array.from({length:40},(_,i)=>({date:new Date(Date.UTC(2025,0,1+i)).toISOString().slice(0,10),open:100,close:100,high:102,low:98,volume:10}))
test('features use only bars at or before the requested date',()=>{
 const expected=f.buildPriceFeatures(bars,31),changed=structuredClone(bars)
 changed[35]={...changed[35],open:200,close:200,high:202,low:198,volume:1000}
 assert.deepEqual(f.buildPriceFeatures(changed,31),expected)
 assert.equal(expected.length,14);assert.equal(expected[0],0);assert.equal(expected[4],1);assert.equal(expected[7],0);assert.equal(expected[10],.04)
})
test('boundary labels are purged instead of leaking into the next segment',()=>{
 assert.equal(f.classifyPriceSample('2025-09-24','2025-09-25','2025-09-25','2026-04-03'),null)
 assert.equal(f.classifyPriceSample('2026-04-02','2026-04-03','2025-09-25','2026-04-03'),null)
 assert.equal(f.classifyPriceSample('2025-09-23','2025-09-24','2025-09-25','2026-04-03'),'train')
 assert.equal(f.classifyPriceSample('2026-04-03','2026-04-06','2025-09-25','2026-04-03'),'test')
})
test('bad dates, duplicates, prices and insufficient history cannot produce a prediction',()=>{
 assert.throws(()=>f.buildPriceFeatures(bars,10))
 const duplicate=structuredClone(bars);duplicate[5].date=duplicate[4].date;assert.throws(()=>f.buildPriceFeatures(duplicate,31))
 const invalid=structuredClone(bars);invalid[2].close=NaN;assert.throws(()=>f.buildPriceFeatures(invalid,31))
})
test('exported tree inference includes the correct branch and rejects unsupported splits',()=>{
 const model={feature_names:['x'],tree_info:[{tree_structure:{split_feature:0,threshold:1,decision_type:'<=',left_child:{leaf_value:.1},right_child:{leaf_value:-.2}}}]}
 assert.equal(f.predictTreeModel(model,[1]),.1);assert.equal(f.predictTreeModel(model,[2]),-.2)
 assert.throws(()=>f.predictTreeModel(model,[NaN]))
 assert.throws(()=>f.predictTreeModel({...model,tree_info:[{tree_structure:{split_feature:0,threshold:'1||2',decision_type:'==',left_child:{leaf_value:1},right_child:{leaf_value:0}}}]},[1]))
})
