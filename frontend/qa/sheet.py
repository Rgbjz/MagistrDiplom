import sys, glob, math, os
from PIL import Image, ImageDraw
d = sys.argv[1]; per = int(sys.argv[2]) if len(sys.argv) > 2 else 9
files = sorted(f for f in glob.glob(os.path.join(d, '*.png')) if '/sheet-' not in f)
cols = 3; tw = 620
for s in range(0, len(files), per):
    chunk = files[s:s+per]
    ims = []
    for f in chunk:
        im = Image.open(f).convert('RGB')
        h = int(im.height * tw / im.width); h = min(h, 1100)
        im = im.resize((tw, int(im.height * tw / im.width)))
        im = im.crop((0, 0, tw, h))
        ims.append((os.path.basename(f), im))
    rows = math.ceil(len(ims) / cols)
    rh = [max(im.height for _, im in ims[r*cols:(r+1)*cols]) + 24 for r in range(rows)]
    sheet = Image.new('RGB', (cols*(tw+10)+10, sum(rh)+10), '#666')
    y = 5
    for r in range(rows):
        x = 10
        for name, im in ims[r*cols:(r+1)*cols]:
            dr = ImageDraw.Draw(sheet); dr.text((x, y+4), name, fill='white')
            sheet.paste(im, (x, y+20)); x += tw + 10
        y += rh[r]
    out = os.path.join(d, f'sheet-{s//per+1:02d}.jpg'); sheet.save(out, quality=72); print(out)
