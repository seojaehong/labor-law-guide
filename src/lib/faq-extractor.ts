/**
 * 블로그 본문에서 FAQ 패턴을 자동 추출하여 JSON-LD FAQPage 스키마에 사용.
 *
 * 지원 패턴:
 * 1. HTML: <h2>Q. 질문</h2> ... <p>답변</p>
 * 2. HTML: <strong>Q:</strong> 질문 ... 답변
 * 3. Markdown: ## Q. 질문 / **Q:** 질문
 * 4. 구조화된 Q&A 섹션 (자주 묻는 질문, FAQ 등)
 * 5. faq_data JSON 블록 (에이전트가 직접 삽입)
 */

interface FaqItem {
  question: string;
  answer: string;
}

export function extractFaqFromContent(content: string): FaqItem[] {
  if (!content) return [];

  const faqs: FaqItem[] = [];

  // 패턴 1: faq_data JSON 블록 (에이전트가 구조화 데이터로 직접 삽입)
  const jsonMatch = content.match(/<!--\s*faq_data\s*([\s\S]*?)-->/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item.q && item.a) {
            faqs.push({ question: item.q.trim(), answer: item.a.trim() });
          }
        }
        if (faqs.length > 0) return faqs.slice(0, 10);
      }
    } catch {
      // JSON 파싱 실패 시 다른 패턴으로 fallback
    }
  }

  // 패턴 2: HTML Q&A 패턴 — <h2>Q. 질문</h2> 또는 <h3>Q: 질문</h3>
  const htmlQaRegex = /<h[23][^>]*>\s*(?:Q[.:]?\s*|질문\s*[.:]\s*)(.*?)<\/h[23]>([\s\S]*?)(?=<h[23]|$)/gi;
  let match;
  while ((match = htmlQaRegex.exec(content)) !== null) {
    const question = stripHtml(match[1]).trim();
    const answer = stripHtml(match[2]).trim();
    if (question && answer && answer.length > 20) {
      faqs.push({ question, answer: truncate(answer, 300) });
    }
  }
  if (faqs.length >= 2) return faqs.slice(0, 10);

  // 패턴 3: <strong>Q:</strong> 패턴
  const strongQRegex = /<strong>\s*(?:Q[.:]?\s*)(.*?)<\/strong>\s*([\s\S]*?)(?=<strong>\s*(?:Q[.:])|<h[23]|$)/gi;
  while ((match = strongQRegex.exec(content)) !== null) {
    const question = stripHtml(match[1]).trim();
    const answer = stripHtml(match[2]).trim();
    if (question && answer && answer.length > 20) {
      faqs.push({ question, answer: truncate(answer, 300) });
    }
  }
  if (faqs.length >= 2) return faqs.slice(0, 10);

  // 패턴 4: Markdown ## Q. 질문
  const mdQRegex = /^#{2,3}\s*(?:Q[.:]?\s*|질문\s*[.:]\s*)(.*?)$/gm;
  const lines = content.split('\n');
  let i = 0;
  while (i < lines.length) {
    const qMatch = lines[i].match(/^#{2,3}\s*(?:Q[.:]?\s*|질문\s*[.:]\s*)(.*)/);
    if (qMatch) {
      const question = qMatch[1].trim();
      const answerLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].match(/^#{1,3}\s/)) {
        answerLines.push(lines[i]);
        i++;
      }
      const answer = stripHtml(answerLines.join('\n')).trim();
      if (question && answer && answer.length > 20) {
        faqs.push({ question, answer: truncate(answer, 300) });
      }
    } else {
      i++;
    }
  }

  return faqs.slice(0, 10);
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const truncated = text.slice(0, maxLen);
  const lastSentence = truncated.lastIndexOf('.');
  return lastSentence > maxLen * 0.5
    ? truncated.slice(0, lastSentence + 1)
    : truncated + '…';
}
