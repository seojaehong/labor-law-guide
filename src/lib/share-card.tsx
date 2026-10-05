/* eslint-disable @next/next/no-img-element -- ImageResponse requires a native SVG image node. */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import { BRAND_NAME } from '@/lib/constants';
import { shortShareText } from './share-text';
export const SHARE_SIZE = { width: 1200, height: 630 };
let assets: Promise<{ regular: ArrayBuffer; bold: ArrayBuffer; logo: string }> | undefined;
let originalLogo: Promise<string> | undefined;
function loadAssets() {
  return assets ??= Promise.all([
    readFile(path.join(process.cwd(), 'public/fonts/Pretendard-Regular.woff')),
    readFile(path.join(process.cwd(), 'public/fonts/Pretendard-Bold.woff')),
    readFile(path.join(process.cwd(), 'public/brand/work-patterns-wordmark-ink.svg')),
  ]).then(([regular, bold, logo]) => ({
    regular: regular.buffer.slice(regular.byteOffset, regular.byteOffset + regular.byteLength) as ArrayBuffer,
    bold: bold.buffer.slice(bold.byteOffset, bold.byteOffset + bold.byteLength) as ArrayBuffer,
    logo: 'data:image/svg+xml;base64,' + logo.toString('base64'),
  }));
}
export async function shareCard({ title, description, category = '노동법 자료·실무 정보', wordmark = 'original' }: { title: string; description?: string; category?: string; wordmark?: 'original' | 'proposal' }) {
  const a = await loadAssets();
  const logo = wordmark === 'original' ? await (originalLogo ??= readFile(path.join(process.cwd(), 'public/brand/work-patterns-wordmark-original.svg')).then(value => 'data:image/svg+xml;base64,' + value.toString('base64'))) : a.logo;
  const text = shortShareText(title, 180) || BRAND_NAME;
  const general = text === BRAND_NAME;
  const fontSize = text.length > 145 ? 30 : text.length > 100 ? 38 : text.length > 70 ? 46 : text.length > 45 ? 54 : 64;
  return new ImageResponse(
    <div style={{ width:'100%', height:'100%', display:'flex', flexDirection:'column', padding:'42px 64px 36px', background:'#faf8f2', color:'#20231f', fontFamily:'Share KR', position:'relative' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'2px solid #d8d5cb', paddingBottom:22 }}>
        {!general && <img src={logo} width={wordmark === 'original' ? 257 : 226} height={64} alt={BRAND_NAME} />}
        {general && <span style={{ fontSize:25, color:'#485149' }}>yellowenvelope.kr</span>}
        {!general && <div style={{ fontSize:25, color:'#285e77', fontWeight:700 }}>{category}</div>}
      </div>
      <div style={{ display:'flex', flexDirection:'column', flex:1, justifyContent:'center', padding:'22px 0' }}>
        <div style={{ display:'flex', fontSize, fontWeight:700, lineHeight:1.22, letterSpacing:'-0.02em', wordBreak:'keep-all' }}>{general ? <img src={logo} width={wordmark === 'original' ? 700 : 660} height={wordmark === 'original' ? 174 : 187} alt={BRAND_NAME} /> : text}</div>
        {description && <div style={{ display:'flex', fontSize:28, color:'#485149', lineHeight:1.4, marginTop:22, wordBreak:'keep-all' }}>{shortShareText(description)}</div>}
      </div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', borderTop:'3px solid #285e77', paddingTop:18, fontSize:24, color:'#485149' }}>
        {!general && <span>노동법 자료와 실무 정보</span>}{!general && <span>yellowenvelope.kr</span>}
      </div>
    </div>,
    { ...SHARE_SIZE, fonts: [{ name:'Share KR', data:a.regular, weight:400, style:'normal' }, { name:'Share KR', data:a.bold, weight:700, style:'normal' }] },
  );
}
