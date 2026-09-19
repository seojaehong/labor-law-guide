/**
 * 홈 화면 「빠른 질문」 6개의 임베딩을 미리 계산해 정적 파일로 박는다.
 *
 * 왜 — 서버리스는 요청마다 콜드라서 메모리 LRU 캐시가 매번 비어 있다.
 * 실측: OpenAI 임베딩 콜드 2428ms / 웜 182ms. 모델이 느린 게 아니라 연결 설정 비용이다.
 * 빠른 질문은 고정 문구이고 홈에서 가장 많이 눌리는 경로이므로, 그 6개만 미리 구워둔다.
 *
 * 실행: node scripts/build-preset-embeddings.mjs   (OPENAI_API_KEY 필요)
 * 문구를 바꾸면 다시 돌릴 것. 안 돌려도 동작은 한다 — 그냥 캐시가 안 맞을 뿐이다.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const MODEL = 'text-embedding-3-small';
const OUT = 'src/lib/ai/preset-embeddings.json';

// page.tsx 의 QUICK_REPLIES 에서 직접 읽는다 — 손으로 옮겨 적으면 어긋난다.
const page = readFileSync('src/app/sanction/page.tsx', 'utf8');
const block = page.match(/const QUICK_REPLIES = \[([\s\S]*?)\];/);
if (!block) throw new Error('QUICK_REPLIES 를 찾지 못했다');
const queries = [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
if (queries.length === 0) throw new Error('빠른 질문이 비었다');

for (const f of ['.env.local', '.env.production.local']) {
  try {
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* 없으면 넘어간다 */ }
}
const key = process.env.OPENAI_API_KEY;
if (!key) throw new Error('OPENAI_API_KEY 없음');

const resp = await fetch('https://api.openai.com/v1/embeddings', {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
  body: JSON.stringify({ model: MODEL, input: queries }),
});
if (!resp.ok) throw new Error(`embedding ${resp.status}: ${await resp.text()}`);
const payload = await resp.json();

const table = {};
queries.forEach((q, i) => {
  const v = payload.data[i].embedding;
  // 소수 5자리로 줄인다 — 코사인 유사도에 영향이 없고 파일이 절반이 된다.
  table[q] = v.map((x) => Number(x.toFixed(5)));
});

writeFileSync(OUT, JSON.stringify({ model: MODEL, builtAt: new Date().toISOString().slice(0, 10), table }));
console.log(`${queries.length}개 구움 → ${OUT}`);
for (const q of queries) console.log('  ·', q);
