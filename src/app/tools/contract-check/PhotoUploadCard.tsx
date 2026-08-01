'use client';

// 계약서 사진 업로드 카드 (US-306) — 드래그앤드롭 + 파일 선택 → /api/tools/contract-check/extract.
// 사진은 분석 목적으로만 서버를 거치고 저장하지 않는다. 실패·501·429는 한국어 안내 후 수동 입력으로 유도한다.

import { useRef, useState } from 'react';
import { Camera, Loader2, Upload } from 'lucide-react';
import TurnstileWidget from '@/components/TurnstileWidget';

const MAX_FILES = 4;
// Vercel 서버리스는 요청 본문 ~4.5MB를 핸들러 진입 **전에** 잘라낸다(우리 413이 아니라 비 JSON 응답이 온다).
// 그래서 업로드 전에 클라이언트에서 줄여 합계를 이 아래로 맞춘다.
const MAX_TOTAL_BYTES = 3.5 * 1024 * 1024;
const COMPRESS_STEPS = [
  { maxDim: 1800, quality: 0.75 },
  { maxDim: 1300, quality: 0.6 },
  { maxDim: 1000, quality: 0.5 },
];

const GENERIC_ERROR =
  '사진 인식에 실패했습니다. 잠시 후 다시 시도하시거나 아래 폼에 직접 입력해 주세요.';

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image_load_failed'));
    };
    img.src = url;
  });
}

/** canvas로 축소·재인코딩. 실패하면 원본 파일을 그대로 돌려준다(업로드 자체를 막지 않는다). */
async function shrink(file: File, maxDim: number, quality: number): Promise<File> {
  try {
    const img = await loadImage(file);
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', quality),
    );
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], 'contract.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

/** 합계가 상한 아래로 내려갈 때까지 단계적으로 줄인다. */
async function prepare(files: File[]): Promise<File[] | null> {
  let current = files;
  const total = (list: File[]) => list.reduce((sum, f) => sum + f.size, 0);
  for (const step of COMPRESS_STEPS) {
    if (total(current) <= MAX_TOTAL_BYTES) return current;
    current = await Promise.all(files.map((f) => shrink(f, step.maxDim, step.quality)));
  }
  return total(current) <= MAX_TOTAL_BYTES ? current : null;
}

export interface UploadCardProps {
  /** 추출 성공 시 응답 본문({contract, notes})을 넘긴다. */
  onExtracted: (payload: unknown) => void;
}

export default function PhotoUploadCard({ onExtracted }: UploadCardProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (list: FileList | null) => {
    const files = Array.from(list ?? []).filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) {
      setError('이미지 파일(JPG·PNG)을 올려 주세요.');
      return;
    }
    if (files.length > MAX_FILES) {
      setError(`사진은 최대 ${MAX_FILES}장까지 올릴 수 있습니다.`);
      return;
    }

    setError(null);
    setBusy(true);
    try {
      const prepared = await prepare(files);
      if (!prepared) {
        setError('사진 용량이 너무 큽니다. 장수를 줄이거나 더 작게 촬영한 사진으로 다시 시도해 주세요.');
        return;
      }

      const body = new FormData();
      prepared.forEach((f) => body.append('images', f));
      // 봇 차단 토큰. 위젯이 아직 토큰을 못 받았으면 비워 보내고 서버 판정(403)에 맡긴다.
      if (turnstileToken) body.append('turnstileToken', turnstileToken);
      const resp = await fetch('/api/tools/contract-check/extract', { method: 'POST', body });

      // 플랫폼이 본문 상한으로 잘라내면 JSON이 아닌 응답이 온다 — 반드시 catch 한다.
      let data: { message?: string; contract?: unknown } | null = null;
      try {
        data = (await resp.json()) as { message?: string; contract?: unknown };
      } catch {
        data = null;
      }

      if (!resp.ok) {
        setError(
          data?.message ??
            (resp.status === 413
              ? '사진 용량이 너무 큽니다. 장수를 줄이거나 더 작게 촬영한 사진으로 다시 시도해 주세요.'
              : GENERIC_ERROR),
        );
        return;
      }
      if (!data?.contract) {
        setError(GENERIC_ERROR);
        return;
      }
      onExtracted(data);
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="mb-5">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handleFiles(e.dataTransfer.files);
        }}
        className={`rounded-xl border-2 border-dashed p-5 text-center transition-colors ${
          dragging ? 'border-yellow-400 bg-yellow-50' : ''
        }`}
        style={dragging ? undefined : { borderColor: 'var(--color-border)' }}
      >
        <Camera className="mx-auto mb-2 h-6 w-6" style={{ color: 'var(--color-text-tertiary)' }} />
        <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          계약서 사진으로 자동 입력
        </p>
        <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
          사진을 여기에 끌어다 놓거나 아래 버튼으로 고르세요 (최대 {MAX_FILES}장). 사진은 인식에만
          쓰이고 저장하지 않습니다.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          aria-label="계약서 사진 선택"
          className="hidden"
          onChange={(e) => void handleFiles(e.target.files)}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {busy ? '사진을 읽는 중…' : '사진 선택'}
        </button>
        {/* 사이트 키가 없으면 위젯이 아무것도 렌더하지 않는다(로컬·베타에서 그대로 통과). */}
        <div className="mt-3 flex justify-center">
          <TurnstileWidget onToken={setTurnstileToken} />
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-lg px-3 py-2 text-xs leading-relaxed"
          style={{ backgroundColor: '#fef3c7', color: '#92400e' }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
