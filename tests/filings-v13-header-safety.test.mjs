import test from 'node:test';
import assert from 'node:assert/strict';
import {extractFacts} from '../src/lib/filings/core.ts';
const item=(str,x,y,width=25)=>({str,transform:[10,0,0,10,x,y],width});
function joint(){
 const a=[item('开发甲股份有限公司',20,820,160),item('合并及公司资产负债表',20,790,200),item('金额单位为人民币千元',20,760,150)];
 for(let c=0;c<4;c++)a.push(item(c%2?'2024年':'2025年',300+c*100,720),item(c<2?'合并':'公司',300+c*100,700));
 for(let r=0;r<3;r++){a.push(item(['货币资金','存货','资产总计'][r],20,650-r*25,120));for(let c=0;c<4;c++)a.push(item(String(100+c),320+c*100,650-r*25,25));}
 return {page:1,text:'',layoutItems:a,physicalPageDeclared:true};
}
test('独立公司列有坐标证据，四列各自的年度和范围应成立',()=>{
 const fs=extractFacts([joint()],'synthetic');assert.equal(fs.length,12);
 assert.deepEqual(fs.slice(0,4).map(f=>[f.year,f.scope]),[[2025,'consolidated'],[2024,'consolidated'],[2025,'parent'],[2024,'parent']]);
});
test('四列中的范围文字错位、缺失或重复不能仅按文字顺序放行',()=>{
 const p=joint();
 for(const mutate of [
  a=>a.map(i=>i.str==='公司'?{...i,transform:[10,0,0,10,i.transform[4]-200,i.transform[5]]}:i),
  a=>a.filter(i=>!(i.str==='公司'&&i.transform[4]===600)),
  a=>[...a,item('母公司',600,690)]
 ])assert.equal(extractFacts([{...p,layoutItems:mutate(p.layoutItems)}],'synthetic').length,0);
});
test('正文中的母公司标签不能补足缺失的范围表头，即使负数行绕开旧检测',()=>{
 const p=joint();p.layoutItems=p.layoutItems.filter(i=>i.str!=='公司');
 p.layoutItems.push(item('归属于母公司股东的项目',20,680,180),...Array.from({length:4},(_,c)=>item('(10)',320+c*100,680,25)));
 assert.equal(extractFacts([p],'synthetic').length,0);
});
test('范围标题跨行时按金额列坐标排序，不能按PDF行阅读顺序互换范围',()=>{
 const p=joint();p.layoutItems=p.layoutItems.map(i=>['合并','公司'].includes(i.str)?{...i,transform:[10,0,0,10,i.transform[4],i.transform[4]%200===100?705:695]}:i);
 const fs=extractFacts([p],'synthetic');assert.equal(fs.length,12);
 assert.deepEqual(fs.slice(0,4).map(f=>f.scope),['consolidated','consolidated','parent','parent']);
});
