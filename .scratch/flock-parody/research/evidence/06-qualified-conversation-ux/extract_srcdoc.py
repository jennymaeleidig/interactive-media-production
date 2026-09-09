# Throwaway extraction: pull the Qualified messenger iframe's inlined srcdoc
# out of the singlefile capture (research/flocksafety/index.html).
# Evidence for flock-parody ticket 06.
import re, html, sys

src = open('.scratch/flock-parody/research/flocksafety/index.html',
           encoding='utf-8', errors='replace').read()
m = re.search(r'srcdoc="([^"]*)"', src)
if not m:
    print("no srcdoc found")
    sys.exit(1)
doc = html.unescape(m.group(1))
out = '.scratch/flock-parody/research/evidence/06-qualified-conversation-ux/messenger-srcdoc.html'
open(out, 'w', encoding='utf-8').write(doc)
print(len(doc), 'chars ->', out)
