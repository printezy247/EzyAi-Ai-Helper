'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { runGoal, validatePlan } = require('./commander');

const ids = new Set(['researcher', 'writer']);

test('validatePlan rejects unknown agents, cycles, and bad deps', () => {
  assert.throws(() => validatePlan([{ id: 'a', agent: 'nope', task: 'x' }], ids), /unknown agent/);
  assert.throws(
    () => validatePlan([
      { id: 'a', agent: 'writer', task: 'x', dependsOn: ['b'] },
      { id: 'b', agent: 'writer', task: 'y', dependsOn: ['a'] },
    ], ids),
    /cycle/
  );
  assert.throws(() => validatePlan([{ id: 'a', agent: 'writer', task: 'x', dependsOn: ['z'] }], ids), /unknown task/);
});

test('runGoal plans, runs dependents after inputs, passes results along', async () => {
  const calls = [];
  const provider = {
    async complete(messages) {
      const user = messages[messages.length - 1].content;
      calls.push(user);
      if (messages[0].content.includes('Commander')) {
        return 'Plan: ' + JSON.stringify([
          { id: 't1', agent: 'researcher', task: 'find facts' },
          { id: 't2', agent: 'writer', task: 'write it up', dependsOn: ['t1'] },
        ]);
      }
      return user.startsWith('find facts') ? 'FACTS' : 'ARTICLE';
    },
  };
  const events = [];
  const { results } = await runGoal('write about X', { provider, onEvent: (e) => events.push(e.type) });
  assert.equal(results.t1, 'FACTS');
  assert.equal(results.t2, 'ARTICLE');
  assert.ok(calls.some((c) => c.includes('Result of t1:\nFACTS')));
  assert.deepEqual(events.filter((e) => e === 'plan'), ['plan']);
});

test('a failing specialist is recorded, not thrown', async () => {
  const provider = {
    async complete(messages) {
      if (messages[0].content.includes('Commander')) {
        return JSON.stringify([{ id: 't1', agent: 'writer', task: 'x' }]);
      }
      throw new Error('boom');
    },
  };
  const { results } = await runGoal('g', { provider });
  assert.match(results.t1, /ERROR: boom/);
});
