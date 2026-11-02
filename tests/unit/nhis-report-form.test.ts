import { describe, expect, it } from 'vitest';
import { bannedHits } from '@/lib/tool-kit/banned';
import { allCopy, PRIVACY } from '@/app/tools/nhis-report-form/copy';
import { TOOLS } from '@/content/tools-registry';

describe('신고서 작성 화면 문장', () => {
  const t = allCopy().join(' ');
  it('직무 표방·단정 금지어가 없다', () => {
    expect(bannedHits(t)).toEqual([]);
  });
  // NOW.md — 사이트에 「대신·대행·대리」 금지(작성 도구이지 위임 제출이 아니다, 261102 결정)
  it('위임·제출 대행을 뜻하는 말이 없다', () => {
    expect(bannedHits(t, ['대신', '대행', '대리', '지도'])).toEqual([]);
  });
  it('주민등록번호는 서버로 보내지 않는다고 적는다', () => {
    expect(PRIVACY).toContain('서버로 보내지 않습니다');
  });
  it('도구 목록에 있다', () => {
    expect(TOOLS.some(x => x.href === '/tools/nhis-report-form')).toBe(true);
  });
});
