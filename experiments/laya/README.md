# Laya 한국어 재정렬 실험 (운영 연결 없음)

**최신 상태: [2026-10-21 재개 검증](RESUME_2026-10-21.md). 아래는 2026-10-20 준비 기록이며, 설치·lock·원격 게시 상태는 재개 문서가 갱신한다.**

기준: master `11015081cdb81eb5b83a66c467f28fbd2c9b40b0`, 2026-10-20.
PR54 브랜치는 체크아웃·수정·병합하지 않았다. 기존 Jev와 활성 기능은 변경하지 않는다.

현재 Jev는 `src/lib/chat/context/{faq,laws}.ts`에서 후보의 question 앞 120자를 choice로 전달하는 TypeSafe 재선택이다. 법령·FAQ 공용이며 판례 검색 전체를 대체하지 않는다. `JEV_ON=false`는 호출부를 끄며, 실제 요청에는 `TYPESAFE_JEV_ON=true`, `TYPESAFE_JEV_CHAT_ON=true`, 키 존재가 모두 필요하다. 실패·타임아웃은 기존 순서의 상위 N개로 돌아간다. 이 환경에는 네 관련 환경변수 모두 없다(값은 읽거나 출력하지 않음). 배포 환경 설정은 조회하지 않았으므로 운영 활성 여부는 미확인이다.

기존 `eval/rubrics/baseline-summary.md`에는 판례 240건 209/240, FAQ 100문항(정답 검수 미완료), 응답 지연 기준이 있다. 해당 기록은 현재 Laya와 같은 후보·환경의 비교 결과가 아니다. 기존 평가 스크립트는 외부 서비스/생성 모델을 사용할 수 있으므로 실행하지 않았다. 합성 조문 요약 3건은 도구 검증용 작은 fixture이며 최신 법률 자문/정답지나 대표성 있는 벤치마크가 아니다. 공개 판례 후보와 검수된 정답을 포함한 평가 확대는 미완료다.

## 선택형 어댑터

`src/lib/chat/context/laya.ts`의 `layaRerank`는 기본 비활성이다. 명시적 enabled와 로컬 score 함수를 주입해야 한다. 전체 후보 수와 일치하는 유한 [0,1] 점수 벡터만 허용한다. 누락·실패·미설정·시간초과는 원래 순서를 보존하며 동점은 안정 정렬한다. 네트워크 호출·키·다른 모델 fallback은 없다. 점수는 법률 적합성이나 정답 확률로 노출하지 않는다. 실제 로컬 브리지와 운영 설정은 연결하지 않았다. 타임아웃은 AbortSignal을 전달하지만 주입 구현도 취소를 준수해야 자원을 회수한다.

## 공식 API와 고정

확인한 공식 PyPI와 최신 소스 버전은 `laya==0.4.12`다. 공식 wheel SHA256은 requirements.txt에 기록했다. 코드 및 multilingual weights는 Apache-2.0이다.

- https://github.com/NandhaKishorM/laya
- https://github.com/NandhaKishorM/laya/blob/main/laya/agent.py (`Agent`, `system_one`, `lang`, `max_len`)
- https://github.com/NandhaKishorM/laya/blob/main/laya/revisions.py (공식 reviewed multilingual SHA)
- https://huggingface.co/convaiinnovations/laya-multilingual
- https://pypi.org/project/laya/0.4.12/
- https://github.com/NandhaKishorM/laya/blob/main/BENCHMARKS.md

공식 설치 방법은 `python -m pip install laya`이나 재현 실험에는 버전과 전이 의존성까지 hash-lock한 별도 venv가 필요하다. 현재 requirements.txt는 패키지 pin 기록이며 완성된 설치 lock이 아니다. 설치·쉘 설치 스크립트·trust_remote_code 실행은 하지 않았다. 패키지와 전체 모델 로딩 경로의 공급망 검토 및 완전한 lock 생성은 실행 전 남은 조건이다.

## 오프라인 평가

의존성 없는 실패 복귀 확인:

```sh
python experiments/laya/evaluate.py
python -m unittest discover -s experiments/laya -p 'test_*.py'
```

공식 safetensors snapshot을 검토·준비하고 위 조건을 충족한 뒤:

```sh
python experiments/laya/evaluate.py --snapshot /path/to/snapshots/e4e9ddf21a7b1903b7acffd8814ad4307bf63a67 --timeout 30
```

고정 revision의 로컬 snapshot만 받는다. 실행 자식 환경에서 인증정보를 상속하지 않으며 HF를 offline으로 강제한다. 토크나이저/encoder 로컬 파일이 필수다. 모델 1024 기본값 대신 8192를 명시하고, 조합 입력을 토큰화한 뒤 형식 토큰 512개를 예약한다. 넘으면 조용히 자르지 않고 원래 검색 순서로 복귀한다. 긴 법령은 조문·문단 단위 후보를 별도로 만들고 답이 뒤쪽에 있는 누락 시험을 추가해야 한다. 현재 보수적 길이 검사는 실제 모델에서 아직 검증하지 못했다.

평가는 baseline/Laya top1, MRR, recall@3, 후보 순서 변화, 사례별 지연 및 p50/p95를 남긴다. 지연은 **매회 CPU 프로세스 시작과 모델 로딩을 포함**하며 warm 서비스 지연과 구분한다. 실패는 Laya 정확도에 포함하지 않는다. Jev 유료 API와 사용자 실제 문서는 사용하지 않는다. 실제 Jev A/B, 공개 판례 확대, warm/cold 반복 측정과 메모리 측정은 남아 있다.

## 현재 결과 및 한계

공식 HF API `https://huggingface.co/api/models/convaiinnovations/laya-multilingual` 접근은 프록시 `Tunnel connection failed: 403 Forbidden`으로 실패했다. 모델/torch/transformers/safetensors가 없으며 GPU 실행 도구도 발견되지 않았다. 따라서 모델 다운로드·추론·한국어 품질·실제 속도는 **측정하지 못했다**. result-unconfigured.json의 measured_count=0은 실패 복귀 증거이며 성공적인 모델 비교가 아니다. 무작위 점수로 성능을 주장하지 않는다.

Laya는 choice/score/yes-no 결정 엔진이며 전용 검색 재정렬기 또는 법률 검증기가 아니다. 공식 BENCHMARKS는 zero-shot와 calibration 한계, 서로 다른 Jev 표본·프롬프트의 제3자 수치를 명시한다. 영상의 30배 속도를 운영 보장으로 취급할 수 없다. 검수된 한국어 법령·판례 정답지와 동일 후보·환경에서 정확도/지연/메모리/실패율을 통과하기 전에는 채택·병합·배포하지 않는다. 서버나 유료 호스팅은 생성하지 않았다. 후보 선택지는 기존 순서 유지, 로컬 CPU 오프라인 실험, 별도 검토 후 GPU 자체 호스팅이며 비용/메모리는 아직 산정 근거가 없다.

검토한 upstream main commit: `ffc142012af63d015fa19f05f29f9c5ff329a2cc` (git ls-remote 확인). 모델 SHA는 이 소스의 reviewed revision이며 HF 메타데이터 대조는 403으로 불가능했다.

검증: `npm run test -- tests/unit/laya-rerank.test.ts tests/unit/jev-rerank.test.ts` 39/39 통과, `python -m unittest discover -s experiments/laya -p 'test_*.py'` 3/3 통과, 변경 TS 파일 ESLint 통과. 최초 npm 설치는 기본 캐시 경로 쓰기 실패였고 `/tmp/laya-npm-cache`로 지정한 재시도는 성공했다. 실제 모델 실험과 이 단위 검증은 구분한다. worker는 본문을 state에 두고 짧은 선택지 ID를 사용하며, 공식 API의 `instructions`, `max_len=8192`, `head_max_len=512`, usage 잘림·선택지 붕괴 정보를 확인한다.

`npx --no-install tsc --noEmit`도 통과했다. 브랜치는 origin에 게시했다. GitHub GraphQL 조회 및 REST 초안 PR 생성(`POST /repos/seojaehong/labor-law-guide/pulls`)은 `Forbidden`으로 차단돼 원격 PR 생성은 확인되지 않았다. PR 본문은 PR_DRAFT.md에 보존했다. 병합·배포는 하지 않았다.
