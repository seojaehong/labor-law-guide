// Vertex AI Embeddings — text-multilingual-embedding-002 (768 dim)
// Node SDK(@google-cloud/vertexai)는 embedding 미지원이라 REST 직접 호출.
// 인증은 기존 client.ts와 동일한 GOOGLE_APPLICATION_CREDENTIALS_JSON 활용.
//
// 사용: pkb_chunks 검색용 query 임베딩 + (선택) 인덱싱 보강.

import { GoogleAuth } from 'google-auth-library';

const EMBEDDING_MODEL = 'text-multilingual-embedding-002';
const EMBEDDING_DIM = 768;

let cachedAuth: GoogleAuth | null = null;

function getAuth(): GoogleAuth {
  if (cachedAuth) return cachedAuth;
  const jsonStr = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  let credentials: Record<string, unknown> | undefined;
  if (jsonStr) {
    try {
      credentials = JSON.parse(jsonStr);
    } catch {
      throw new Error('GOOGLE_APPLICATION_CREDENTIALS_JSON is not valid JSON');
    }
  }
  cachedAuth = new GoogleAuth({
    ...(credentials ? { credentials } : {}),
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  return cachedAuth;
}

export type EmbedTaskType =
  | 'RETRIEVAL_DOCUMENT'
  | 'RETRIEVAL_QUERY'
  | 'SEMANTIC_SIMILARITY'
  | 'CLASSIFICATION'
  | 'CLUSTERING';

export async function embedTexts(
  texts: string[],
  taskType: EmbedTaskType = 'RETRIEVAL_QUERY'
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const project = process.env.GCP_PROJECT_ID;
  if (!project) throw new Error('GCP_PROJECT_ID not set');
  const region = process.env.GCP_REGION || 'asia-northeast3';

  const auth = getAuth();
  const client = await auth.getClient();
  const accessToken = (await client.getAccessToken()).token;

  const url = `https://${region}-aiplatform.googleapis.com/v1/projects/${project}/locations/${region}/publishers/google/models/${EMBEDDING_MODEL}:predict`;

  // Vertex 최대 250건/요청 권장 (실제 한도). 안전하게 5건씩 배치.
  const BATCH = 5;
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH);
    const body = {
      instances: slice.map((content) => ({ content, task_type: taskType })),
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Vertex embedding failed: ${res.status} ${err.slice(0, 200)}`);
    }
    const json = (await res.json()) as {
      predictions: Array<{ embeddings: { values: number[] } }>;
    };
    for (const p of json.predictions) {
      out.push(p.embeddings.values);
    }
  }
  return out;
}

export async function embedQuery(text: string): Promise<number[]> {
  const [v] = await embedTexts([text], 'RETRIEVAL_QUERY');
  return v;
}

export { EMBEDDING_DIM, EMBEDDING_MODEL };
