import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const base=process.env.TEST_BASE_URL??'http://127.0.0.1:3145';
const origin={Origin:base};
async function account(suffix){const res=await fetch(base+'/api/auth/register',{method:'POST',headers:{...origin,'Content-Type':'application/json'},body:JSON.stringify({username:'filingqa_'+Date.now()+suffix,password:'TestFilingPassword!42',displayName:'PDF开发验收'})});assert.equal(res.status,201,await res.text().then(t=>t));return res.headers.get('set-cookie').split(';')[0];}
async function upload(cookie,code,company,map,buffer){const form=new FormData();form.append('file',new File([buffer],'development.pdf',{type:'application/pdf'}));form.append('companyCode',code);form.append('companyName',company);form.append('reportYear','2025');form.append('pageMap',map);return fetch(base+'/api/filings',{method:'POST',headers:{...origin,Cookie:cookie},body:form});}
test('real development PDFs import, remain private, reopen and match original bytes',async()=>{
  assert.equal((await fetch(base+'/api/filings')).status,401);
  const a=await account('a'),b=await account('b');
  for(const [code,name,map] of [['601166','兴业银行','188-196'],['600600','青岛啤酒','70-73']]){
    const bytes=await readFile(new URL('../../复赛深化/evaluation/locked-v5/development/inputs/'+code+'-financial-pages.pdf',import.meta.url));const res=await upload(a,code,name,map,bytes);assert.equal(res.status,201,await res.clone().text());const {document}=await res.json();assert.ok(document.facts.length>100);assert.equal(document.pages[0].page,Number(map.split('-')[0]));
    for(const action of ['document','source','report','export'])assert.equal((await fetch(base+`/api/filings?action=${action}&id=${document.id}&format=json`,{headers:{Cookie:b}})).status,404);
    const reopened=await fetch(base+`/api/filings?action=document&id=${document.id}`,{headers:{Cookie:a}});assert.equal((await reopened.json()).document.sha256,document.sha256);
    const source=await fetch(base+`/api/filings?action=source&id=${document.id}`,{headers:{Cookie:a}});assert.deepEqual(Buffer.from(await source.arrayBuffer()),bytes);assert.equal(source.headers.get('cache-control'),'no-store');
  }
  assert.equal((await upload(a,'601166','兴业银行','1',Buffer.from('not a pdf'))).status,400);
  const history=await fetch(base+'/api/research?limit=24',{headers:{Cookie:a}});assert.equal(history.status,200);assert.equal((await history.json()).sessions.some(s=>s.id.startsWith('pdf_')||s.id.startsWith('fr_')),false);
  const cross=await fetch(base+'/api/filings',{method:'POST',headers:{Origin:'https://invalid.example',Cookie:a,'Content-Type':'application/json'},body:'{}'});assert.equal(cross.status,403);
  const invalid=await fetch(base+'/api/filings',{method:'POST',headers:{...origin,Cookie:a,'Content-Type':'application/json'},body:JSON.stringify({action:'run',mode:'current_evidence',documentId:'pdf_'+crypto.randomUUID(),question:'无资料'})});assert.equal(invalid.status,404);
});

