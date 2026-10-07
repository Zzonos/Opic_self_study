import json,sys,os
sys.path.insert(0,"/tmp/claude-0/-home-claude/5f4cd580-33e9-5483-b159-456aab58962c/scratchpad")
from synth_ko import synth_ko,save_mp3
items=json.load(open("items_ko.json"));os.makedirs("/home/claude/opic/audio/ko",exist_ok=True)
man={}
for i,it in enumerate(items):
    p=f"/home/claude/opic/audio/ko/{it['k']}.mp3"
    if not os.path.exists(p):save_mp3(synth_ko(it["t"]),p)
    man[it["k"]]=round(os.path.getsize(p)/1000)
    if i%20==0:print(i,flush=True)
json.dump(man,open("/home/claude/opic/audio/ko/manifest.json","w"))
print("DONE",len(man))
