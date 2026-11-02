import { describe, expect, it } from 'vitest';
import { findBranches, parseAddress, rowsFor, loadAgencies } from '@/lib/branch-directory';
import { allCopy, noticeLines } from '@/app/tools/branch-directory/copy';
import { bannedHits } from '@/lib/tool-kit/banned';

describe('화면 문장', () => {
  it('금지어가 없다', () => {
    expect(bannedHits(allCopy().join(' '))).toEqual([]);
  });
  it('안내문에 관리지사 우선과 공단별 수집일이 있다', () => {
    const t = noticeLines({ comwel: '2026-11-02', nhis: '2026-11-03', nps: '2026-11-04' }).join(' ');
    expect(t).toContain('관리지사를 먼저 확인');
    for (const d of ['2026-11-02', '2026-11-03', '2026-11-04']) expect(t).toContain(d);
  });
  it('지사 자료에 직원 성명 표시(홍**)가 없다', () => {
    for (const k of ['nhis', 'nps', 'comwel'] as const)
      for (const b of A[k].branches) for (const r of b.rows) expect(r.join(' ')).not.toMatch(/[가-힣]\*\*(?!\*)/);
  });
});

const A = loadAgencies();
const pick = (agency: 'nhis' | 'nps' | 'comwel', addr: string) => findBranches(A[agency], parseAddress(addr));

// [주소, 건보, 연금, 근복] — 지사코드. 배열이면 「후보」(여럿)여야 한다
const CASES: [string, string, string, string, string | string[]][] = [
  ['청주 상당구 서문동', '충청북도 청주시 상당구 상당로81번길 63 (서문동)', '0510', '4911', '5539'],
  ['강남 역삼동', '서울특별시 강남구 테헤란로 152 (역삼동, 강남파이낸스센터)', '0134', '1129', '5564'],
  ['여의도동', '서울특별시 영등포구 여의대로 108 (여의도동)', '0138', '1123', '5559'],
  ['당산동', '서울특별시 영등포구 당산로 238 (당산동3가)', '0101', '1123', '5559'],
  ['고령군', '경상북도 고령군 대가야읍 시장길 14', '0224', '2215', '5537'],
  ['칠곡 석적읍', '경상북도 칠곡군 석적읍 중리 400', '0716', '5715', ['5534', '5536']],
  ['광주 광산구(옛 이름)', '광주광역시 광산구 무진대로 246 (우산동)', '0242', '2411', '5517'],
  ['인천 중구 영종(옛 이름)', '인천광역시 중구 공항로 272 (운서동)', '0231', '2314', '5529'],
  ['원주', '강원도 원주시 만대로 15 (무실동)', '0402', '4513', '5553'],
  ['세종', '세종특별자치시 한누리대로 2130 (보람동)', '0557', '2514', '5538'],
  ['서귀포', '제주특별자치도 서귀포시 신서귀로 51', '0802', '6112', '5574'],
  ['수원 지번', '경기도 수원시 팔달구 인계동 1122-1', '0301', '4129', '5527'],
];

describe('주소 → 관할 지사', () => {
  for (const [label, addr, nh, np, cw] of CASES) {
    it(label, () => {
      for (const [k, want] of [['nhis', nh], ['nps', np], ['comwel', cw]] as const) {
        const r = pick(k, addr);
        const codes = r.candidates.map(c => c.code);
        if (Array.isArray(want)) {
          expect(r.status, `${k} ${addr}`).toBe('candidates');
          for (const w of want) expect(codes, `${k} ${addr}`).toContain(w);
        } else {
          expect(r.status, `${k} ${addr} → ${codes}`).toBe('confirmed');
          expect(codes, `${k} ${addr}`).toEqual([want]);
        }
      }
    });
  }

  it('동을 모르면 분할 지사는 후보로 낸다(영등포 남부·북부)', () => {
    const r = pick('nhis', '서울특별시 영등포구 여의공원로 101');
    expect(r.status).toBe('candidates');
    expect(r.candidates.map(c => c.code).sort()).toEqual(['0101', '0138']);
  });

  it('동 이름 목록의 「소사」는 소사구가 아니다(부천)', () => {
    const r = pick('nhis', '경기도 부천시 소사구 경인로 386');
    expect(r.status).toBe('candidates');
    const r2 = pick('nhis', '경기도 부천시 소사구 경인로 386 (송내동)');
    expect(r2.candidates.map(c => c.code)).toEqual(['0331']);
  });

  it('시도 없이 시로 시작하는 주소', () => {
    expect(pick('nps', '김포시 걸포2로 21').candidates.map(c => c.code)).toEqual(['2315']);
  });

  it('주소를 읽지 못하면 못 찾음', () => {
    expect(pick('nhis', '아무 글자').status).toBe('none');
  });
});

describe('지사 안 담당자 강조', () => {
  it('근복 청주 서문동 → 043-229-5128 행이 앞에 온다', () => {
    const p = parseAddress('충청북도 청주시 상당구 상당로81번길 63 (서문동)');
    const b = findBranches(A.comwel, p).candidates[0];
    const rows = rowsFor(b, p);
    expect(rows[0].hit).toBe(true);
    expect(rows.filter(r => r.hit).map(r => r.tel)).toContain('043-229-5128');
    expect(rows.filter(r => r.hit).map(r => r.tel)).not.toContain('043-229-5065');
  });

  // 261102 공식 웹 크로스체크 SOFT — 지사는 맞는데 더 맞는 담당 행이 따로 있었다
  const firstTel = (k: 'nhis' | 'comwel', addr: string, name: string) => {
    const p = parseAddress(addr);
    const c = findBranches(A[k], p).candidates.find(x => x.name.includes(name));
    expect(c, `${k} ${name}`).toBeTruthy();
    return rowsFor(c!, p)[0].tel.replace(/-/g, '');
  };
  it('도로명이 적힌 행이 총괄 행보다 앞(여의대로)', () => {
    expect(firstTel('comwel', '서울특별시 영등포구 여의대로 108 (여의도동)', '서울남부')).toBe('0221653185');
  });
  it('구 전체 행이 총괄 행보다 앞(영종구)', () => {
    expect(['0324519737', '0324519406']).toContain(firstTel('comwel', '인천광역시 중구 공항로 272 (운서동)', '경인'));
  });
  it('사업장명 첫 글자 전용 행은 대표로 내지 않는다(원주)', () => {
    expect(firstTel('comwel', '강원도 원주시 만대로 15 (무실동)', '강원')).toBe('0337492397');
  });
  it('취득·상실 창구가 내용변경 전용 행보다 앞(인계동)', () => {
    expect(firstTel('comwel', '경기도 수원시 팔달구 인계동 1122-1', '수원')).toBe('0312314283');
  });
  it('일반 창구가 일용 전용 행보다 앞(구미 석적읍)', () => {
    expect(firstTel('comwel', '경상북도 칠곡군 석적읍 중리 400', '구미')).toBe('0544799123');
  });
  it('주소가 출장소 지역이면 출장소 행이 앞(고령)', () => {
    expect(firstTel('nhis', '경상북도 고령군 대가야읍 시장길 14', '달성고령')).toBe('0549062103');
  });
});

describe('데이터 칸', () => {
  // 261102 — 연금 담당표 1,120행이 웹팩스를 전화 칸에 담아 왔다. 전화=팩스 행이 많으면 칸이 밀린 것이다
  for (const k of ['nhis', 'nps', 'comwel'] as const) {
    it(`${k} 전화와 팩스가 같은 행이 1% 미만`, () => {
      const rows = A[k].branches.flatMap(b => b.rows).filter(r => r[4] && r[5]);
      const same = rows.filter(r => r[4] === r[5]).length;
      expect(same / Math.max(rows.length, 1)).toBeLessThan(0.01);
    });
  }
  it('연금 담당 행 전화가 그 지사 부서표 팩스번호와 겹치는 비율 5% 미만', () => {
    let duty = 0, clash = 0;
    for (const b of A.nps.branches) {
      const faxes = new Set(b.rows.filter(r => r[7] === '부서').flatMap(r => r[5].split(/\s+/)).filter(Boolean));
      for (const r of b.rows.filter(r => r[7] === '담당' && r[4])) {
        duty++;
        if (r[4].split(/\s+/).some(t => faxes.has(t))) clash++;
      }
    }
    expect(duty).toBeGreaterThan(1000);
    expect(clash / duty).toBeLessThan(0.05);
  });
  it('연금 동청주 가입지원부 총괄 = 전화 043-251-5101 · 웹팩스 043-901-5003(공식 0015M0)', () => {
    const b = A.nps.branches.find(x => x.name === '동청주지사')!;
    const r = b.rows.find(x => x[2] === '가입지원부 업무 총괄')!;
    expect([r[4], r[5]]).toEqual(['043-251-5101', '043-901-5003']);
  });
});

describe('데이터', () => {
  it('공단별 수집일이 있다', () => {
    for (const k of ['nhis', 'nps', 'comwel'] as const) expect(A[k].collectedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('지사 수 = 공식 목록', () => {
    expect(A.nhis.branches.length).toBe(184);
    expect(A.nps.branches.length).toBe(112);
    expect(A.comwel.branches.length).toBe(68);
  });
});
