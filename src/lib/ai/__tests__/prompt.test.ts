import { describe, expect, it } from 'vitest'
import { trimHistory } from '../prompt'

describe('trimHistory', () => {
  it('메시지 6개 이하에서는 마지막 user 메시지만 userContext로 교체한다', () => {
    const messages = [
      { role: 'user', content: '첫 질문' },
      { role: 'assistant', content: '첫 답변' },
      { role: 'user', content: '두 번째 질문' },
    ]

    const trimmed = trimHistory(messages, '교체된 질문')

    expect(trimmed).toEqual([
      { role: 'user', content: '첫 질문' },
      { role: 'assistant', content: '첫 답변' },
      { role: 'user', content: '교체된 질문' },
    ])
  })

  it('메시지 10개에서는 slice 이후 마지막이 반드시 user로 끝난다', () => {
    const messages = [
      { role: 'user', content: 'u1' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'u2' },
      { role: 'assistant', content: 'a2' },
      { role: 'user', content: 'u3' },
      { role: 'assistant', content: 'a3' },
      { role: 'user', content: 'u4' },
      { role: 'assistant', content: 'a4' },
      { role: 'user', content: 'u5' },
      { role: 'assistant', content: 'a5' },
    ]

    const trimmed = trimHistory(messages, '최신 질문')

    expect(trimmed).toEqual([
      { role: 'user', content: 'u3' },
      { role: 'assistant', content: 'a3' },
      { role: 'user', content: 'u4' },
      { role: 'assistant', content: 'a4' },
      { role: 'user', content: '최신 질문' },
    ])
    expect(trimmed.at(-1)?.role).toBe('user')
  })

  it('메시지 7개에서 마지막이 assistant여도 마지막 user 이후 assistant는 잘라낸다', () => {
    const messages = [
      { role: 'user', content: 'u1' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'u2' },
      { role: 'assistant', content: 'a2' },
      { role: 'user', content: 'u3' },
      { role: 'assistant', content: 'a3' },
      { role: 'assistant', content: 'a4' },
    ]

    const trimmed = trimHistory(messages, '교체할 userContext')

    expect(trimmed).toEqual([
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'u2' },
      { role: 'assistant', content: 'a2' },
      { role: 'user', content: '교체할 userContext' },
    ])
    expect(trimmed.at(-1)?.role).toBe('user')
  })

  it('빈 배열이어도 에러 없이 userContext 하나를 추가한다', () => {
    expect(trimHistory([], '새 질문')).toEqual([{ role: 'user', content: '새 질문' }])
  })

  it('10개 교차 대화에서 slice 후 마지막 user만 남긴다', () => {
    const messages = [
      { role: 'user', content: 'u1' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'u2' },
      { role: 'assistant', content: 'a2' },
      { role: 'user', content: 'u3' },
      { role: 'assistant', content: 'a3' },
      { role: 'user', content: 'u4' },
      { role: 'assistant', content: 'a4' },
      { role: 'user', content: 'u5' },
      { role: 'assistant', content: 'a5' },
    ]

    const trimmed = trimHistory(messages, '대체된 최신 user')

    expect(trimmed.at(-1)).toEqual({ role: 'user', content: '대체된 최신 user' })
    expect(trimmed).toEqual([
      { role: 'user', content: 'u3' },
      { role: 'assistant', content: 'a3' },
      { role: 'user', content: 'u4' },
      { role: 'assistant', content: 'a4' },
      { role: 'user', content: '대체된 최신 user' },
    ])
  })
})
