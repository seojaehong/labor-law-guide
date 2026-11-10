// 노사협의회 기록 폴더 — 회의록 .json(make_council_meeting_docs·import_council_minutes)과 덧붙이기 기록 두 개를 읽는다.
//   _이행기록.jsonl   이행 기록(고치지 않고 덧붙인다)
//   _회의록이력.jsonl 회의록 판·서명·공지·가져옴 확인(판마다 경로 + SHA-256)
// ★ 파일만 다룬다(네트워크 없음). 무거운 모듈(pdf.js·rhwp·exceljs)을 불러오지 않는다 — nosa.mjs(원격판 번들)도 이 파일을 쓴다.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DOC_LOG, IMPL_LOG, minutesShapeErrors } from '@/lib/nosa-council/records';

export function sha256File(p) {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  } catch {
    return null;
  }
}

function readJsonl(file, skipped) {
  if (!fs.existsSync(file)) return [];
  const out = [];
  fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach((line, k) => {
    if (!line.trim()) return;
    try {
      out.push(JSON.parse(line));
    } catch {
      skipped.push({ file: path.basename(file), reason: `${k + 1}번째 줄을 읽지 못함` });
    }
  });
  return out;
}

/** 기록 폴더 읽기 — 회의록 .json(같은 회의 키는 처음 것만) · 이행 기록 · 회의록 이력 */
export function loadCouncilDir(dir) {
  const skipped = [];
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new Error(`기록 폴더가 없습니다: ${dir}`);
  const minutes = [];
  const keys = new Map();
  for (const name of fs.readdirSync(dir).filter((n) => n.toLowerCase().endsWith('.json')).sort()) {
    let x;
    try {
      x = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
    } catch {
      skipped.push({ file: name, reason: 'JSON 으로 읽지 못함' });
      continue;
    }
    if (x?.schema !== 'nosa-council-minutes/1') continue;
    const errs = minutesShapeErrors(x);
    if (errs.length) {
      skipped.push({ file: name, reason: errs.join(' ') });
      continue;
    }
    if (keys.has(x.meeting.key)) {
      skipped.push({ file: name, reason: `같은 회의 키(${x.meeting.key})의 회의록이 이미 있음(${keys.get(x.meeting.key)}) — 판은 회의록 이력으로 남긴다` });
      continue;
    }
    keys.set(x.meeting.key, name);
    minutes.push(x);
  }
  const records = readJsonl(path.join(dir, IMPL_LOG), skipped);
  const events = readJsonl(path.join(dir, DOC_LOG), skipped);
  return { minutes, records, events, skipped };
}

/** 덧붙이기 — 앞 줄은 건드리지 않는다. seq = 지금 줄 수 + 1 */
export function appendJsonl(file, rec) {
  const lines = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l.trim()).length : 0;
  const row = { ...rec, seq: lines + 1 };
  fs.appendFileSync(file, `${JSON.stringify(row)}\n`);
  return row;
}
