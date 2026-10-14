export type OfficialSource = { url: string; agency: '법제처' | '고용노동부' };
/** Exact verified document endpoints only. Preserve stored provenance; normalize public links separately. */
export function officialSource(value: unknown): OfficialSource | null {
  if (typeof value !== 'string') return null;
  try {
    const u=new URL(value);
    if (u.protocol!=='https:'||u.username||u.password||u.port) return null;
    if ([...u.searchParams.keys()].some(key=>/(?:redirect|return|next|dest|callback|goto|location|^url$)/i.test(key))) return null;
    const digits=(key:string)=>{const values=u.searchParams.getAll(key);return values.length===1&&/^\d+$/.test(values[0])?values[0]:null;};
    if (['www.law.go.kr','law.go.kr'].includes(u.hostname)) {
      const id=u.pathname==='/LSW/precInfoP.do'?digits('precSeq'):u.pathname==='/DRF/lawService.do'&&u.searchParams.get('target')==='prec'&&u.searchParams.get('type')==='HTML'?digits('ID'):null;
      if(id)return {url:u.href,agency:'법제처'};
      const lawId=['/LSW/lsInfoP.do','/lsInfoP.do'].includes(u.pathname)?digits('lsiSeq'):null;
      if(lawId)return {url:u.href,agency:'법제처'};
    }
    if (u.hostname==='labor.moel.go.kr'&&u.pathname==='/cmmt/iqrs_detail.do') {
      const id=digits('id');if(id)return {url:u.href,agency:'고용노동부'};
    }
    return null;
  } catch { return null; }
}
export function publicSourceUrl(value: unknown): string | null { return officialSource(value)?.url??null; }
