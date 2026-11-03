'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const API_KEY = process.env.OPENAI_API_KEY;
const API_URL = process.env.NODE_ENV === 'test' && process.env.OPENAI_TEST_URL ? process.env.OPENAI_TEST_URL : 'https://api.openai.com/v1/responses';
const DAILY_LIMIT = Math.max(1,Number(process.env.DAILY_LIMIT || 20));
const WINDOW_LIMIT = Math.max(1,Number(process.env.HOURLY_LIMIT || 4));
const MAX_DAILY_TOTAL = Math.max(1,Number(process.env.MAX_DAILY_TOTAL || 250));
const buckets = new Map();let total = {day:'',count:0};
const topics = new Set(['성격과 기질','연애와 관계','직업과 적성','재물과 소비','올해의 흐름','월별 흐름']);
const send=(res,code,obj)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(obj));};
const allowedOrigin=(req)=>{const origin=req.headers.origin;if(!origin)return true;try{return new URL(origin).host===req.headers.host;}catch{return false;}};
function checkLimit(req){const day=new Date().toISOString().slice(0,10);if(total.day!==day)total={day,count:0};if(total.count>=MAX_DAILY_TOTAL)return false;const ip=req.socket.remoteAddress||'unknown';const key=crypto.createHash('sha256').update(ip).digest('hex');const now=Date.now();let b=buckets.get(key)||[];b=b.filter(t=>now-t<86400000);if(b.length>=DAILY_LIMIT||b.filter(t=>now-t<3600000).length>=WINDOW_LIMIT)return false;b.push(now);buckets.set(key,b);total.count++;return true;}
function validate(x){if(!x||typeof x!=='object'||!topics.has(x.topic))return false;if(!x.profile||typeof x.profile.birth!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(x.profile.birth))return false;if(!['양력','음력'].includes(x.profile.calendar)||!['남성','여성'].includes(x.profile.gender))return false;if(!x.pillars||typeof x.pillars!=='object')return false;for(const k of ['year','month','day','hour']){const p=x.pillars[k];if(p!==null&&(!p||!Number.isInteger(p.stem)||p.stem<0||p.stem>9||!Number.isInteger(p.branch)||p.branch<0||p.branch>11))return false;}return typeof x.solarDate==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x.solarDate);}
async function reading(req,res){if(!allowedOrigin(req))return send(res,403,{error:'허용되지 않은 요청입니다.'});if(!API_KEY)return send(res,503,{error:'서버에 OPENAI_API_KEY가 설정되지 않았습니다. README를 확인해 주세요.'});let body='';try{for await(const chunk of req){body+=chunk;if(body.length>12000)return send(res,413,{error:'요청이 너무 큽니다.'});}const x=JSON.parse(body);if(!validate(x))return send(res,400,{error:'운세 입력값을 확인해 주세요.'});if(!checkLimit(req))return send(res,429,{error:'무료 AI 해석 이용 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.'});
const instructions=`당신은 '별의 서재'의 한국어 전통 명리학 문화 콘텐츠 해설자다. 사용자에게 따뜻하고 신비롭되 절제된 문체로 답한다. 제공된 사주 계산값 외의 천간지지, 지장간, 용신, 대운, 세운, 합충, 절기 시각을 만들어내지 않는다. 특히 단순 오행 개수만으로 신강·신약, 용신을 단정하지 않는다. 사주는 검증된 과학적 예측이 아닌 전통 문화와 자기성찰의 도구임을 인지한다. 절대적 예언, 건강·법률·재정 관련 확정 조언, 공포·불안 조장, 개인정보 재노출을 피한다. 주어진 주제 한 개에 대해 한국어 500~800자 정도로 '별의 해석', '나에게 건네는 조언' 두 소제목을 사용한다. 계산 근거와 해석을 구분한다. 시간 미상은 시주를 언급하지 않는다. 현재 시점과 관련된 요청은 서버에서 전달한 오늘 날짜를 기준으로 하되 일간·세운 정밀 계산을 하지 않았음을 밝힌다. 텍스트만 출력한다.`;
const payload={model:MODEL,instructions,input:JSON.stringify({topic:x.topic,today:new Date().toISOString().slice(0,10),solarDate:x.solarDate,gender:x.profile.gender,pillars:x.pillars,calculationNote:'KoreanLunarCalendar 날짜 간지표; 절기 경계 및 출생지·시간 보정 미검증'}),max_output_tokens:1200,store:false};
const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),35000);let r;try{r=await fetch(API_URL,{method:'POST',headers:{'Authorization':'Bearer '+API_KEY,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:ctrl.signal});}finally{clearTimeout(timer)}
const data=await r.json();if(!r.ok){console.error('OpenAI API error',r.status,data.error?.code||'');return send(res,502,{error:'AI 서비스 요청에 실패했습니다. 서버 설정과 사용 한도를 확인해 주세요.'});}
const output=(data.output||[]).flatMap(o=>o.content||[]).filter(c=>c.type==='output_text').map(c=>c.text).join('\n').trim();if(!output)return send(res,502,{error:'AI 해석 결과가 비어 있습니다. 다시 시도해 주세요.'});return send(res,200,{reading:output});
}catch(err){console.error('Reading request error:',err.message);return send(res,500,{error:'일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'});}}
const server=http.createServer((req,res)=>{if(req.url==='/api/health'&&req.method==='GET')return send(res,200,{ok:true,apiConfigured:!!API_KEY});if(req.url==='/api/reading'&&req.method==='POST')return reading(req,res);if(req.method==='GET'&&(req.url==='/'||req.url==='/index.html')){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});return fs.createReadStream(path.join(__dirname,'index.html')).pipe(res);}send(res,404,{error:'찾을 수 없는 경로입니다.'});});
server.listen(PORT,HOST,()=>console.log(`별의 서재 v5: http://${HOST}:${PORT} | API configured: ${!!API_KEY}`));
