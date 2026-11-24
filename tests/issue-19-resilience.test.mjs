import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { BoundedMap } from '../backend/boundedMap.mjs';

test('Issue #19 POSITIVE: BoundedMap evicts oldest entries and never exceeds maxSize', () => {
  const m = new BoundedMap(3);
  m.set('a', 1);
  m.set('b', 2);
  m.set('c', 3);
  m.set('d', 4);
  assert.equal(m.size, 3);
  assert.equal(m.has('a'), false);
  assert.equal(m.get('d'), 4);

  // Updating existing key refreshes recency
  m.set('b', 20);
  m.set('e', 5);
  assert.equal(m.has('c'), false);
  assert.equal(m.get('b'), 20);
});

test('Issue #19 NEGATIVE: Python daemon evaluate_market handles mid == 0 without ZeroDivisionError', () => {
  const pyCode = [
    'import sys',
    'sys.path.insert(0, "backend")',
    'from terminal_agent_daemon import AutonomousWhaleAgentEngine',
    'eng = AutonomousWhaleAgentEngine()',
    'snap = eng.evaluate_market("ZERO-PERP", [[0.0, 10.0]], [[0.0, 10.0]], 0.0)',
    'assert snap.recommended_action == "BLOCKED_INVALID_PRICE", snap.recommended_action',
    'assert snap.passed_liquidity_gate is False',
    'print("PY_OK")',
  ].join('\n');
  const out = execFileSync('python', ['-c', pyCode], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
  }).trim();
  assert.equal(out, 'PY_OK');
});
