import { describe, expect, it } from 'vitest';
import {
  fetchWorkplaces,
  normalizeBizNo,
  parseWorkplaceXml,
  tierFor,
} from '@/lib/workplace-lookup';
import { allCopy, FORBIDDEN } from '@/components/biz-no-lookup-copy';

// 2026-10-28 실측 응답(삼성전자 1248100998)에서 두 줄만 남긴 것
const XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><response><header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header><body><items><item><addr>경기 수원시 영통구 삼성로 129 (매탄동)</addr><opaBoheomFg>1</opaBoheomFg><post>16677</post><saeopFg>3</saeopFg><saeopjaDrno>1248100998</saeopjaDrno><saeopjangNm>삼성전자(주)서울R&amp;D캠퍼스</saeopjangNm><sangsiInwonCnt>4806</sangsiInwonCnt><seongripDt>20151121</seongripDt><sjEopjongCd>90703</sjEopjongCd><sjEopjongNm>연구 및 개발사업</sjEopjongNm></item><item><addr>인천 서구 봉수대로 19</addr><gyEopjongCd>29199</gyEopjongCd><gyEopjongNm>그 외 기타 일반목적용 기계 제조업</gyEopjongNm><opaBoheomFg>2</opaBoheomFg><saeopjaDrno>1248100998</saeopjaDrno><saeopjangNm>(주)흥영하이테크</saeopjangNm><sangsiInwonCnt>9</sangsiInwonCnt><seongripDt>20110831</seongripDt></item></items><numOfRows>50</numOfRows><pageNo>1</pageNo><totalCount>2</totalCount></body></response>`;

const okFetch = (body: string) => async () => new Response(body, { status: 200 });

describe('normalizeBizNo', () => {
  it('하이픈·공백을 지우고 체크섬이 맞는 10자리만 받는다', () => {
    expect(normalizeBizNo('124-81-00998')).toBe('1248100998');
    expect(normalizeBizNo(' 124 81 00998 ')).toBe('1248100998');
    expect(normalizeBizNo('1248100997')).toBeNull(); // 끝자리 틀림
    expect(normalizeBizNo('12481009')).toBeNull();
    expect(normalizeBizNo('abc')).toBeNull();
  });
});

describe('parseWorkplaceXml', () => {
  it('사업장마다 이름·주소·상시인원·성립일·업종을 꺼낸다', () => {
    const r = parseWorkplaceXml(XML);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({
      bizNo: '1248100998',
      name: '삼성전자(주)서울R&D캠퍼스',
      address: '경기 수원시 영통구 삼성로 129 (매탄동)',
      headcount: 4806,
      since: '2015-11-21',
      industry: '연구 및 개발사업',
    });
    expect(r.rows[1].industry).toBe('그 외 기타 일반목적용 기계 제조업');
  });

  it('공단 오류 코드는 실패로 돌려준다', () => {
    const r = parseWorkplaceXml('<response><header><resultCode>30</resultCode><resultMsg>SERVICE KEY IS NOT REGISTERED ERROR.</resultMsg></header></response>');
    expect(r).toEqual({ ok: false, reason: 'upstream' });
  });
});

describe('fetchWorkplaces', () => {
  it('조회 칸은 v_saeopjaDrno 다', async () => {
    let seen = '';
    await fetchWorkplaces('1248100998', 'KEY+/=', async (url) => {
      seen = String(url);
      return new Response(XML);
    });
    expect(seen).toContain('v_saeopjaDrno=1248100998');
    expect(seen).toContain('serviceKey=KEY%2B%2F%3D');
  });

  it('다른 사업자번호가 섞여 오면(칸 이름이 틀려 전체 목록이 온 경우) 실패로 본다', async () => {
    const r = await fetchWorkplaces('1378612909', 'K', okFetch(XML));
    expect(r).toEqual({ ok: false, reason: 'mismatch' });
  });

  it('같은 사업장의 고용·산재 두 줄은 한 사업장으로 합치고 업종은 고용 쪽을 쓴다', async () => {
    // 2026-10-28 실측 1378612909 — opaBoheomFg 2 = 고용(gyEopjong), 1 = 산재(sjEopjong)
    const two = `<response><header><resultCode>00</resultCode></header><body><items>`
      + `<item><addr>인천 서구 봉수대로 19</addr><gyEopjongNm>그 외 기타 일반목적용 기계 제조업</gyEopjongNm><opaBoheomFg>2</opaBoheomFg><saeopjaDrno>1378612909</saeopjaDrno><saeopjangNm>(주)흥영하이테크</saeopjangNm><sangsiInwonCnt>9</sangsiInwonCnt><seongripDt>20110831</seongripDt></item>`
      + `<item><addr>인천 서구 봉수대로 19</addr><opaBoheomFg>1</opaBoheomFg><saeopjaDrno>1378612909</saeopjaDrno><saeopjangNm>(주)흥영하이테크</saeopjangNm><sangsiInwonCnt>9</sangsiInwonCnt><seongripDt>20110831</seongripDt><sjEopjongNm>일반산업용 기계장치제조업   </sjEopjongNm></item>`
      + `</items></body></response>`;
    const r = await fetchWorkplaces('1378612909', 'K', okFetch(two));
    expect(r.ok && r.rows).toEqual([{
      bizNo: '1378612909', name: '(주)흥영하이테크', address: '인천 서구 봉수대로 19',
      headcount: 9, since: '2011-08-31', industry: '그 외 기타 일반목적용 기계 제조업',
    }]);
  });

  it('결과가 없으면 none', async () => {
    const empty = XML.replace(/<items>[\s\S]*<\/items>/, '<items></items>').replace('<totalCount>2', '<totalCount>0');
    expect(await fetchWorkplaces('1248100998', 'K', okFetch(empty))).toEqual({ ok: false, reason: 'none' });
  });

  it('키가 없으면 부르지 않는다', async () => {
    let called = false;
    const r = await fetchWorkplaces('1248100998', '', async () => { called = true; return new Response(XML); });
    expect(r).toEqual({ ok: false, reason: 'no-key' });
    expect(called).toBe(false);
  });

  it('네트워크·HTTP 오류는 upstream', async () => {
    expect(await fetchWorkplaces('1248100998', 'K', async () => new Response('', { status: 500 }))).toEqual({ ok: false, reason: 'upstream' });
    expect(await fetchWorkplaces('1248100998', 'K', async () => { throw new Error('x'); })).toEqual({ ok: false, reason: 'upstream' });
  });
});

describe('tierFor', () => {
  it('인원을 /duties 규모 구간으로 바꾼다 — 경계는 이상(≥)', () => {
    expect([0, 1, 4, 5, 9, 10, 29, 30, 49, 50, 120563].map(tierFor))
      .toEqual([1, 1, 1, 5, 5, 10, 10, 30, 30, 50, 50]);
    expect(tierFor(-3)).toBe(1);
    expect(tierFor(4.9)).toBe(1);
  });
});

describe('copy', () => {
  it('금지어가 없다', () => {
    const text = allCopy();
    for (const w of FORBIDDEN) expect(text).not.toContain(w);
  });
});
