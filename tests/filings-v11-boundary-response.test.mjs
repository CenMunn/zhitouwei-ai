import test from 'node:test';import assert from 'node:assert/strict';
import {taskResponse} from '../src/lib/filings/task-response.ts';
const answer=q=>taskResponse(q,[],[],[],[],[],{}).answerLines.join(' ');
test('balance amounts cannot become realized investment yields or profit movements',()=>{
 assert.match(answer('能否根据金融投资余额直接推算已实现收益率？'),/不能.*余额|余额.*不能/);
 assert.match(answer('能否根据金融投资余额直接推算已实现收益率？'),/收益.*平均|平均.*余额/);
 assert.match(answer('未分配利润的差额是否等于净利润？'),/分红|利润分配/);
});
test('accounting equity cannot stand in for regulatory capital ratio evidence',()=>{
 const text=answer('报告所有者权益，是否足以计算资本充足率？');assert.match(text,/风险加权资产/);assert.match(text,/不能/);
});
test('cash and central-bank balances require cash-equivalent composition evidence',()=>{
 const text=answer('现金及存放中央银行款项能否直接当作现金及现金等价物？');assert.match(text,/受限|构成/);assert.match(text,/不能/);
});
test('receivable carrying value does not establish overdue days or conflate ageing',()=>{
 const text=answer('应收账款余额是否能证明全部逾期90天？');assert.match(text,/合同到期|约定到期/);assert.match(text,/账龄.*逾期|逾期.*账龄/);assert.match(text,/不能/);
});
test('boundary responses do not invent absent numbers, events, or a missing PDF table',()=>{
 for(const q of ['根据金融投资余额推算收益率','未分配利润变动能否代替净利润','资产负债表所有者权益是否等于监管资本','应收账款是否全部逾期90天']){
 const text=answer(q);assert.ok(!/未提供|发生了|[0-9]+\.[0-9]+/.test(text));
 }
});
