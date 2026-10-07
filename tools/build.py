#!/usr/bin/env python3
"""src/artifact.html (Claude 아티팩트용 본문) → docs/index.html (GitHub Pages용 완전한 HTML)"""
import pathlib, hashlib, json, time
root = pathlib.Path(__file__).resolve().parents[1]
body = (root / "src/artifact.html").read_text(encoding="utf-8")
head = """<!doctype html>
<html lang="ko" data-build="BUILD_ID">
<head>
<meta charset="utf-8">
<meta http-equiv="Cache-Control" content="no-cache">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="theme-color" content="#0f7a68">
<link rel="manifest" href="manifest.webmanifest">
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style>
</head>
<body>
"""
build = time.strftime("%Y%m%d-%H%M%S") + "-" + hashlib.sha1(body.encode()).hexdigest()[:6]
(root / "docs/index.html").write_text(head.replace("BUILD_ID", build) + body + "\n</body>\n</html>\n", encoding="utf-8")
(root / "docs/version.json").write_text(json.dumps({"v": build}), encoding="utf-8")
print("build", build)
print("wrote docs/index.html", len(body))
