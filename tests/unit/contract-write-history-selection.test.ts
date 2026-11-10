// 브라우저 없이 실제 부모 컴포넌트의 콜백을 실행한다. 카드의 key가 바뀌면 React가
// WorkplacePicker의 선택·출처·안내 상태를 함께 새로 만든다. 화면 상호작용은 별도 e2e.
import { beforeEach, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = initial;
    return [hooks.values[index], (next: unknown) => {
      hooks.values[index] = typeof next === 'function' ? next(hooks.values[index]) : next;
    }];
  },
  useMemo: (factory: () => unknown) => factory(),
}));

import ContractWriteClient from '@/app/tools/contract-write/ContractWriteClient';
import { INITIAL, type WriteState } from '@/app/tools/contract-write/formState';
import { RecentInputs } from '@/app/tools/contract-write/RecentInputs';
import { WorkplacePicker } from '@/components/workplace/WorkplacePicker';

beforeEach(() => { hooks.values = []; hooks.cursor = 0; });
function render() {
  hooks.cursor = 0;
  const children = ContractWriteClient().props.children as ReactElement[];
  return {
    picker: children.find((child) => child.type === WorkplacePicker) as ReactElement<{ state: WriteState; onPatch: (patch: Partial<WriteState>) => void }>,
    history: children.find((child) => child.type === RecentInputs) as ReactElement<{ onLoad: (state: WriteState) => void }>,
  };
}

it('최근 입력을 불러오면 폼과 카드 선택 초기화가 같은 동작으로 일어난다', () => {
  const before = render();
  const loaded = { ...INITIAL, employeeName: '합성동명', duty: '최근 입력 업무' };
  before.history.props.onLoad(loaded);
  const after = render();
  expect(after.picker.props.state).toEqual(loaded);
  expect(after.picker.key).not.toBe(before.picker.key);
});

it('같은 최근 입력을 반복해서 불러와도 매번 카드 선택을 새로 만든다', () => {
  const first = render();
  first.history.props.onLoad(INITIAL);
  const second = render();
  second.history.props.onLoad(INITIAL);
  expect(new Set([first.picker.key, second.picker.key, render().picker.key]).size).toBe(3);
});

it('일반 입력 수정은 선택한 카드가 유지돼 정상 재계약을 저장할 수 있다', () => {
  const before = render();
  before.picker.props.onPatch({ duty: '합성 새 업무' });
  const after = render();
  expect(after.picker.props.state.duty).toBe('합성 새 업무');
  expect(after.picker.key).toBe(before.picker.key);
});
