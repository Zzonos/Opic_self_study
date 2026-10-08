/* OSS built-in neural TTS — Kokoro-82M (int8 ONNX) running in the browser via onnxruntime-web.
   Pure-JS G2P ported (simplified) from misaki: lexicon lookup + stem rules + letter spelling + naive fallback.
   API: KK.load({base,onProgress}) → KK.synth(text,{voice,speed}) → {audio:Float32Array,sr:24000}; KK.wavUrl(audio) */
(function(){
const KK={ready:false,loading:null,sr:24000,manifest:null,lex:null,sess:null,voices:{},base:"tts/",cacheName:"oss-tts-v1"};
const VOWELS=new Set("AIOQWYaeiouæɑɒɔəɚɛɜɪʊʌᵻ".split(""));
const PRI="ˈ",SEC="ˌ";
const US_TAUS=new Set("AIOWYiuæɑəɛɪɹʊʌ".split(""));
const SYMBOLS={"%":"percent","&":"and","+":"plus","@":"at"};
const ONES=["","one","two","three","four","five","six","seven","eight","nine","ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen"];
const TENS=["","","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"];
function num2words(n){n=Math.floor(Math.abs(n));if(n<20)return ONES[n]||"zero";if(n<100)return TENS[Math.floor(n/10)]+(n%10?"-"+ONES[n%10]:"");if(n<1000)return ONES[Math.floor(n/100)]+" hundred"+(n%100?" "+num2words(n%100):"");
  const units=[[1e9,"billion"],[1e6,"million"],[1e3,"thousand"]];for(const [u,name] of units){if(n>=u){return num2words(Math.floor(n/u))+" "+name+(n%u?" "+num2words(n%u):"")}}return String(n)}
function ordinal(n){const w=num2words(n);const irregular={one:"first",two:"second",three:"third",five:"fifth",eight:"eighth",nine:"ninth",twelve:"twelfth"};const parts=w.split(/([ -])/);let last=parts[parts.length-1];
  if(irregular[last])last=irregular[last];else if(last.endsWith("y"))last=last.slice(0,-1)+"ieth";else last=last+"th";parts[parts.length-1]=last;return parts.join("")}
function yearWords(n){if(n>=1100&&n<2000||(n>=2010&&n<2100)){const a=Math.floor(n/100),b=n%100;return num2words(a)+" "+(b<10?(b===0?"hundred":"oh "+num2words(b)):num2words(b))}return num2words(n)}
function expandNumbers(t){
  t=t.replace(/\$(\d+(?:\.\d+)?)/g,(m,a)=>{const [d,c]=a.split(".");let s=num2words(+d)+" dollar"+(+d===1?"":"s");if(c)s+=" and "+num2words(+c.padEnd(2,"0").slice(0,2))+" cent"+(+c===1?"":"s");return s});
  t=t.replace(/(\d+)\s*%/g,(m,a)=>num2words(+a)+" percent");
  t=t.replace(/\b(\d{1,2}):(\d{2})\b/g,(m,h,mm)=>num2words(+h)+(mm==="00"?" o'clock":+mm<10?" oh "+num2words(+mm):" "+num2words(+mm)));
  t=t.replace(/\b(\d+)(st|nd|rd|th)\b/g,(m,a)=>ordinal(+a));
  t=t.replace(/\b(1[1-9]\d\d|20\d\d)\b/g,(m,a)=>yearWords(+a));
  t=t.replace(/\b(\d+)\.(\d+)\b/g,(m,a,b)=>num2words(+a)+" point "+b.split("").map(d=>num2words(+d)).join(" "));
  t=t.replace(/\d+/g,m=>num2words(+m.replace(/,/g,"")));
  return t}
function preprocess(text){return text.replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/–/g,"-").replace(/\s+/g," ").replace(/\.{3,}/g,"…").replace(/\b(Mr|Mrs|Ms|Dr|St)\.(?=\s)/g,"$1").trim()}
function firstVowel(ps){for(const c of ps){if(c===PRI||c===SEC)continue;return VOWELS.has(c)}return false}
function lexGet(w){const L=KK.lex;let v=L[w];if(v===undefined){const lw=w.toLowerCase();if(w!==lw)v=L[lw];if(v===undefined&&w===lw){const cw=w[0].toUpperCase()+w.slice(1);v=L[cw]}}return v}
function resolve(v,ctx){if(v==null)return null;if(typeof v==="string")return v;if(ctx.futureVowel===null&&v.None)return v.None;return v.DEFAULT||Object.values(v)[0]}
function isKnown(w){return lexGet(w)!==undefined}
function lookup(w,ctx){let v=lexGet(w);if(v===undefined)return null;return resolve(v,ctx)}
function _s(stem){if(!stem)return null;const c=stem[stem.length-1];if("ptkfθ".includes(c))return stem+"s";if("szʃʒʧʤ".includes(c))return stem+"ᵻz";return stem+"z"}
function _ed(stem){if(!stem)return null;const c=stem[stem.length-1];if("pkfθʃsʧ".includes(c))return stem+"t";if(c==="d")return stem+"ᵻd";if(c!=="t")return stem+"d";if(stem.length<2)return stem+"ɪd";if(US_TAUS.has(stem[stem.length-2]))return stem.slice(0,-1)+"ɾᵻd";return stem+"ᵻd"}
function _ing(stem){if(!stem)return null;if(stem.length>1&&stem[stem.length-1]==="t"&&US_TAUS.has(stem[stem.length-2]))return stem.slice(0,-1)+"ɾɪŋ";return stem+"ɪŋ"}
function stemS(w,ctx){if(w.length<3||!w.endsWith("s"))return null;let stem=null;if(!w.endsWith("ss")&&isKnown(w.slice(0,-1)))stem=w.slice(0,-1);else if((w.endsWith("'s")||(w.length>4&&w.endsWith("es")&&!w.endsWith("ies")))&&isKnown(w.slice(0,-2)))stem=w.slice(0,-2);else if(w.length>4&&w.endsWith("ies")&&isKnown(w.slice(0,-3)+"y"))stem=w.slice(0,-3)+"y";if(!stem)return null;return _s(lookup(stem,ctx))}
function stemEd(w,ctx){if(w.length<4||!w.endsWith("d"))return null;let stem=null;if(!w.endsWith("dd")&&isKnown(w.slice(0,-1)))stem=w.slice(0,-1);else if(w.length>4&&w.endsWith("ed")&&!w.endsWith("eed")&&isKnown(w.slice(0,-2)))stem=w.slice(0,-2);if(!stem)return null;return _ed(lookup(stem,ctx))}
function stemIng(w,ctx){if(w.length<5||!w.endsWith("ing"))return null;let stem=null;if(w.length>5&&isKnown(w.slice(0,-3)))stem=w.slice(0,-3);else if(isKnown(w.slice(0,-3)+"e"))stem=w.slice(0,-3)+"e";else if(w.length>5&&/([bcdgklmnprstvxz])\1ing$|cking$/.test(w)&&isKnown(w.slice(0,-4)))stem=w.slice(0,-4);if(!stem)return null;return _ing(lookup(stem,ctx))}
function spell(w){const L=KK.lex;const ps=[];for(const c of w){if(!/[A-Za-z]/.test(c))continue;const p=L[c.toUpperCase()];if(p)ps.push(p)}if(!ps.length)return null;return ps.map((p,i)=>i<ps.length-1?p.replace(PRI,SEC):p).join("")}
// naive letter-to-sound for out-of-vocabulary words (names, Korean romanization)
const LTS=[["tch","ʧ"],["sh","ʃ"],["ch","ʧ"],["th","θ"],["ph","f"],["ng","ŋ"],["ck","k"],["qu","kw"],["ee","i"],["oo","u"],["ou","W"],["ow","O"],["ai","A"],["ay","A"],["ea","i"],["ie","i"],["oa","O"],["oi","Y"],["oy","Y"],["eu","ju"],["ae","A"],["eo","ʌ"],["ui","wi"],["oe","wɛ"],["a","ɑ"],["e","ɛ"],["i","i"],["o","O"],["u","u"],["y","i"],["b","b"],["c","k"],["d","d"],["f","f"],["g","ɡ"],["h","h"],["j","ʤ"],["k","k"],["l","l"],["m","m"],["n","n"],["p","p"],["r","ɹ"],["s","s"],["t","t"],["v","v"],["w","w"],["x","ks"],["z","z"]];
function naive(w){let s=w.toLowerCase().replace(/[^a-z]/g,""),out="";let i=0;while(i<s.length){let hit=false;for(const [k,v] of LTS){if(s.startsWith(k,i)){out+=v;i+=k.length;hit=true;break}}if(!hit)i++}
  if(s.length>2&&s.endsWith("e")&&!/[aeiou]e$/.test(s))out=out.replace(/ɛ$/,"");
  // stress first vowel
  for(let k=0;k<out.length;k++){if(VOWELS.has(out[k])){out=out.slice(0,k)+PRI+out.slice(k);break}}return out||null}
function getWord(word,ctx,isFirst){
  if(SYMBOLS[word])return lookup(SYMBOLS[word],ctx);
  const low=word.toLowerCase();
  if(low==="a")return ctx.futureVowel===null?"ˈA":"ɐ";
  if(low==="an")return "ɐn";
  if(low==="am")return ctx.futureVowel===null?lookup("am",ctx):"ɐm";
  if(word==="I")return SEC+"I";
  if(low==="to")return ctx.futureVowel===null?lookup("to",ctx):(ctx.futureVowel?"tʊ":"tə");
  if(low==="in")return (ctx.futureVowel===null?PRI:"")+"ɪn";
  if(low==="the")return ctx.futureVowel===true?"ði":"ðə";
  if(/\./.test(word.replace(/^\.+|\.+$/g,""))&&/^[A-Za-z.]+$/.test(word))return spell(word);
  let w=word;
  // capitalised word at sentence start / Title Case → try lowercase first unless it's a proper entry
  if(w!==low&&!(KK.lex[w]!==undefined)&&(isFirst||w.slice(1)===w.slice(1).toLowerCase())&&(isKnown(low)||stemS(low,ctx)||stemEd(low,ctx)||stemIng(low,ctx)))w=low;
  let ps=lookup(w,ctx);if(ps)return ps;
  if(w.endsWith("s'")&&isKnown(w.slice(0,-2)+"'s"))return lookup(w.slice(0,-2)+"'s",ctx);
  if(w.endsWith("'")&&isKnown(w.slice(0,-1)))return lookup(w.slice(0,-1),ctx);
  ps=stemS(w,ctx)||stemEd(w,ctx)||stemIng(w,ctx);if(ps)return ps;
  if(w!==low){ps=stemS(low,ctx)||stemEd(low,ctx)||stemIng(low,ctx);if(ps)return ps}
  if(/^[A-Z]{2,5}s?$/.test(word)){const sp=spell(word.replace(/s$/,""));if(sp)return word.endsWith("s")?sp+"z":sp}
  if(/^[A-Z][a-z]+[A-Z]/.test(word)||/^[A-Z]+[a-z]{1,2}$/.test(word)){const sp=spell(word);if(sp)return sp}
  // hyphen / apostrophe pieces
  if(word.includes("-")){const parts=word.split("-").filter(Boolean).map(p=>getWord(p,ctx,false)).filter(Boolean);if(parts.length)return parts.join("")}
  if(word.includes("'")){const parts=word.split("'");const a=getWord(parts[0],ctx,isFirst);const suf={s:"z",ll:"l",re:"ɹ",ve:"v",d:"d",m:"m",t:"t"}[parts[1].toLowerCase()];if(a&&suf!==undefined)return a+(parts[1].toLowerCase()==="s"?_s(a).slice(a.length):suf)}
  return naive(word)}
KK.g2p=function(text){
  const t=expandNumbers(preprocess(text));
  const re=/[A-Za-z]+(?:['’][A-Za-z]+)*(?:-[A-Za-z]+)*|\d+|[^\sA-Za-z\d]/g;const toks=[];let m;
  while((m=re.exec(t))){toks.push({s:m[0],i:m.index,word:/^[A-Za-z]/.test(m[0]),ws:false})}
  for(let k=0;k<toks.length-1;k++)toks[k].ws=/\s/.test(t[toks[k].i+toks[k].s.length]||"");
  // right-to-left: future vowel context
  const ps=new Array(toks.length).fill("");let future=null;
  for(let k=toks.length-1;k>=0;k--){const tk=toks[k];
    if(!tk.word){ps[k]=tk.s;future=(/[,.;:!?…—"()]/.test(tk.s))?null:future;continue}
    const isFirst=k===0||!toks[k-1].word;
    const p=getWord(tk.s,{futureVowel:future},isFirst)||"";ps[k]=p;future=p?firstVowel(p):future}
  let out="";for(let k=0;k<toks.length;k++){out+=ps[k];if(toks[k].ws&&k<toks.length-1)out+=" "}
  return out.replace(/\s+([,.;:!?…])/g,"$1").replace(/\s{2,}/g," ").trim()}
KK.tokenize=function(ph){const V=KK.manifest.vocab;const ids=[];for(const c of ph){const id=V[c];if(id!==undefined)ids.push(id)}return ids};
// ---- loading ----
async function fetchBuf(url,onProgress,label){const cache=await (self.caches?caches.open(KK.cacheName).catch(()=>null):null);
  if(cache){const hit=await cache.match(url);if(hit){const b=await hit.arrayBuffer();onProgress&&onProgress({label,loaded:b.byteLength,total:b.byteLength,cached:true});return b}}
  const r=await fetch(url);if(!r.ok)throw new Error("fetch "+url+" "+r.status);const total=+r.headers.get("content-length")||0;
  if(!r.body||!onProgress){const b=await r.arrayBuffer();if(cache)cache.put(url,new Response(b.slice(0))).catch(()=>{});return b}
  const reader=r.body.getReader();const chunks=[];let loaded=0;while(true){const {done,value}=await reader.read();if(done)break;chunks.push(value);loaded+=value.length;onProgress({label,loaded,total})}
  const out=new Uint8Array(loaded);let o=0;for(const c of chunks){out.set(c,o);o+=c.length}if(cache)cache.put(url,new Response(out.buffer.slice(0))).catch(()=>{});return out.buffer}
KK.load=function({base=KK.base,onProgress=null}={}){if(KK.ready)return Promise.resolve(KK);if(KK.loading)return KK.loading;KK.base=base;
  KK.loading=(async()=>{if(!self.ort)throw new Error("onnxruntime-web(ort)가 먼저 로드돼야 해요");
    const t0=performance.now();try{if(self.crossOriginIsolated)ort.env.wasm.numThreads=Math.min(4,navigator.hardwareConcurrency||1)}catch(e){}const prog=(stage,frac,extra)=>onProgress&&onProgress({stage,frac,...extra});
    prog("manifest",0);KK.manifest=await (await fetch(base+"manifest.json")).json();
    prog("lex",0.02);KK.lex=await (await fetch(base+"lex.json")).json();
    const n=KK.manifest.parts;const partBufs=[];let got=0;
    for(let i=0;i<n;i++){partBufs.push(await fetchBuf(base+"model/kokoro.int8.part"+i,p=>prog("model",0.05+0.75*((got+p.loaded)/KK.manifest.size),{loaded:got+p.loaded,total:KK.manifest.size}),"model"));got+=partBufs[i].byteLength}
    const model=new Uint8Array(got);let o=0;for(const b of partBufs){model.set(new Uint8Array(b),o);o+=b.byteLength}
    prog("session",0.85);try{if(!self.crossOriginIsolated)ort.env.wasm.numThreads=1}catch(e){}
    KK.sess=await ort.InferenceSession.create(model,{executionProviders:["wasm"],graphOptimizationLevel:"all"});
    prog("ready",1,{ms:Math.round(performance.now()-t0)});KK.ready=true;return KK})();
  KK.loading.catch(()=>{KK.loading=null});return KK.loading};
KK.voice=async function(name){if(KK.voices[name])return KK.voices[name];const b=await fetchBuf(KK.base+"voices/"+name+".bin",null,"voice");const f=new Float32Array(b);KK.voices[name]=f;return f};
function splitChunks(ph,max=360){const sents=ph.split(/(?<=[.!?…])\s+/);const out=[];let cur="";for(const s of sents){if((cur+" "+s).length>max&&cur){out.push(cur);cur=s}else cur=cur?cur+" "+s:s}if(cur)out.push(cur);
  return out.flatMap(c=>c.length<=max?[c]:c.split(/(?<=[,;:])\s+/).reduce((a,p)=>{const l=a[a.length-1];if(l!==undefined&&(l+" "+p).length<=max)a[a.length-1]=l+" "+p;else a.push(p);return a},[]))}
KK.synth=async function(text,{voice="af_heart",speed=1.0,onChunk=null}={}){if(!KK.ready)await KK.load();const v=await KK.voice(voice);
  const ph=KK.g2p(text);const chunks=splitChunks(ph);const audios=[];
  for(const ch of chunks){const ids=KK.tokenize(ch);if(!ids.length)continue;const n=Math.min(ids.length,509);
    const tokens=new ort.Tensor("int64",BigInt64Array.from([0n,...ids.slice(0,509).map(BigInt),0n]),[1,n+2]);
    const style=new ort.Tensor("float32",Float32Array.from(v.subarray((n-1)*256,n*256)),[1,256]);
    const sp=new ort.Tensor("float32",new Float32Array([speed]),[1]);
    const out=await KK.sess.run({tokens,style,speed:sp});let a=out.audio.data;
    // trim a little tail silence between chunks
    audios.push(a);onChunk&&onChunk(a)}
  const total=audios.reduce((s,a)=>s+a.length,0)+Math.max(0,audios.length-1)*2400;const audio=new Float32Array(total);let o=0;
  audios.forEach((a,i)=>{audio.set(a,o);o+=a.length+(i<audios.length-1?2400:0)});return {audio,sr:KK.sr,phonemes:ph}};
KK.wavBlob=function(audio,sr=KK.sr){const n=audio.length;const buf=new ArrayBuffer(44+n*2);const dv=new DataView(buf);const w=(o,s)=>{for(let i=0;i<s.length;i++)dv.setUint8(o+i,s.charCodeAt(i))};
  w(0,"RIFF");dv.setUint32(4,36+n*2,true);w(8,"WAVE");w(12,"fmt ");dv.setUint32(16,16,true);dv.setUint16(20,1,true);dv.setUint16(22,1,true);dv.setUint32(24,sr,true);dv.setUint32(28,sr*2,true);dv.setUint16(32,2,true);dv.setUint16(34,16,true);w(36,"data");dv.setUint32(40,n*2,true);
  let peak=0;for(let i=0;i<n;i++)peak=Math.max(peak,Math.abs(audio[i]));const g=peak>0?Math.min(1,0.95/peak):1;
  for(let i=0;i<n;i++){const s=Math.max(-1,Math.min(1,audio[i]*g));dv.setInt16(44+i*2,s<0?s*32768:s*32767,true)}return new Blob([buf],{type:"audio/wav"})};
KK.wavUrl=function(audio,sr){return URL.createObjectURL(KK.wavBlob(audio,sr))};
self.KK=KK;
})();
