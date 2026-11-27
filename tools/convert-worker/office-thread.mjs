// office op 1건을 작업 스레드에서 돌린다 — 시간 상한을 넘으면 부모가 스레드를 끝낸다(Worker.terminate).
// 입력: workerData = { modulePath, op, input(Uint8Array|null), args, limits }. 출력: 라이브러리 Result 그대로.
import { parentPort, workerData } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';

const { modulePath, op, input, args = {}, limits } = workerData;

async function run() {
  const office = await import(pathToFileURL(modulePath).href);
  const ctx = { limits };
  switch (op) {
    case 'xlsx.inspect':
      return office.inspectXlsx(input, ctx);
    case 'xlsx.extract':
      return office.extractXlsxRows(input, { ...ctx, sheet: args.sheet, headerRow: args.headerRow, maxRows: args.maxRows });
    case 'xlsx.fill':
      return office.fillXlsxTemplate(input, { ...ctx, cells: args.cells, rows: args.rows, hiddenColumns: args.hiddenColumns, strict: args.strict === true });
    case 'xlsx.make':
      return office.makeXlsxFromSpec(args.spec, ctx);
    case 'pptx.meeting':
      return office.makeMeetingPptx(args.snapshot, { ...ctx, kind: args.kind, fontFace: args.fontFace, layout: args.layout });
    case 'pptx.extract':
      return office.extractPptx(input, ctx);
    case 'pptx.broadcast':
      return office.makeBroadcastPptx(args.snapshot, { ...ctx, signatureRows: args.signatureRows, fontFace: args.fontFace, layout: args.layout });
    case 'pptx.tbm':
      return office.makeTbmPptx(args.snapshot, { ...ctx, maxHazards: args.maxHazards, signatureRows: args.signatureRows, fontFace: args.fontFace, layout: args.layout });
    default:
      return { ok: false, code: 'BAD_REQUEST', message: `unknown op ${op}`, warnings: [] };
  }
}

try {
  parentPort.postMessage(await run());
} catch (e) {
  parentPort.postMessage({ ok: false, code: 'INTERNAL', message: e?.message ?? 'office op failed', warnings: [] });
}
