import {expect,it} from 'vitest';
import {officialSource} from '@/lib/public-source-url';

// 법제처 국가법령정보센터 개편(2026-11-13): 「/행정해석/{안건번호}」 주소가 404 가 되어
// 고용노동부 해석 원문은 중앙부처 1차 해석 상세(cgmExpcInfoP.do)로 연다.
it('accepts the 중앙부처 1차 해석 detail URL as an official 법제처 source',()=>{
  const url='https://www.law.go.kr/LSW/cgmExpcInfoP.do?cgmExpcDatSeq=18246&ofiClsCd=350101';
  expect(officialSource(url)).toEqual({url,agency:'법제처'});
});

it.each([
  'https://www.law.go.kr/행정해석/근로기준정책과-1852',
  'https://www.law.go.kr/LSW/cgmExpcInfoP.do?cgmExpcDatSeq=18246',
  'https://www.law.go.kr/LSW/cgmExpcInfoP.do?cgmExpcDatSeq=abc&ofiClsCd=350101',
  'https://www.law.go.kr/LSW/cgmExpcInfoP.do?cgmExpcDatSeq=1&cgmExpcDatSeq=2&ofiClsCd=350101',
  'https://www.law.go.kr/LSW/cgmExpcInfoP.do?cgmExpcDatSeq=18246&ofiClsCd=350101&url=https://evil.invalid',
  'http://www.law.go.kr/LSW/cgmExpcInfoP.do?cgmExpcDatSeq=18246&ofiClsCd=350101',
])('rejects broken, partial or ambiguous 해석 URLs %s',url=>{
  expect(officialSource(url)).toBeNull();
});
