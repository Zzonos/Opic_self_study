#!/usr/bin/env python3
"""src/artifact.html (Claude 아티팩트용 본문) → docs/index.html (GitHub Pages용 완전한 HTML)"""
import pathlib, hashlib, json, time, shutil
root = pathlib.Path(__file__).resolve().parents[1]
body = (root / "src/artifact.html").read_text(encoding="utf-8")
# Keep the Claude artifact self-contained and the tested ChatGPT contract identical.
contract = (root / "src/chatgpt-contract.js").read_text(encoding="utf-8")
start, end = "/* OSS_CHATGPT_CONTRACT_START */", "/* OSS_CHATGPT_CONTRACT_END */"
if start in body:
    before, rest = body.split(start, 1)
    _, after = rest.split(end, 1)
    body = before + start + "\n" + contract + end + after
    (root / "src/artifact.html").write_text(body, encoding="utf-8")
head = """<!doctype html>
<html lang="ko" data-build="BUILD_ID">
<head>
<meta charset="utf-8">
<meta http-equiv="Cache-Control" content="no-cache">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="theme-color" content="#0f7a68">
<meta name="apple-mobile-web-app-title" content="OSS">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<link rel="icon" type="image/png" sizes="192x192" href="icons/icon-192.png">
<link rel="manifest" href="manifest.webmanifest">
<script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-compat.js"></script>
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style>
</head>
<body>
"""
build = time.strftime("%Y%m%d-%H%M%S") + "-" + hashlib.sha1(body.encode()).hexdigest()[:6]
(root / "docs/index.html").write_text(head.replace("BUILD_ID", build) + body + "\n</body>\n</html>\n", encoding="utf-8")
(root / "docs/version.json").write_text(json.dumps({"v": build}), encoding="utf-8")
print("build", build)
print("wrote docs/index.html", len(body))
for source in (root / "chatgpt").glob("*"):
    if source.is_file():
        target = root / "docs/chatgpt" / source.name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
