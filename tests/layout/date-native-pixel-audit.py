from pathlib import Path
from PIL import Image
from collections import Counter
import json
p=Path('docs/design-visuals/period-integration')
def lum(c):
 v=[x/255 for x in c];v=[x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4 for x in v];return sum(x*y for x,y in zip(v,[.2126,.7152,.0722]))
def ratio(a,b):return (max(lum(a),lum(b))+.05)/(min(lum(a),lum(b))+.05)
out={}
for name in ['date-native-dark-before','date-native-dark','date-native-light']:
 im=Image.open(p/(name+'.png')).convert('RGB');roi=[im.getpixel((x,y)) for y in range(8,min(26,im.height-4)) for x in range(im.width-26,im.width-8)];bg=Counter(roi).most_common(1)[0][0];ratios=[ratio(c,bg) for c in roi];out[name]={'image_size':im.size,'roi':'calendar interior: right26..8px, y8..26px; DPR1','background':bg,'maximum_icon_contrast':max(ratios),'pixels_at_least_3_to_1':sum(r>=3 for r in ratios)}
assert out['date-native-dark']['pixels_at_least_3_to_1']>=10
(p/'date-native-pixel-audit.json').write_text(json.dumps({'scope':'Chromium1234 native date icon only; before uses original normal color-scheme in the same dark surface; not Safari validation','results':out},indent=2));print(json.dumps(out))
