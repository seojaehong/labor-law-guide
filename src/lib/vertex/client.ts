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

export function getGenerativeModel(modelName: string = 'gemini-2.5-flash-preview-04-17') {
  const vertex = getVertexClient();
  return vertex.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 4096,
    },
  });
}
