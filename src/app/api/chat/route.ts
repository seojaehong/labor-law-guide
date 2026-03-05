import { NextRequest, NextResponse } from 'next/server';
import { SYSTEM_PROMPT, searchQA } from '@/content/ai-knowledge';

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ content: 'OPENAI_API_KEY가 설정되지 않았습니다.' });
    }

    // FAQ DB 매칭으로 컨텍스트 보강
    const lastUserMsg = [...messages].reverse().find((m: { role: string }) => m.role === 'user');
    const faqMatches = lastUserMsg ? searchQA(lastUserMsg.content) : [];

    let systemPrompt = SYSTEM_PROMPT;
    if (faqMatches.length > 0) {
      systemPrompt += '\n\n═══ 관련 예상질문 DB 매칭 결과 (참고하여 답변) ═══\n';
      for (const faq of faqMatches.slice(0, 3)) {
        systemPrompt += `\nQ: ${faq.question}\nA: ${faq.answer}\n${faq.relatedArticle ? `관련조문: ${faq.relatedArticle}` : ''}\n`;
      }
      systemPrompt += '\n위 DB 내용을 참고하되, 질문에 맞게 자연스럽게 재구성하여 답변하세요.';
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
        max_tokens: 1500,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '응답을 생성할 수 없습니다.';

    return NextResponse.json({ content });
  } catch (error) {
    return NextResponse.json(
      { content: `오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}` },
      { status: 200 }
    );
  }
}
