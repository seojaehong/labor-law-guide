import { officialSource } from '@/lib/public-source-url';
export default function OfficialSourceLink({ urls }: { urls: unknown[] }) {
  const source=urls.map(officialSource).find(Boolean);
  return source ? <span><a href={source.url} target="_blank" rel="noopener noreferrer" title="저장된 공식 문서 출처입니다. 사건 일치는 별도 확인이 필요합니다." className="text-sm underline" style={{color:'var(--color-accent-ink)'}}>공식 원문 보기 ({source.agency})</a><span className="ml-2 text-xs" style={{color:'var(--grey-700)'}}>자료 일치 확인 필요</span></span> : <span className="text-sm" style={{color:'var(--grey-700)'}}>공식 원문 미확인</span>;
}
