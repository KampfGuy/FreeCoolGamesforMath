#!/usr/bin/env python3
"""Build a single-file offline bundle FreeCoolGamesforMath.html from index.html + css/ + js/ + icons/."""
import base64, re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
html = (root / 'index.html').read_text()
css = (root / 'css/style.css').read_text()
mods = ['parts', 'physics', 'flight', 'world', 'examples', 'builder', 'main']
js = []
for m in mods:
    src = (root / f'js/{m}.js').read_text()
    src = re.sub(r'^import [^;]+;\n', '', src, flags=re.M)
    src = re.sub(r'^export (?=(const|let|function|class|async) )', '', src, flags=re.M)
    js.append(f'// ---- js/{m}.js\n' + src)
code = '\n'.join(js)
icon = base64.b64encode((root / 'icons/icon.svg').read_bytes()).decode()
html = html.replace('<!doctype html>', '<!doctype html>\n<!-- FreeCoolGamesforMath.com rocket builder: single-file offline build generated from index.html + css/ + js/ + icons/ by tools/build.py. -->', 1)
html = re.sub(r'<link rel="manifest"[^>]*>\n?', '', html)
html = re.sub(r'<link rel="apple-touch-icon"[^>]*>\n?', '', html)
html = html.replace('href="icons/icon.svg"', f'href="data:image/svg+xml;base64,{icon}"')
html = re.sub(r'<link rel="stylesheet" href="css/style\.css[^"]*">', lambda m: '<style>\n' + css + '</style>', html)
html = re.sub(r'<script type="module" src="js/main\.js[^"]*"></script>', lambda m: '<script type="module">\n' + code.replace('</script', '<\\/script') + '</script>', html)
(root / 'FreeCoolGamesforMath.html').write_text(html)
print('wrote', len(html), 'bytes')
