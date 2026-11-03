'use strict';
const assert=require('node:assert/strict'),http=require('node:http'),{spawn}=require('node:child_process'),path=require('node:path');
(async()=>{
 let calls=0,used=[];
 const mock=http.createServer(async(req,res)=>{
   calls++;used.push(req.url);
   assert.equal(req.headers['x-goog-api-key'],'TEST_ONLY');
   assert.match(req.url,/\/models\/gemini-2\.5-flash-lite:generateContent$/);
   let raw='';for await(const c of req)raw+=c;
   const data=JSON.parse(raw);assert.match(JSON.stringify(data),/성격과 기질/);
   res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({candidates:[{content:{parts:[{text:'별의 해석\n모의 응답입니다.'}]}}],usageMetadata:{promptTokenCount:80,candidatesTokenCount:30}}));
 });
 await new Promise(r=>mock.listen(0,'127.0.0.1',r));
 const mp=mock.address().port,port=mp+1;
 const child=spawn(process.execPath,[path.join(__dirname,'server.js')],{env:{...process.env,NODE_ENV:'test',GEMINI_TEST_BASE_URL:`http://127.0.0.1:${mp}/v1beta`,GEMINI_API_KEY:'TEST_ONLY',GEMINI_FREE_TIER_CONFIRMED:'true',PORT:String(port),HOST:'127.0.0.1'},stdio:'ignore'});
 const base=`http://127.0.0.1:${port}`;
 try{
  let ready=false;for(let i=0;i<60;i++){try{if((await fetch(base+'/api/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,80));}assert.ok(ready);
  const h=await(await fetch(base+'/api/health')).json();assert.equal(h.provider,'gemini');assert.equal(h.freeTierConfirmed,true);
  const page=await fetch(base+'/');assert.equal(page.status,200);assert.match(await page.text(),/당신의 운명,/);
  const invalid=await fetch(base+'/api/reading',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(invalid.status,400);
  const denied=await fetch(base+'/api/reading',{method:'POST',headers:{Origin:'https://attacker.invalid','Content-Type':'application/json'},body:'{}'});assert.equal(denied.status,403);
  const input={topic:'성격과 기질',profile:{birth:'1994-05-31',calendar:'양력',gender:'여성'},solarDate:'1994-05-31',pillars:{year:{stem:0,branch:0},month:{stem:0,branch:0},day:{stem:0,branch:0},hour:null}};
  const post=()=>fetch(base+'/api/reading',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
  const first=await post();assert.equal(first.status,200);const result=await first.json();assert.match(result.reading,/모의 응답/);assert.equal(result.model,'gemini-2.5-flash-lite');
  const second=await post();assert.equal(second.status,200);assert.equal((await second.json()).cached,true);assert.equal(calls,1);
  console.log('PASS: health, original page, input validation, origin rejection, Gemini mock REST, caching, allowlisted model');
 }finally{child.kill();mock.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
