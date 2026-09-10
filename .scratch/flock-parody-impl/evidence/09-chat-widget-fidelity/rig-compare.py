from PIL import Image, ImageDraw
import sys

cap_path, cap_x0, cap_y0, rec_path, out = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4], sys.argv[5]
BX0, BY0, BX1, BY1 = 1074, 456, 1440, 900

cap = Image.open(cap_path).convert('RGB').crop((BX0 - cap_x0, BY0 - cap_y0, BX1 - cap_x0, BY1 - cap_y0))
rec = Image.open(rec_path).convert('RGB').crop((BX0, BY0, BX1, BY1))
scale = 2
cap = cap.resize((cap.width * scale, cap.height * scale), Image.NEAREST)
rec = rec.resize((rec.width * scale, rec.height * scale), Image.NEAREST)
label_h = 26
combo = Image.new('RGB', (cap.width + rec.width + 10, cap.height + label_h), (245, 245, 245))
combo.paste(cap, (0, label_h))
combo.paste(rec, (cap.width + 10, label_h))
d = ImageDraw.Draw(combo)
d.text((6, 7), 'CAPTURE', fill=(0, 0, 0))
d.text((cap.width + 16, 7), 'RECREATION', fill=(0, 0, 0))
combo.save(out)
print('wrote', out, combo.size)
