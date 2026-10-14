export type OfficialSource = { url: string; agency: '법제처' | '고용노동부' };
/** Exact verified document endpoints only. Preserve stored provenance; normalize public links separately. */
export function officialSource(value: unknown): OfficialSource | null {
  if (typeof value !== 'string') return null;
  try {
    const u=new URL(value);
    if (u.username||u.password||u.port) return null;
    if ([...u.searchParams.keys()].some(key=>/(?:redirect|return|next|dest|callback|goto|location|^url$)/i.test(key))) return null;
    const digits=(key:string)=>{const values=u.searchParams.getAll(key);return values.length===1&&/^\d+$/.test(values[0])?values[0]:null;};
    // Legacy official DRF records contain HTTP API URLs. Preserve the source ID,
    // publish the equivalent HTTPS document URL, and never reuse account/query data.
    const lawHost=['www.law.go.kr','law.go.kr'].includes(u.hostname);
    if(lawHost && ['http:','https:'].includes(u.protocol) && u.pathname==='/DRF/lawService.do') {
      const id=digits('ID');
      if(id && u.searchParams.getAll('target').length===1 && u.searchParams.get('target')==='prec' && u.searchParams.getAll('type').length===1 && u.searchParams.get('type')==='HTML') {
        const params=new URLSearchParams({mode:'0',precSeq:id});
        return {url:`https://www.law.go.kr/LSW/precInfoP.do?${params}`,agency:'법제처'};
      }
      return null;
    }
    if(u.protocol!=='https:')return null;
    if (['www.law.go.kr','law.go.kr'].includes(u.hostname)) {
      const id=u.pathname==='/LSW/precInfoP.do'?digits('precSeq'):null;
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
