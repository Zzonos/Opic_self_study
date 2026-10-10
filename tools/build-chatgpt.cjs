// Export the repository's actual Claude-compatible study data; no AI/network calls.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),s=fs.readFileSync(path.join(root,'src/artifact.html'),'utf8');
const data=s.slice(s.indexOf('const LEVELS='),s.indexOf('/* ============ STATE ============ */'));
const scenarios=s.slice(s.indexOf('const SCEN='),s.indexOf('let chat=null'));
const rubric=s.match(/const RUBRIC=`[\s\S]*?`;/)[0];
const reference=vm.runInNewContext(data+'\n'+scenarios+'\n'+rubric+'\nJSON.stringify({target:TARGET,levels:LEVELS,topics:TOPICS,roleplays:ROLEPLAYS,advanced:ADVANCED,advanced_ko:ADVANCED_KO,scenarios:SCEN,rubric:RUBRIC},null,2)',{}, {timeout:1000});
fs.writeFileSync(path.join(root,'chatgpt/study-reference.json'),reference+'\n');
console.log('Exported current OSS question bank, scenarios and rubric.');
