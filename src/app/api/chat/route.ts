import { NextRequest } from 'next/server';
import { SYSTEM_PROMPT, searchQA } from '@/content/ai-knowledge';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-server';

export const maxDuration = 60;

const db = supabaseAdmin || supabase;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const messages = body?.messages;

    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 50) {
      return new Response(JSON.stringify({ error: '올바른 메시지 형식이 아닙니다.' }), { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'AI 서비스가 준비되지 않았습니다.' }), { status: 503 });
    }

    const lastUserMsg = [...messages].reverse().find((m: { role: string }) => m.role === 'user');

    // FAQ DB 매칭 — Supabase RPC(search_faq) 우선, 인라인 fallback
    let faqContext = '';
    if (lastUserMsg) {
      const { data: dbFaq, error: dbErr } = await db.rpc('search_faq', {
        query: lastUserMsg.content,
        result_limit: 5,
      });
      if (!dbErr && dbFaq && dbFaq.length > 0) {
        faqContext = '\n\n═══ 관련 지식DB 매칭 결과 (참고하여 답변) ═══\n';
        for (const faq of dbFaq) {
          faqContext += `\n[${faq.category}] Q: ${faq.question}\nA: ${faq.answer}\n`;
        }
        faqContext += '\n위 DB 내용을 참고하되, 질문에 맞게 자연스럽게 재구성하여 답변하세요.';
      } else {
        // Supabase 미응답 시 인라인 FAQ fallback
        const inlineFaq = searchQA(lastUserMsg.content);
        if (inlineFaq.length > 0) {
          faqContext = '\n\n═══ 관련 예상질문 DB 매칭 결과 (참고하여 답변) ═══\n';
          for (const faq of inlineFaq.slice(0, 3)) {
            faqContext += `\nQ: ${faq.question}\nA: ${faq.answer}\n${faq.relatedArticle ? `관련조문: ${faq.relatedArticle}` : ''}\n`;
          }
          faqContext += '\n위 DB 내용을 참고하되, 질문에 맞게 자연스럽게 재구성하여 답변하세요.';
        }
      }
    }

    let systemPrompt = SYSTEM_PROMPT + faqContext;

    // 관련 뉴스 검색 (최신 5건)
    if (lastUserMsg) {
      const q = lastUserMsg.content.slice(0, 50).replace(/[%_\\,().]/g, '');
      const pattern = `%${q}%`;
      const { data: newsData } = await supabase
        .from('news')
        .select('title, source, published_at, summary')
        .or(`title.ilike.${pattern},summary.ilike.${pattern}`)
        .order('published_at', { ascending: false })
        .limit(5);

      if (newsData && newsData.length > 0) {
        systemPrompt += '\n\n═══ 관련 최신 뉴스 (참고용, 출처 명시하여 답변) ═══\n';
        for (const n of newsData) {
          systemPrompt += `\n[${n.published_at?.slice(0, 10)}] ${n.title} (${n.source || '뉴스'})\n${n.summary?.slice(0, 150) || ''}\n`;
        }
      }
    }

    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
        max_completion_tokens: 4096,
        temperature: 0.3,
        stream: true,
      }),
      signal: AbortSignal.timeout(55000),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error);
    }

    // SSE streaming: pipe through to client
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        let buffer = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith('data: ')) continue;
              const data = trimmed.slice(6);
              if (data === '[DONE]') continue;

              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
                }
              } catch {
                // skip malformed chunks
              }
            }
          }
        } catch (err) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: '스트리밍 중 오류가 발생했습니다.' })}\n\n`)
          );
        } finally {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: `오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}` }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
