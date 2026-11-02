// 견본 PDF 를 만든다(합성 값). OUT=<폴더> 일 때만 돈다: OUT=... npx.cmd vitest run tests/unit/nhis-forms-sample.test.ts
// STAMP=<png> 를 주면 도장을 찍는다(화면처럼 줄이지 않고 그대로 — 큰 그림이면 withinLimit 가 false 로 나온다)
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { it } from 'vitest';
import { buildPacket } from '@/lib/nhis-forms/build';

it.skipIf(!process.env.OUT)('견본', async () => {
  const out = process.env.OUT!;
  const r = (p: string) => new Uint8Array(readFileSync(path.resolve(process.cwd(), p)));
  const font = r('public/fonts/llg-forms/LLGFormsSans-Regular.ttf');
  const biz = { mgmtNo: '12345678900', name: '가상상사', tel: '043-000-0000', fax: '043-000-0001', addr: '충청북도 청주시 상당구 상당로81번길 63 (서문동)', zip: '28000', ownerName: '홍대표' };
  const now = new Date('2026-11-02T12:00:00Z');
  const stamp = process.env.STAMP ? r(process.env.STAMP) : undefined;
  const loss = await buildPacket({ formPdf: r('public/forms/nhis/NHIS_8_LOSS.pdf'), font }, {
    kind: 'loss', biz, now, stamp, branchName: '청주동부지사', reason: '퇴사 처리 과정에서 신고를 빠뜨렸습니다.',
    people: [
      { name: '김가상', rrn: '900101-1000000', lastWorkDay: '2026-05-31', nhisCode: '01', payCur: 12000000, monthsCur: 6, payPrev: 30000000, monthsPrev: 12 },
      { name: '박가상', rrn: '880202-2000000', lastWorkDay: '2026-04-15', nhisCode: '01', payCur: 8000000, monthsCur: 4 },
      { name: '최가상', rrn: '770303-1000000', lastWorkDay: '2026-03-10', nhisCode: '01', payCur: 6000000, monthsCur: 3 },
      { name: '정가상', rrn: '660404-2000000', lastWorkDay: '2026-02-28', nhisCode: '01', payCur: 4000000, monthsCur: 2 },
    ],
  });
  const acq = await buildPacket({ formPdf: r('public/forms/nhis/NHIS_6_ACQ.pdf'), font }, {
    kind: 'acq', biz, now, stamp, branchName: '청주동부지사', reason: '입사 후 신고 기한을 놓쳤습니다.',
    people: [
      { name: '이가상', rrn: '950505-2000000', acqDate: '2026-03-02', monthlyPay: 2500000, nhisCode: '00', ceo: false },
      { name: '윤가상', rrn: '960606-1000000', acqDate: '2026-04-01', monthlyPay: 3100000, nhisCode: '00', ceo: true },
      { name: '한가상', rrn: '970707-2000000', acqDate: '2026-05-11', monthlyPay: 2200000, nhisCode: '00', ceo: false },
      { name: '오가상', rrn: '980808-1000000', acqDate: '2026-06-01', monthlyPay: 2900000, nhisCode: '00', ceo: false },
    ],
  });
  writeFileSync(path.join(out, 'loss.pdf'), loss.bytes);
  writeFileSync(path.join(out, 'acq.pdf'), acq.bytes);
  console.log('SIZE loss', loss.bytes.length, loss.withinLimit, 'acq', acq.bytes.length, acq.withinLimit, 'shrunk', loss.report.shrunk, acq.report.shrunk);
});
