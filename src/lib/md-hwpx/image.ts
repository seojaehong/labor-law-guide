/**
 * S10 — 그림(편집기술사양 C7). `![캡션](경로)` 한 줄 → BinData/ + content.hpf opf:item(isEmbeded=1) + hp:pic.
 * hp:pic 꼴은 괴롭힘보고서 render_report_images.py(제출본 실측)와 같다. 96dpi 1px = 75 HWPUNIT.
 * 브라우저 API 를 쓰지 않는다 — 그림 크기는 파일 머리(PNG IHDR·JPEG SOF·GIF)에서 읽는다.
 */

export type PicData = { data: Uint8Array; ext: 'png' | 'jpg' | 'gif' | 'bmp' };
export type BinItem = { id: string; href: string; media: string; data: Uint8Array };

const MEDIA: Record<PicData['ext'], string> = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp' };
const PX = 75;

/** 그림 크기(px). 모르는 형식이면 오류 — 글자로 인쇄되는 사고(260916)보다 멈추는 편이 낫다 */
/** 그림 크기 — 머리만 맞고 크기가 이상한 파일(짧은 PNG·글 파일 등)은 거부한다 */
export function imageSize(b: Uint8Array): { w: number; h: number; ext: PicData['ext'] } {
  const r = sniff(b);
  if (!(r.w > 0 && r.h > 0 && r.w <= 30000 && r.h <= 30000)) throw new Error('그림 크기를 읽지 못했습니다(PNG·JPEG·GIF·BMP 만 받습니다)');
  return r;
}

/** 캡션이 없을 때 그림 설명 — 파일 이름만(PC 경로·폴더 이름을 문서에 넣지 않는다) */
export const imageName = (src: string) => src.split(/[\\/]/).pop() || '그림';

function sniff(b: Uint8Array): { w: number; h: number; ext: PicData['ext'] } {
  const u16be = (i: number) => (b[i] << 8) | b[i + 1];
  const u32be = (i: number) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { w: u32be(16), h: u32be(20), ext: 'png' };
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return { w: b[6] | (b[7] << 8), h: b[8] | (b[9] << 8), ext: 'gif' };
  if (b[0] === 0x42 && b[1] === 0x4d) {
    const le = (i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24);
    return { w: le(18), h: Math.abs(le(22)), ext: 'bmp' };
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i++;
        continue;
      }
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: u16be(i + 7), h: u16be(i + 5), ext: 'jpg' };
      i += 2 + u16be(i + 2);
    }
  }
  throw new Error('그림 크기를 읽지 못했습니다(PNG·JPEG·GIF·BMP 만 받습니다)');
}

const escAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** hp:pic 한 개. 본문 폭·높이 상한 안으로 비율을 지켜 줄인다 */
export function picXml(n: number, binId: string, px: { w: number; h: number }, maxW: number, maxH: number, caption: string): string {
  const ow = px.w * PX;
  const oh = px.h * PX;
  const scale = Math.min(maxW / ow, maxH / oh, 1);
  const cw = Math.floor(ow * scale);
  const ch = Math.floor(oh * scale);
  return (
    `<hp:pic id="${2000000000 + n}" zOrder="${100 + n}" numberingType="PICTURE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="${900000000 + n}" reverse="0">` +
    `<hp:offset x="0" y="0"/><hp:orgSz width="${ow}" height="${oh}"/><hp:curSz width="${cw}" height="${ch}"/>` +
    '<hp:flip horizontal="0" vertical="0"/><hp:rotationInfo angle="0" centerX="0" centerY="0" rotateimage="0"/>' +
    '<hp:renderingInfo><hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/></hp:renderingInfo>' +
    `<hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="${ow}" y="0"/><hc:pt2 x="${ow}" y="${oh}"/><hc:pt3 x="0" y="${oh}"/></hp:imgRect>` +
    `<hp:imgClip left="0" right="${ow}" top="0" bottom="${oh}"/>` +
    '<hp:inMargin left="0" right="0" top="0" bottom="0"/><hp:imgDim dimwidth="0" dimheight="0"/>' +
    `<hc:img binaryItemIDRef="${binId}" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/><hp:effects></hp:effects>` +
    `<hp:sz width="${cw}" widthRelTo="ABSOLUTE" height="${ch}" heightRelTo="ABSOLUTE" protect="0"/>` +
    '<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>' +
    `<hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:shapeComment>${escAttr(caption)}</hp:shapeComment></hp:pic>`
  );
}

export function binItem(n: number, pic: PicData): BinItem {
  const id = `image${n}`;
  return { id, href: `BinData/${id}.${pic.ext}`, media: MEDIA[pic.ext], data: pic.data };
}
