// npm ci; npx playwright install chromium; npm run test:browser
// BROWSER_EXECUTABLE may point to a locally installed Chrome/Chromium.
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const html = fs.readFileSync(path.join(__dirname,"../docs/index.html"),"utf8");
const rating={level:"IM3",score:70,summary:"좋아요",strengths:["구조"],fixes:[],model_im3:"I enjoy walking in the park.",model_ih:"I have always enjoyed walking in the park.",expressions:[],next:"더 연습",top_fixes:["시제"]};
const result = body => {
  switch(body.task){
    case "evaluate": case "summary": return {...rating};
    case "script": case "sample": return {scripts:Array.from({length:body.count},(_,i)=>({n:i+1,answer:"I enjoy walking in the park."})),expressions:[]};
    case "chat": return {reply:"What do you enjoy doing on weekends?",reply_ko:"주말에 무엇을 즐기나요?",fix:null};
    case "hint": return {en:"I enjoy walking.",note:"취미"};
    case "translate": return Array.from({length:body.count},()=>"나는 걷기를 즐긴다.");
    case "mock": return {...rating,per_question:Array.from({length:body.count},(_,i)=>({n:i+1,level:"IM3",comment:"좋아요",better:"I walked."}))};
    case "analysis": return {categories:[],comment:"좋아요",plan:["매일 연습"]};
    default: throw Error(`unexpected task ${body.task}`);
  }
};
let browser,passed=0;
async function boot({loggedIn=true,claude=false,mode="ok"}={}){
  const context=await browser.newContext({serviceWorkers:"block"});
  const page=await context.newPage(),errors=[],calls=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.addInitScript(({loggedIn,claude})=>{
    window.__writes=[];window.__tokens=[];window.__claudeCalls=[];
    localStorage.setItem("opic30",JSON.stringify({log:[{date:"2026-10-09",ts:1,kind:"practice",title:"old record",qt:"desc",level:"IM2",score:60,secs:30,fixes:[]}],scripts:{keep:{scripts:[{answer:"old script"}]}},updatedAt:1}));
    const user={uid:"mock-user",email:"mock@example.com",getIdToken:async force=>{window.__tokens.push(!!force);return force?"fresh-token":"mock-token"}};
    const ref={get:async()=>({exists:false}),set:async value=>window.__writes.push(value),onSnapshot:()=>()=>{}};
    const auth={useDeviceLanguage(){},onAuthStateChanged(cb){window.__authChange=cb;setTimeout(()=>cb(loggedIn?user:null),0)},signOut:async()=>window.__authChange(null),signInWithEmailAndPassword:async()=>window.__authChange(user)};
    if(!claude)window.firebase={initializeApp(){},auth:()=>auth,firestore:()=>({collection:()=>({doc:()=>ref})})};
    else window.claude={use:async cap=>cap==="user"?{id:async()=>"claude-user"}:cap==="db"?{collection:()=>({doc:()=>ref})}:{json:async(prompt,opts)=>{window.__claudeCalls.push({prompt,opts});return {level:"IM3",score:70,summary:"좋아요",strengths:[],fixes:[],model_im3:"I walk.",model_ih:"I have walked.",expressions:[]}}}};
  },{loggedIn,claude});
  await page.route("**/*",async route=>{
    const req=route.request(),url=req.url();
    if(url.includes("cloudfunctions.net/gptStudy")){
      const body=req.postDataJSON();calls.push({body,headers:req.headers()});
      if(mode==="hold"){await new Promise(r=>setTimeout(r,500));return route.abort().catch(()=>{})}
      if(mode==="network")return route.abort("failed");
      let status=mode==="limit"?429:mode==="expired"?401:mode==="refresh"&&calls.length===1?401:200;
      return route.fulfill({status,contentType:"application/json",body:JSON.stringify(status===200?{result:result(body)}:{error:{code:status===429?"rate_limited":"session_expired"}})});
    }
    if(url==="http://localhost:8765/"||url.endsWith("/index.html"))return route.fulfill({contentType:"text/html",body:html});
    return route.fulfill({status:404,body:""});
  });
  await page.goto("http://localhost:8765/");
  await page.waitForFunction(claude?"sample !== null":"cloud.ready");
  return {page,calls,errors,context};
}
async function run(name,fn,opts){const h=await boot(opts);try{await fn(h);assert.deepEqual(h.errors,[]);passed++;console.log(`PASS ${name}`)}finally{await h.context.close()}}
async function connect(page){await page.getByRole("button",{name:"GPT로 실행",exact:true}).click();await page.waitForFunction("sample===gptSample");}
async function practice(page){await page.evaluate(()=>go("practice",{topic:TOPICS[0],q:TOPICS[0].qs[0],kind:"자기소개"}));await page.locator('textarea[id^="ans_"]').fill("I enjoy walking in the park every weekend with my family.");}
(async()=>{
  browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
  await run("separate GPT and Claude buttons; login required",async({page,calls})=>{
    await page.evaluate(()=>{cloud.skip=true;render()});
    assert.equal(await page.getByRole("link",{name:"Claude에서 열기",exact:true}).getAttribute("href"),"https://claude.ai/artifact/HuASd2nEpXENsSugPoScyp");
    await page.getByRole("button",{name:"GPT로 실행",exact:true}).click();
    assert.equal(await page.evaluate(()=>sample),null);assert.equal(calls.length,0);
    assert.ok(await page.getByRole("button",{name:"로그인",exact:true}).count());
  },{loggedIn:false});
  await run("evaluation saves locally and through existing cloud sync",async({page,calls})=>{
    await connect(page);await practice(page);await page.getByRole("button",{name:"AI 평가 받기",exact:true}).click();
    await page.waitForFunction("S.log.length===2");await page.evaluate(()=>cloudPush(true));
    const state=await page.evaluate(()=>({local:JSON.parse(localStorage.getItem("opic30")),cloud:JSON.parse(__writes.at(-1).state)}));
    assert.equal(state.local.log[0].title,"old record");assert.equal(state.cloud.log.length,2);assert.equal(calls[0].body.task,"evaluate");assert.equal(calls[0].headers.authorization,"Bearer mock-token");
    await page.getByRole("button",{name:"GPT 연결 해제",exact:true}).click();assert.equal(await page.evaluate(()=>S.log.length),2);assert.equal(await page.locator('textarea[id^="ans_"]').inputValue(),"I enjoy walking in the park every weekend with my family.");
  });
  for(const mode of ["limit","expired","network","hold"])await run(`${mode}: no fabricated record and draft preserved`,async({page,calls})=>{
    await connect(page);await practice(page);await page.getByRole("button",{name:"AI 평가 받기",exact:true}).click();
    if(mode==="hold")await page.locator("#gpt_busy").getByRole("button",{name:"취소",exact:true}).click();
    await page.waitForFunction("gpt.pending.size===0");
    assert.equal(await page.evaluate(()=>S.log.length),1);assert.equal(await page.locator('textarea[id^="ans_"]').inputValue(),"I enjoy walking in the park every weekend with my family.");
    assert.equal(calls.length,mode==="expired"?2:1);
  },{mode});
  await run("expired token refresh succeeds once",async({page,calls})=>{
    await connect(page);await practice(page);await page.getByRole("button",{name:"AI 평가 받기",exact:true}).click();await page.waitForFunction("S.log.length===2");assert.equal(calls.length,2);assert.equal(calls[1].headers.authorization,"Bearer fresh-token");
  },{mode:"refresh"});
  await run("script, listening examples, translation and analysis",async({page,calls})=>{
    await connect(page);await page.evaluate(()=>go("scripts",{topic:TOPICS[0]}));await page.getByRole("button",{name:"AI로 스크립트 만들기",exact:true}).click();await page.waitForFunction("!!S.scripts.intro");
    await page.evaluate(async()=>{const t=TOPICS[1];const r=await genSample(t);S.samples[t.id]={...r,date:todayStr()};save();await translateSents(["First sentence.","Second sentence."]);});
    assert.equal(await page.evaluate(()=>Object.keys(S.trans).length),2);assert.equal(await page.evaluate(()=>S.scripts.keep.scripts[0].answer),"old script");
    await page.evaluate(()=>{while(S.log.length<5)S.log.push({...S.log[0],ts:S.log.length+1});go("today",{analysis:true})});await page.getByRole("button",{name:/AI 코치 분석/}).click();await page.waitForFunction("!!S.analysis");assert.deepEqual(calls.map(x=>x.body.task),["script","sample","translate","analysis"]);
  });
  await run("conversation, hint, summary and saved review",async({page,calls})=>{
    await connect(page);await page.evaluate(()=>{go("chat");startChat(SCEN[0])});await page.waitForFunction("chat.ui.length===1");
    await page.locator("#chat_ko").fill("걷기를 즐겨요");await page.getByRole("button",{name:"영어로",exact:true}).click();await page.waitForFunction("document.querySelector('#chat_in').value==='I enjoy walking.'");
    for(let i=0;i<2;i++){await page.locator("#chat_in").fill("I enjoy walking in the park.");await page.getByRole("button",{name:"보내기",exact:true}).click();await page.waitForFunction(n=>chat.n===n,i+1)}
    await page.getByRole("button",{name:"대화 끝내기",exact:true}).click();await page.waitForFunction("S.log.length===2");assert.equal(await page.evaluate(()=>S.log.at(-1).kind),"chat");assert.deepEqual(calls.map(x=>x.body.task),["chat","hint","chat","chat","summary"]);
  });
  await run("conversation failure restores unsent text",async({page})=>{
    await connect(page);await page.evaluate(()=>{chat={sc:SCEN[0],turns:[],ui:[],n:0,busy:false,auto:false,summary:null};go("chat")});await page.locator("#chat_in").fill("Please keep this unsent text.");await page.getByRole("button",{name:"보내기",exact:true}).click();await page.waitForFunction("!chat.busy");assert.equal(await page.locator("#chat_in").inputValue(),"Please keep this unsent text.");assert.equal(await page.evaluate(()=>S.log.length),1);
  },{mode:"network"});
  await run("15-question mock result saves once during rerender",async({page,calls})=>{
    await connect(page);await page.evaluate(()=>{mock={items:Array.from({length:15},(_,i)=>({q:"Question "+i,a:"I enjoy walking.",kind:"description",secs:30})),result:"pending"};go("mock");render()});await page.waitForFunction("S.log.length===2");assert.equal(calls.length,1);assert.equal(calls[0].body.count,15);
  });
  await run("logout cancels in-flight request; prior records remain",async({page})=>{
    await connect(page);await practice(page);await page.getByRole("button",{name:"AI 평가 받기",exact:true}).click();await page.evaluate(()=>firebase.auth().signOut());await page.waitForFunction("gpt.pending.size===0");assert.equal(await page.evaluate(()=>sample),null);assert.equal(await page.evaluate(()=>S.log.length),1);
  },{mode:"hold"});
  await run("disconnect during evaluation preserves draft and records",async({page})=>{
    await connect(page);await practice(page);await page.getByRole("button",{name:"AI 평가 받기",exact:true}).click();await page.locator("#gpt_busy").getByRole("button",{name:"GPT 연결 해제",exact:true}).click();await page.waitForFunction("gpt.pending.size===0");assert.equal(await page.evaluate(()=>sample),null);assert.equal(await page.evaluate(()=>S.log.length),1);assert.ok((await page.locator('textarea[id^="ans_"]').inputValue()).startsWith("I enjoy"));
  },{mode:"hold"});
  await run("cancel while Firebase token refresh is pending",async({page,calls})=>{
    await connect(page);await page.evaluate(()=>{cloud.user.getIdToken=()=>new Promise(()=>{})});await practice(page);await page.getByRole("button",{name:"AI 평가 받기",exact:true}).click();await page.locator("#gpt_busy").getByRole("button",{name:"취소",exact:true}).click();await page.waitForFunction("gpt.pending.size===0");assert.equal(calls.length,0);assert.equal(await page.evaluate(()=>S.log.length),1);
  });
  await run("failed translation batch preserves completed translations",async({page,calls})=>{
    await connect(page);await page.unroute("**/*");let count=0;
    await page.route("**/gptStudy",async route=>{count++;if(count===2)return route.abort("failed");return route.fulfill({contentType:"application/json",body:JSON.stringify({result:Array(40).fill("저장된 해석")})})});
    const code=await page.evaluate(async()=>{try{await translateSents(Array.from({length:45},(_,i)=>"Sentence "+i+"."));return "success"}catch(e){return e.code}});assert.equal(code,"upstream_error");assert.equal(await page.evaluate(()=>Object.keys(S.trans).length),40);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem("opic30")).trans["Sentence 0."]),"저장된 해석");
  });
  await run("Claude adapter retains original prompt/options and saving",async({page,calls})=>{
    assert.equal(await page.getByRole("button",{name:"GPT로 실행",exact:true}).count(),0);await practice(page);await page.getByRole("button",{name:"AI 평가 받기",exact:true}).click();await page.waitForFunction("S.log.length===2");assert.equal(calls.length,0);
    const opts=await page.evaluate(()=>__claudeCalls[0].opts);assert.deepEqual(opts,{onText:null,cache:false});
  },{claude:true});
  console.log(`${passed} browser mock scenarios passed. No real Firebase/OpenAI calls.`);
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close()});
