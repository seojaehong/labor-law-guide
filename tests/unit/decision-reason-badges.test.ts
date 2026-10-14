import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import DecisionReasonBadges from '@/app/decisions/DecisionReasonBadges';
import {reasonLabel} from '@/app/decisions/SearchResults';
const render=(categories:string[]|null,primary?:string|null)=>renderToStaticMarkup(createElement(DecisionReasonBadges,{categories,primary}));
it('shows the same primary as list before preserved companion categories',()=>{
  const categories=['worker_status','no_dismissal','transfer'];
  const html=render(categories,'no_dismissal');
  expect(html).toContain(`aria-label="대표 유형: ${reasonLabel(categories,'no_dismissal')}"`);
  expect(html.indexOf('해고부존재/사직')).toBeLessThan(html.indexOf('근로자성 분쟁'));
  expect(html).toContain('함께 저장된 유형');expect(html).toContain('전보/인사이동');
  expect(categories).toEqual(['worker_status','no_dismissal','transfer']);
});
it('explicitly separates stored categories for transfer and court work-ability samples',()=>{
  expect(render(['transfer','union_activity'],'retaliation')).toContain('aria-label="대표 유형: 전보/인사이동"');
  expect(render(['incompetence'],'work_ability')).toContain('aria-label="대표 유형: 업무능력부족"');
});
it('preserves unknown stored values without inventing a representative classification',()=>{
  const html=render(['unknown'],'dismissal_validity');expect(html).toContain('저장된 유형');expect(html).toContain('unknown');expect(html).not.toContain('대표 유형');expect(render(null)).toBe('');
});
