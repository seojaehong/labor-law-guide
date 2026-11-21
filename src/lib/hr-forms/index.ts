/**
 * 모성보호·일가정 양립 서식 엔진 — 칸 검사 → 원고(md) → 한글(hwpx). 사이트(브라우저)와 k-labor MCP 가 같이 부른다.
 * 파일 시스템·네트워크를 쓰지 않는다(브라우저에서 그대로 돈다).
 */
import { parseYmd } from './dates';
import { HR_FORMS, type FormField, type HrForm, type Values } from './catalog';

export { HR_FORMS };
export type { FormField, HrForm, Values };

// 주민등록번호 모양(앞 6자리 + 성별 자리로 시작하는 뒤 7자리) — 이 서식은 생년월일만 받는다
const RRN = /\d{6}\s*[-–]?\s*[1-8]\d{6}/;

export class FormError extends Error {
  constructor(public problems: string[]) {
    super(problems.join(' / '));
  }
}

export function findForm(id: string): HrForm | undefined {
  return HR_FORMS.find((f) => f.id === id);
}

/** 서식 목록(칸 정의 포함) — 화면·도구 설명용 */
export function catalog() {
  return HR_FORMS.map((f) => ({
    id: f.id,
    title: f.title,
    writer: f.writer,
    summary: f.summary,
    basis: f.basis,
    fields: f.fields.map((x) => ({
      key: x.key,
      label: x.label,
      type: x.type,
      required: x.required === true ? true : typeof x.required === 'function' ? 'conditional' : false,
      ...(x.options ? { options: x.options } : {}),
      ...(x.help ? { help: x.help } : {}),
      ...(x.max ? { max: x.max } : {}),
    })),
  }));
}

function isRequired(f: FormField, v: Values) {
  return typeof f.required === 'function' ? f.required(v) : !!f.required;
}

/** 칸 검사 + 서식별 검사. problems 가 있으면 파일을 만들지 않는다. notes 는 조문 안내(막지 않음) */
export function review(form: HrForm, values: Values) {
  const problems: string[] = [];
  const v: Values = {};
  const known = new Set(form.fields.map((f) => f.key));
  const unknown = Object.keys(values).filter((k) => !known.has(k));
  for (const f of form.fields) {
    const raw = values[f.key];
    const s = typeof raw === 'string' ? raw.trim() : raw == null ? '' : String(raw).trim();
    v[f.key] = s;
    if (!s) {
      if (isRequired(f, { ...values })) problems.push(`「${f.label}」을(를) 적어 주세요.`);
      continue;
    }
    if (RRN.test(s)) problems.push(`「${f.label}」에 주민등록번호 모양의 숫자가 있습니다. 이 서식은 주민등록번호를 받지 않습니다.`);
    if (f.max && s.length > f.max) problems.push(`「${f.label}」은(는) ${f.max}자 이내로 적어 주세요.`);
    if (f.type === 'date' && !parseYmd(s)) problems.push(`「${f.label}」은(는) YYYY-MM-DD 로 적어 주세요.`);
    if (f.type === 'choice' && !f.options?.some((o) => o.value === s)) problems.push(`「${f.label}」은(는) ${f.options?.map((o) => o.value).join(' · ')} 중 하나입니다.`);
  }
  if (problems.length) return { problems, notes: [] as string[], md: '', unknown };
  const c = form.compose(v);
  return { problems: c.problems, notes: c.notes, md: c.md, unknown };
}

export interface BuiltForm { id: string; title: string; md: string; hwpx: Uint8Array; notes: string[]; unknown: string[] }

/** 한글(hwpx) 한 건. 검사에 걸리면 FormError */
export async function buildForm(id: string, values: Values): Promise<BuiltForm> {
  const form = findForm(id);
  if (!form) throw new FormError([`없는 서식입니다: ${id} (있는 서식: ${HR_FORMS.map((f) => f.id).join(', ')})`]);
  const r = review(form, values);
  if (r.problems.length) throw new FormError(r.problems);
  // 한글 엔진은 파일을 만들 때만 불러온다 — 화면의 칸 검사는 가볍게 돈다
  if (form.statutory) {
    // 법정 서식: 원본 hwpx 칸에 그대로 채운다(글자 모양·칸·쪽 원본 유지)
    const [{ fillCells, replaceText }, { F7_2_HWPX_BASE64 }] = await Promise.all([import('@/lib/md-hwpx/postedit'), import('./templates/f7-2')]);
    const bin = atob(F7_2_HWPX_BASE64);
    const src = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) src[i] = bin.charCodeAt(i);
    const { cells, edits } = form.statutory.fill(values);
    const filled = await fillCells(src, cells);
    const hwpx = edits.length ? (await replaceText(filled, edits)).bytes : filled;
    return { id: form.id, title: form.title, md: r.md, hwpx, notes: r.notes, unknown: r.unknown };
  }
  const { mdToHwpx } = await import('@/lib/md-hwpx');
  const hwpx = await mdToHwpx(r.md, { preset: 'internal' });
  return { id: form.id, title: form.title, md: r.md, hwpx, notes: r.notes, unknown: r.unknown };
}
