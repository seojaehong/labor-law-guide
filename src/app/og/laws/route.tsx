import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { shareCard } from '@/lib/share-card';
import { fmtDate, type LawIndex } from '@/lib/laws/format';
export const runtime = 'nodejs';
export async function GET(req: Request) {
  const index = JSON.parse(await readFile(path.join(process.cwd(), 'public/data/laws/index.json'), 'utf8')) as LawIndex;
  const event = index.events.find(e => e.id === new URL(req.url).searchParams.get('event'));
  return shareCard(event ? { title: event.headline || event.law, description: event.law + ' · ' + fmtDate(event.date) + ' 시행 · 법령 검수 전 자료', category:'법령 개정' } : { title:'노동관계법령 개정 현황', description:'노동관계법령의 시행일, 개정 내용과 관련 조문을 제공합니다.', category:'법률 개정' });
}
