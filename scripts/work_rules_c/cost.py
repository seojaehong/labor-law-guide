"""단계별 토큰 → 달러. 단가는 per 1M tokens (input, output, cache read)."""
import warnings

from work_rules_c.triage import Usage

PRICES: dict[str, tuple[float, float, float]] = {
    "claude-haiku-5-5": (0.10, 0.50, 0.01),
    "claude-sonnet-5-5": (2.00, 10.00, 0.20),
    "claude-opus-5-5": (4.00, 20.00, 0.20),
    # Batch API — 표준 단가의 50%
    "claude-haiku-5-5-batch": (0.05, 0.25, 0.005),
    "claude-sonnet-5-5-batch": (1.00, 5.00, 0.10),
    "claude-opus-5-5-batch": (2.00, 10.00, 0.10),
    # 판단 모델 두 줄은 첫 실측 청구로 다시 확인한다(2026-10-21 기준 출처: 외부 실측 기록 · OpenAI 가이드)
    "jev-latest": (0.042, 0.0, 0.0),
    "gpt-6-luna": (0.10, 0.0, 0.0),
}


def usd(u: Usage) -> float:
    if u.model not in PRICES:
        warnings.warn(f"단가 없는 모델: {u.model}", UserWarning)
        return 0.0
    inp, out, cache_read = PRICES[u.model]
    return (u.input_tokens * inp + u.output_tokens * out + u.cache_read_input_tokens * cache_read
            + u.cache_creation_input_tokens * inp * 1.25) / 1e6
