# Ticket 14 evidence: side-by-side LIVE vs RECREATION for the header's states
# at 1440x900 (rest / scrolled / menu open) and 390x844 (rest / scrolled /
# take-over open / sub-menu open). Shots come from the Docker chromium rig
# (docker exec navshot node /tmp/navshot.mjs <url> W H /tmp/shots <label> [mode]),
# live = https://www.flocksafety.com/, ours = the built served tree over HTTP.
# The probe is vendored beside this file as navshot.mjs.
# Run from the repo root: python3 .scratch/flock-parody-impl/evidence/14-header-fidelity/rig-compare.py
from PIL import Image, ImageDraw

SRC = "/tmp/navshots"
OUT = ".scratch/flock-parody-impl/evidence/14-header-fidelity"

# state -> crop box; the crop frames the header band (and, for the open menu,
# the panel below it)
CROPS = {
    "desktop-rest": (0, 0, 1440, 420),
    "desktop-scrolled": (0, 0, 1440, 420),
    "desktop-menu": (0, 0, 1440, 620),
    "mobile-rest": (0, 0, 390, 300),
    "mobile-scrolled": (0, 0, 390, 300),
    "mobile-takeover": (0, 0, 390, 844),
    "mobile-submenu": (0, 0, 390, 844),
}
LABEL_H = 34
GAP = 12

for name, box in CROPS.items():
    live = Image.open(f"{SRC}/live-{name}.png").convert("RGB").crop(box)
    ours = Image.open(f"{SRC}/ours-{name}.png").convert("RGB").crop(box)
    combo = Image.new(
        "RGB",
        (live.width + GAP + ours.width, max(live.height, ours.height) + LABEL_H),
        (250, 250, 248),
    )
    combo.paste(live, (0, LABEL_H))
    combo.paste(ours, (live.width + GAP, LABEL_H))
    d = ImageDraw.Draw(combo)
    d.text((8, 12), "LIVE  flocksafety.com", fill=(20, 20, 20))
    d.text((live.width + GAP + 8, 12), "RECREATION  local", fill=(20, 20, 20))
    combo.save(f"{OUT}/compare-{name}.png")
    print("wrote", f"{OUT}/compare-{name}.png", combo.size)
