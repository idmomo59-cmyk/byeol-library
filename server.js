 'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const PORT=Number(process.env.PORT||3000),HOST=process.env.HOST||'0.0.0.0';
const KEY=process.env.GEMINI_API_KEY||'', FREE=process.env.GEMINI_FREE_TIER_CONFIRMED==='true';
const PRIMARY='gemini-3.5-flash-lite',SECONDARY='gemini-3.1-flash-lite';
const BASE=process.env.NODE_ENV==='test'&&process.env.GEMINI_TEST_BASE_URL?process.env.GEMINI_TEST_BASE_URL:'https://generativelanguage.googleapis.com/v1beta';
const DAILY_LIMIT=Math.max(1,Number(process.env.DAILY_LIMIT||3)),HOURLY_LIMIT=Math.max(1,Number(process.env.HOURLY_LIMIT||2)),MAX_DAILY_TOTAL=Math.max(1,Number(process.env.MAX_DAILY_TOTAL||30));
const topics=new Set(['성격과 기질','연애와 관계','직업과 적성','재물과 소비','올해의 흐름','월별 흐름']);
const counts=new Map(),cache=new Map(),inflight=new Map();let usage={day:'',attempts:0,success:0,failed:0,cacheHits:0,promptTokens:0,responseTokens:0,byModel:{}};
const nowDay=()=>new Date().toISOString().slice(0,10);
function rotate(){const d=nowDay();if(usage.day!==d){usage={day:d,attempts:0,success:0,failed:0,cacheHits:0,promptTokens:0,responseTokens:0,byModel:{}};counts.clear();cache.clear();}}
function send(res,status,obj){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(obj));}
function originOK(req){if(!req.headers.origin)return true;try{return new URL(req.headers.origin).host===req.headers.host;}catch{return false;}}
function validDate(s){if(typeof s!=='string'||!/^(19\d\d|20[0-4]\d|2050)-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(s))return false;const d=new Date(s+'T00:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===s;}
function validate(x){if(!x||typeof x!=='object'||Array.isArray(x)||!topics.has(x.topic)||!x.profile||!validDate(x.profile.birth)||!validDate(x.solarDate)||!['양력','음력'].includes(x.profile.calendar)||!['남성','여성'].includes(x.profile.gender)||!x.pillars||typeof x.pillars!=='object')return false;
for(const k of ['year','month','day','hour']){const p=x.pillars[k];if(p!==null&&(!p||typeof p!=='object'||!Number.isInteger(p.stem)||p.stem<0||p.stem>9||!Number.isInteger(p.branch)||p.branch<0||p.branch>11))return false;}return true;}
function allowed(req){rotate();if(usage.attempts>=MAX_DAILY_TOTAL)return false;const ip=crypto.createHash('sha256').update(req.socket.remoteAddress||'unknown').digest('hex');const t=Date.now();const v=(counts.get(ip)||[]).filter(a=>t-a<86400000);if(v.length>=DAILY_LIMIT||v.filter(a=>t-a<3600000).length>=HOURLY_LIMIT)return false;v.push(t);counts.set(ip,v);usage.attempts++;return true;}
function digest(x){return crypto.createHash('sha256').update(JSON.stringify({topic:x.topic,profile:x.profile,solarDate:x.solarDate,pillars:x.pillars,day:nowDay()})).digest('hex');}
function delay(ms){return new Promise(r=>setTimeout(r,ms));}
async function gemini(model,x){const instructions=`당신은 별의 서재 한국어 명리학 문화 해설자다. 따뜻하고 절제된 신비로운 문체로 답한다. 제공된 간지 이외의 지장간·용신·대운·세운·합충·절기 시각을 창작하지 않는다. 단순 오행 개수로 신강/신약을 단정하지 않는다. 운세는 과학적으로 검증된 미래 예측이 아닌 문화적 자기성찰임을 인지한다. 확정적인 건강·법률·재정 조언, 공포 조장, 개인정보 재노출을 피한다. 지정된 주제 하나에 대해 한국어 약 500~800자로 '별의 해석'과 '나에게 건네는 조언' 소제목을 사용한다. 계산값과 해석을 구분한다. 시주 미상이라면 언급하지 않는다. 현재 날짜는 서버가 제공한 날짜만 사용한다. 텍스트만 출력한다.`;
const payload={systemInstruction:{parts:[{text:instructions}]},contents:[{role:'user',parts:[{text:JSON.stringify({topic:x.topic,today:nowDay(),solarDate:x.solarDate,gender:x.profile.gender,pillars:x.pillars,calculationNote:'사전 날짜 간지표, 절기 경계 및 진태양시 보정 미검증'})}]}],generationConfig:{temperature:0.65,maxOutputTokens:1500}};
for(let attempt=0;attempt<3;attempt++){
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),22000);let r;
 try{r=await fetch(`${BASE}/models/${encodeURIComponent(model)}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':KEY},body:JSON.stringify(payload),signal:ctrl.signal});}
 catch(e){clearTimeout(timer);if(e.name==='AbortError')throw Object.assign(new Error('timeout'),{code:'TIMEOUT'});throw Object.assign(new Error('network'),{code:'NETWORK'});}
 clearTimeout(timer);
 if(r.status===429){if(attempt<2){await delay(Math.min(1500,250*2**attempt));continue;}throw Object.assign(new Error('quota'),{code:'QUOTA'});}
 if(!r.ok){const status=r.status;throw Object.assign(new Error('upstream'),{code:status===404?'UNAVAILABLE':status===401||status===403?'AUTH':'UPSTREAM',status});}
 let d;try{d=await r.json();}catch{throw Object.assign(new Error('invalid json'),{code:'UPSTREAM'});}
 const out=(d.candidates||[]).flatMap(c=>c.content?.parts||[]).map(p=>p.text||'').join('\n').trim();
 if(!out)throw Object.assign(new Error('empty output'),{code:'EMPTY'});
 return {reading:out,model,usage:d.usageMetadata||{}};
 }
}
async function generate(x){let error;for(const model of [PRIMARY,SECONDARY]){try{return await gemini(model,x);}catch(e){error=e;if(e.code==='AUTH'||e.code==='QUOTA'||e.code==='TIMEOUT'||e.code==='NETWORK')break; /* only free allowlisted fallback, not billing fallback */ }}throw error;}
async function reading(req,res){if(!originOK(req))return send(res,403,{error:'허용되지 않은 요청입니다.'});if(!KEY)return send(res,503,{error:'서버에 GEMINI_API_KEY가 설정되지 않았습니다.'});if(!FREE)return send(res,503,{error:'무료 티어 확인이 필요합니다. Google AI Studio에서 프로젝트의 Free 티어를 확인한 뒤 서버에 GEMINI_FREE_TIER_CONFIRMED=true를 설정하세요.'});
let raw='';try{for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw,'utf8')>12000)return send(res,413,{error:'요청이 너무 큽니다.'});}let x;try{x=JSON.parse(raw);}catch{return send(res,400,{error:'JSON 입력 형식을 확인해 주세요.'});}if(!validate(x))return send(res,400,{error:'운세 입력값을 확인해 주세요.'});rotate();const id=digest(x),old=cache.get(id);if(old&&old.expires>Date.now()){usage.cacheHits++;return send(res,200,{reading:old.reading,model:old.model,cached:true});}
if(inflight.has(id)){const v=await inflight.get(id);return send(res,200,{reading:v.reading,model:v.model,cached:true});}
if(!allowed(req))return send(res,429,{error:'무료 AI 해석 이용 한도에 도달했습니다. 나중에 다시 시도해 주세요.'});
const task=generate(x);inflight.set(id,task);let result;try{result=await task;}finally{inflight.delete(id);}
usage.success++;usage.byModel[result.model]=(usage.byModel[result.model]||0)+1;usage.promptTokens+=Number(result.usage.promptTokenCount||0);usage.responseTokens+=Number(result.usage.candidatesTokenCount||0);cache.set(id,{reading:result.reading,model:result.model,expires:Date.now()+3600000});if(cache.size>250)cache.delete(cache.keys().next().value);
return send(res,200,{reading:result.reading,model:result.model,cached:false});
}catch(e){usage.failed++;if(e.code==='QUOTA')return send(res,429,{error:'Gemini 무료 티어 요청 한도에 도달했습니다. 유료 모델로 전환하지 않았습니다.'});if(e.code==='AUTH')return send(res,502,{error:'Gemini API 인증 또는 접근 권한을 확인해 주세요.'});if(e.code==='UNAVAILABLE')return send(res,503,{error:'지정된 무료 Gemini 모델을 사용할 수 없습니다. AI Studio에서 사용 가능한 모델을 확인해 주세요.'});if(e.code==='TIMEOUT')return send(res,504,{error:'Gemini 응답 시간이 초과됐습니다.'});return send(res,502,{error:'Gemini 해석 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.'});}}
const server=http.createServer((req,res)=>{if(req.method==='GET'&&req.url==='/api/health')return send(res,200,{ok:true,provider:'gemini',apiConfigured:!!KEY,freeTierConfirmed:FREE,primaryModel:PRIMARY});if(req.method==='POST'&&req.url==='/api/reading')return reading(req,res);if(req.method==='GET'&&(req.url==='/'||req.url==='/index.html')){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});return fs.createReadStream(path.join(__dirname,'index.html')).pipe(res);}return send(res,404,{error:'찾을 수 없는 경로입니다.'});});
server.listen(PORT,HOST,()=>console.log(`별의 서재 Gemini server listening on ${PORT}; configured=${!!KEY}; freeTierConfirmed=${FREE}`));
