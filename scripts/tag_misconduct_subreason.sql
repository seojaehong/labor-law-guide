-- misconduct 사건 sub_reason 부여 — SQL 한 번에 처리. 매칭된 패턴 모두 array에 추가.
-- 매칭 텍스트: holding_points || key_issue || array_to_string(tags, ' ')

WITH src AS (
  SELECT id,
         COALESCE(holding_points, '') || ' ' ||
         COALESCE(key_issue, '') || ' ' ||
         COALESCE(array_to_string(tags, ' '), '') AS txt
  FROM nlrc_decisions
  WHERE 'misconduct' = ANY(reason_category)
),
tagged AS (
  SELECT id,
    ARRAY_REMOVE(ARRAY[
      CASE WHEN txt ~ '기밀.*유출|기밀.*누설|영업비밀|기술유출|정보.*누설|정보.*유출|업무상[[:space:]]*비밀|기밀.*전달|자료.*외부.*제공' THEN 'information_leak' END,
      CASE WHEN txt ~ '문서.*위조|허위.*보고|허위.*신고|허위.*기재|허위.*작성|조작|위조|허위.*공문서|허위.*진단서|사문서.*위조|진단서.*위조' THEN 'falsification' END,
      CASE WHEN txt ~ '횡령|배임|금품.*수수|뇌물|공금.*유용|착복|절취|사기|금품.*수령|업무상.*횡령|법인카드.*개인.*사용|회사.*자금' THEN 'fraud_embezzlement' END,
      CASE WHEN txt ~ '지시.*불이행|지시.*불복|명령.*위반|업무.*지시.*거부|불응|지시.*불응|지휘.*감독.*거부|상사.*명령' THEN 'insubordination' END,
      CASE WHEN txt ~ '직권.*남용|권한.*남용|지위.*이용|직권.*행사|채용.*비리|특혜|채용.*개입' THEN 'misuse_authority' END,
      CASE WHEN txt ~ '무단.*결근|무단.*조퇴|무단.*이탈|근무지.*이탈|근태.*불량|병가.*남용|장기.*결근|연차.*위반|복무.*위반' THEN 'attendance_failure' END,
      CASE WHEN txt ~ '겸직|이중.*취업|영리.*행위|타사.*근무|개인.*사업|투잡|겸업|동종.*업무.*취업' THEN 'dual_employment' END,
      CASE WHEN txt ~ '부적절.*관계|불륜|동료.*괴롭힘|혼외|이성.*관계|이성.*문제|사적.*만남' THEN 'relationship_misconduct' END,
      CASE WHEN txt ~ '공무원.*품위|지방공무원법|국가공무원법|공무원.*비위|관용차|공직자' THEN 'public_servant_misconduct' END,
      CASE WHEN txt ~ '음주|안전수칙.*위반|보호구.*미착용|안전.*규정|음주.*운전|음주.*상태|혈중알코올|약물' THEN 'safety_violation' END,
      CASE WHEN txt ~ '직장.*질서|품위.*손상|이미지.*실추|품위.*유지.*위반|동료.*폭언|직장.*분위기' THEN 'workplace_disturbance' END,
      CASE WHEN txt ~ '전산.*무단|회사.*컴퓨터.*개인|사내.*시스템.*무단|개인정보.*무단.*열람|업무용.*PC|이메일.*무단' THEN 'computer_misuse' END,
      CASE WHEN txt ~ '고객.*폭언|고객.*불만|고객.*신뢰|민원.*야기|거래처.*문제|고객.*항의' THEN 'client_relationship' END
    ], NULL) AS sub_reasons
  FROM src
)
UPDATE nlrc_decisions n
SET sub_reason = t.sub_reasons
FROM tagged t
WHERE n.id = t.id AND cardinality(t.sub_reasons) > 0;
