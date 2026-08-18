import { VertexAI } from '@google-cloud/vertexai';

let cachedVertex: VertexAI | null = null;

function getGoogleAuthOptions(): Record<string, unknown> | undefined {
  const jsonStr = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (jsonStr) {
    try {
      return { credentials: JSON.parse(jsonStr) };
    } catch {
      throw new Error('GOOGLE_APPLICATION_CREDENTIALS_JSON is not valid JSON');
    }
  }
  // Fall back to ADC (GOOGLE_APPLICATION_CREDENTIALS env or default)
  return undefined;
}

export function getVertexClient(): VertexAI {
  if (cachedVertex) return cachedVertex;

  const project = process.env.GCP_PROJECT_ID;
  if (!project) {
    throw new Error('GCP_PROJECT_ID is not configured');
  }

  const googleAuthOptions = getGoogleAuthOptions();

  cachedVertex = new VertexAI({
    project,
    location: process.env.GCP_REGION || 'asia-northeast3',
    ...(googleAuthOptions ? { googleAuthOptions } : {}),
  });

  return cachedVertex;
}

// 기본 모델. 프리뷰(-preview-MM-DD) 모델은 회수되므로 GA 모델만 기본값으로 둔다.
// 2026-08-18 장애: gemini-2.5-flash-preview-04-17 이 Vertex에서 404(회수)로 사라져
// /api/chat 전체가 중단됨(폴백 없음). GA 모델 gemini-2.5-flash 로 교체.
// 다음 교체 때 코드 수정이 필요 없도록 VERTEX_MODEL 로 덮어쓸 수 있게 한다.
export const DEFAULT_VERTEX_MODEL = process.env.VERTEX_MODEL || 'gemini-2.5-flash';

export function getGenerativeModel(modelName: string = DEFAULT_VERTEX_MODEL) {
  const vertex = getVertexClient();
  return vertex.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 4096,
    },
  });
}
