const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { validateInput, validateResult, reserveUsage, callOpenAI, createHandler } = require("../core");
const fixtures = {
  evaluate: { level:"IM3",score:70,summary:"좋아요",strengths:["구조"],fixes:[],model_im3:"I enjoy walking.",model_ih:"I have always enjoyed walking.",expressions:[] },
  script: { scripts:[{n:1,answer:"I enjoy walking."}],expressions:[] },
  sample: { scripts:[{n:1,answer:"I enjoy walking."}] },
  mock: { level:"IM3",score:70,summary:"좋아요",top_fixes:["시제"],per_question:[{n:1,level:"IM3",comment:"좋아요",better:"I walked."}] },
  analysis: { categories:[{name:"시제",count:1,tip:"과거형"}],comment:"좋아요",plan:["매일 연습"] },
  chat: { reply:"What do you enjoy?",reply_ko:"무엇을 즐기나요?",fix:null },
  hint: { en:"I enjoy walking.",note:"취미" },
  summary: { level:"IM3",score:70,summary:"좋아요",fixes:[],expressions:[],next:"더 연습" },
  translate: ["나는 걷기를 즐긴다."]
};
function upstream(value, status=200) { return {ok:status===200,status,json:async()=>({status:"completed",output:[{type:"message",content:[{type:"output_text",text:JSON.stringify(value)}]}]})}; }
for (const [task, value] of Object.entries(fixtures)) test(`${task}: Responses JSON contract`, async () => {
  const result = await callOpenAI({apiKey:"mock-secret",model:"server-model",...validateInput({task,prompt:"JSON please",count:1}),fetchImpl:async (url,opts)=>{
    assert.equal(url,"https://api.openai.com/v1/responses");
    const body=JSON.parse(opts.body);assert.equal(body.store,false);assert.equal(body.model,"server-model");assert.equal(body.max_output_tokens,8000);
    return upstream(value);
  }});
  assert.deepEqual(result,value);
  assert.throws(()=>validateResult(task,{},1),{code:"invalid_json"});
});
test("input bounds, roles, task allowlist, translation counts and ignored model override",()=>{
  for (const body of [{task:"unknown",prompt:"x"},{task:"hint",prompt:[{role:"system",content:"x"}]},{task:"hint",prompt:"x".repeat(60001)},{task:"translate",prompt:"x",count:41}]) assert.throws(()=>validateInput(body));
  assert.equal(validateInput({task:"hint",prompt:"x",model:"expensive"}).model,undefined);
  assert.throws(()=>validateResult("translate",["one"],2),{code:"invalid_json"});
  assert.equal(validateResult("translate",Array(40).fill("해석"),40).length,40);
  assert.throws(()=>validateResult("evaluate",{...fixtures.evaluate,score:101}),{code:"invalid_json"});
});
test("minute/day/concurrent limits and lease recovery",()=>{
  const now=86400000+1000;
  let data=reserveUsage({},now,"a");data=reserveUsage(data,now,"b");
  assert.throws(()=>reserveUsage(data,now,"c"),{code:"rate_limited"});
  assert.throws(()=>reserveUsage({...data,leases:{},minuteCount:12},now,"c"),{code:"rate_limited"});
  assert.throws(()=>reserveUsage({...data,leases:{},dayCount:150},now+60000,"c"),{code:"rate_limited"});
  assert.equal(reserveUsage(data,now+120001,"c").dayCount,3);
  assert.equal(reserveUsage(data,now+86400000,"c").dayCount,1);
  assert.equal(reserveUsage({},now,"other-user").dayCount,1);
});
test("OpenAI refuses, truncates, rate-limits, fails or returns malformed JSON",async()=>{
  const call = fetchImpl=>callOpenAI({apiKey:"mock",model:"test",task:"hint",input:[],fetchImpl});
  await assert.rejects(call(async()=>upstream({},429)),{code:"rate_limited"});
  await assert.rejects(call(async()=>upstream({},500)),{code:"upstream_error"});
  await assert.rejects(call(async()=>({ok:true,json:async()=>({status:"incomplete"})})),{code:"upstream_error"});
  await assert.rejects(call(async()=>({ok:true,json:async()=>({status:"completed",output:[{type:"message",content:[{type:"refusal"}]}]})})),{code:"refused"});
  await assert.rejects(call(async()=>({ok:true,json:async()=>({status:"completed",output:[]})})),{code:"invalid_json"});
});
function harness(overrides={}, request={}) {
  const seen={reserve:0,release:0,calls:0};
  const req=Object.assign(new EventEmitter(),{method:"POST",body:{task:"hint",prompt:"JSON"},get:k=>({Origin:"https://zzonos.github.io",Authorization:"Bearer valid"}[k]),is:()=>true},request);
  const res=Object.assign(new EventEmitter(),{statusCode:200,headers:{},set(k,v){this.headers[k]=v;return this},status(s){this.statusCode=s;return this},json(v){this.body=v;this.writableEnded=true;return this},send(v){this.body=v;this.writableEnded=true;return this}});
  const deps={origins:["https://zzonos.github.io"],verifyToken:async()=>({uid:"user-a"}),isMember:async()=>true,reserve:async()=>{seen.reserve++;return "lease"},release:async()=>{seen.release++},apiKey:()=>"mock",model:()=>"test",fetchImpl:async()=>{seen.calls++;return upstream(fixtures.hint)},...overrides};
  return {req,res,seen,run:()=>createHandler(deps)(req,res)};
}
test("auth, revoked tokens, invite membership, CORS and methods block before spending",async()=>{
  for(const [overrides,request,status] of [
    [{verifyToken:async()=>{throw Error("revoked")}}, {},401],
    [{isMember:async()=>false},{},403],
    [{},{get:()=>"https://evil.example"},403],
    [{},{method:"GET"},405],
    [{apiKey:()=>""},{},503],
    [{},{body:{task:"unknown"}},400]
  ]){const h=harness(overrides,request);await h.run();assert.equal(h.res.statusCode,status);assert.equal(h.seen.calls,0);assert.equal(h.seen.reserve,0)}
  const h=harness();await h.run();assert.equal(h.res.statusCode,200);assert.deepEqual(h.res.body.result,fixtures.hint);assert.equal(h.seen.release,1);
  const preflight=harness({},{method:"OPTIONS"});await preflight.run();assert.equal(preflight.res.statusCode,204);assert.equal(preflight.seen.calls,0);
});
test("rate limit and upstream failure return safe errors; leases release",async()=>{
  const h=harness({reserve:async()=>{const e=new (require('../core').StudyError)("rate_limited",429);throw e}});await h.run();assert.equal(h.res.statusCode,429);assert.equal(h.res.headers["Retry-After"],"60");assert.equal(h.seen.calls,0);
  const f=harness({fetchImpl:async()=>{throw Error("secret must not leak")}});await f.run();assert.equal(f.res.statusCode,502);assert.equal(f.seen.release,1);assert.deepEqual(f.res.body,{error:{code:"upstream_error"}});
});
test("browser disconnect aborts upstream and releases lease",async()=>{
  let started;const ready=new Promise(r=>started=r);
  const h=harness({fetchImpl:async(url,{signal})=>{started();return new Promise((resolve,reject)=>signal.addEventListener("abort",()=>reject(Error("aborted")),{once:true}))}});
  const run=h.run();await ready;h.res.destroyed=true;h.res.emit("close");await run;assert.equal(h.seen.release,1);assert.equal(h.res.body,undefined);
});
module.exports={fixtures};
