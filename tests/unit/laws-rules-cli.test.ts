import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
it('runs the actual 44-rule raw map CLI and writes JSON before exit', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'law-cli-synthetic-'));
  try {
    const input = path.join(dir, 'rules.txt'), output = path.join(dir, 'result.json');
    writeFileSync(input, '제1조(휴가) 배우자의 출산을 이유로 20일의 유급휴가를 부여한다.\n제2조(근로시간) 주 40시간으로 한다.');
    const stdout = execFileSync('python3', ['scripts/laws/rules_impact.py', input, '--asof', '20261020', '--json', output], { encoding: 'utf8' });
    const result = JSON.parse(readFileSync(output, 'utf8'));
    expect(result.results).toHaveLength(44);
    expect(result.results.every((r: { status: string }) => r.status === '검토 필요')).toBe(false);
    expect(stdout).toContain('매핑 44건');
    expect(stdout).toContain(`→ ${output}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
it('prints review-required status and still exports JSON for unknown raw law IDs', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'law-cli-synthetic-'));
  try {
    const input = path.join(dir, 'rules.txt'), output = path.join(dir, 'result.json');
    writeFileSync(input, '제1조(합성) 합성 문구');
    const code = `import importlib.util,sys\nspec=importlib.util.spec_from_file_location('impact','scripts/laws/rules_impact.py')\nm=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)\nm.MAP['rules']=[{**m.MAP['rules'][0],'lawId':'unknown-synthetic'}]\nsys.argv=['impact',sys.argv[1],'--json',sys.argv[2]]\nm.main()`;
    const stdout = execFileSync('python3', ['-c', code, input, output], { encoding: 'utf8' });
    expect(stdout).toContain('? 검토 필요');
    expect(JSON.parse(readFileSync(output, 'utf8')).results[0].status).toBe('검토 필요');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
