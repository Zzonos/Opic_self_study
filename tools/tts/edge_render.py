#!/usr/bin/env python3
"""Microsoft 신경망 음성(edge-tts)으로 OSS 음성 클립 렌더링.
사용법 (Windows PowerShell / 명령 프롬프트):
    pip install edge-tts
    python edge_render.py
결과: 이 파일 옆 out/ 폴더에 m/ f/ ko/ 폴더와 manifest.json 생성 → 그 폴더를 Claude에게 전달하면 앱에 반영.
"""
import asyncio, json, os, sys, pathlib
try:
    import edge_tts
except ImportError:
    print("edge-tts가 없습니다. 먼저  pip install edge-tts  를 실행하세요."); sys.exit(1)

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE / "out"
SETS = [  # (폴더, 항목 파일, 음성, 속도)
    ("m",  "items.json",    "en-US-AndrewMultilingualNeural", "-8%"),
    ("f",  "items.json",    "en-US-AvaMultilingualNeural",    "-8%"),
    ("ko", "items_ko.json", "ko-KR-SunHiNeural",              "-5%"),
]

async def render(folder, items_file, voice, rate):
    items = json.loads((HERE / items_file).read_text(encoding="utf-8"))
    d = OUT / folder; d.mkdir(parents=True, exist_ok=True)
    man = {}
    for i, it in enumerate(items):
        p = d / f"{it['k']}.mp3"
        if not p.exists():
            for attempt in range(3):
                try:
                    await edge_tts.Communicate(it["t"], voice, rate=rate).save(str(p)); break
                except Exception as e:
                    print("  재시도", it["k"], e); await asyncio.sleep(2)
        man[it["k"]] = round(p.stat().st_size / 1000) if p.exists() else 0
        if i % 20 == 0: print(f"{folder}: {i}/{len(items)}")
    (d / "manifest.json").write_text(json.dumps(man), encoding="utf-8")
    print(f"{folder}: 완료 {len(man)}개 → {d}")

async def main():
    for s in SETS: await render(*s)
    print("\n모두 완료. out 폴더를 Claude에게 전달하세요.")

asyncio.run(main())
