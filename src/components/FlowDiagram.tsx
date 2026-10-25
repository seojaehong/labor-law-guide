// 절차 흐름도 — 데이터 한 벌을 받아 세로 단계로 그린다.
//
// 왜 라이브러리를 안 쓰나. Mermaid 는 글로 적어 그림을 얻는 점이 좋지만, 이 흐름은
// 분기가 「기한을 놓치면 닫힌다」 하나뿐인 직선이라 그래프 엔진이 필요 없다.
// 그리고 번들에 1MB 를 더하는 대신, 같은 원칙(한 벌의 글 → 그림, 색은 CSS 변수)만 가져왔다.
// 단계·기한·근거가 **글자로도 남아** 화면 낭독기와 검색엔진이 읽을 수 있다.
import type { Flow } from '@/content/procedure-flows';

export default function FlowDiagram({ flow }: { flow: Flow }) {
  return (
    <figure className="fd">
      <figcaption className="fd-head">
        <h3 className="fd-title">{flow.title}</h3>
        <p className="fd-lead">{flow.lead}</p>
      </figcaption>

      <ol className="fd-steps">
        {flow.steps.map((s, i) => (
          <li key={s.id} className="fd-step">
            <div className="fd-rail" aria-hidden="true">
              <span className="fd-dot">{i + 1}</span>
              {i < flow.steps.length - 1 && <span className="fd-line" />}
            </div>
            <div className="fd-body">
              <div className="fd-row">
                <b className="fd-name">{s.title}</b>
                {s.deadline && <span className="fd-deadline">{s.deadline}</span>}
              </div>
              {s.detail && <p className="fd-detail">{s.detail}</p>}
              {s.basis && <p className="fd-basis">{s.basis}</p>}
              {s.branch && (
                <p className="fd-branch">
                  <span className="fd-branch-k">{s.branch.label}</span> {s.branch.detail}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>

      <ul className="fd-notes">
        {flow.notes.map((n) => <li key={n}>{n}</li>)}
      </ul>
    </figure>
  );
}
