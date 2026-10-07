import json,sys,os
sys.path.insert(0,"/tmp/claude-0/-home-claude/5f4cd580-33e9-5483-b159-456aab58962c/scratchpad")
from synth import synth,save_mp3
voice=sys.argv[1];tag=sys.argv[2]
items=json.load(open("items.json"));os.makedirs(f"/home/claude/opic/audio/{tag}",exist_ok=True)
man={}
for i,it in enumerate(items):
    p=f"/home/claude/opic/audio/{tag}/{it['k']}.mp3"
    if not os.path.exists(p):
        d=save_mp3(synth(it["t"],voice),p)
    man[it["k"]]=round(os.path.getsize(p)/1000)
    if i%20==0:print(i,flush=True)
json.dump(man,open(f"/home/claude/opic/audio/{tag}/manifest.json","w"))
print("DONE",tag,len(man))
