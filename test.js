'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');
const {spawn} = require('node:child_process');
const path = require('node:path');
(async()=>{
  const mock=http.createServer(async(req,res)=>{
    assert.equal(req.headers.authorization,'Bearer TEST_KEY');
    let raw='';for await(const chunk of req)raw+=chunk;
    const data=JSON.parse(raw);
    assert.equal(data.store,false);
    assert.equal(data.input.includes('성격과 기질'),true);
    res.writeHead(200,{'Content-Type':'application/json'});
    res.end(JSON.stringify({output:[{content:[{type:'output_text',text:'별의 해석\n검증용 응답입니다.'}]}]}));
  });
  await new Promise(resolve=>mock.listen(0,'127.0.0.1',resolve));
  const port=mock.address().port;
  const appPort=port+1;
  const child=spawn(process.execPath,[path.join(__dirname,'server.js')],{env:{...process.env,NODE_ENV:'test',OPENAI_TEST_URL:`http://127.0.0.1:${port}/v1/responses`,OPENAI_API_KEY:'TEST_KEY',PORT:String(appPort),HOST:'127.0.0.1'},stdio:'ignore'});
  try{
    const base=`http://127.0.0.1:${appPort}`;
    let ready=false;
    for(let i=0;i<60;i++){try{const r=await fetch(base+'/api/health');if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
    assert.ok(ready,'server did not start');
    const health=await (await fetch(base+'/api/health')).json();assert.equal(health.apiConfigured,true);
    const page=await fetch(base+'/');assert.equal(page.status,200);assert.ok((await page.text()).includes('별의 서재'));
    const invalid=await fetch(base+'/api/reading',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(invalid.status,400);
    const denied=await fetch(base+'/api/reading',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:'{}'});assert.equal(denied.status,403);
    const input={topic:'성격과 기질',profile:{birth:'1994-05-31',calendar:'양력',gender:'여성'},solarDate:'1994-05-31',pillars:{year:{stem:0,branch:0},month:{stem:0,branch:0},day:{stem:0,branch:0},hour:null}};
    const response=await fetch(base+'/api/reading',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
    assert.equal(response.status,200);assert.match((await response.json()).reading,/검증용 응답/);
    console.log('PASS: health, page, validation, origin protection, mocked OpenAI Responses API');
  }finally{child.kill();mock.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
