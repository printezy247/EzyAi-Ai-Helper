'use strict';

const { listAgents } = require('./registry');

const MAX_TASKS = 8;

function extractJson(text) {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('commander did not return a JSON plan');
  return JSON.parse(match[0]);
}

/** Validate a plan: known agents, unique ids, deps exist, no cycles, size cap. */
function validatePlan(plan, agentIds) {
  if (!Array.isArray(plan) || plan.length === 0) throw new Error('plan is empty');
  if (plan.length > MAX_TASKS) throw new Error(`plan has more than ${MAX_TASKS} tasks`);
  const ids = new Set();
  for (const t of plan) {
    if (!t.id || ids.has(t.id)) throw new Error(`duplicate or missing task id "${t.id}"`);
    if (!agentIds.has(t.agent)) throw new Error(`task "${t.id}" uses unknown agent "${t.agent}"`);
    if (typeof t.task !== 'string' || !t.task) throw new Error(`task "${t.id}" has no description`);
    ids.add(t.id);
    t.dependsOn = t.dependsOn || [];
  }
  for (const t of plan) {
    for (const d of t.dependsOn) {
      if (!ids.has(d)) throw new Error(`task "${t.id}" depends on unknown task "${d}"`);
    }
  }
  const done = new Set();
  let progressed = true;
  while (done.size < plan.length && progressed) {
    progressed = false;
    for (const t of plan) {
      if (!done.has(t.id) && t.dependsOn.every((d) => done.has(d))) {
        done.add(t.id);
        progressed = true;
      }
    }
  }
  if (done.size < plan.length) throw new Error('plan has a dependency cycle');
  return plan;
}

/**
 * Plan a goal with the Commander, then run specialists — independent tasks
 * in parallel, dependent tasks after their inputs finish.
 */
async function runGoal(goal, { provider, extraAgents = [], onEvent = () => {} }) {
  const agents = listAgents(extraAgents);
  const agentIds = new Set(agents.map((a) => a.id));
  const catalog = agents.map((a) => `- ${a.id}: ${a.description}`).join('\n');

  const planText = await provider.complete([
    {
      role: 'system',
      content:
        `You are the Commander. Break the goal into at most ${MAX_TASKS} tasks. Reply with ONLY a JSON array of ` +
        `{"id","agent","task","dependsOn":[ids]}. Available agents:\n${catalog}`,
    },
    { role: 'user', content: goal },
  ]);
  const plan = validatePlan(extractJson(planText), agentIds);
  onEvent({ type: 'plan', plan });

  const results = {};
  const pending = new Map(plan.map((t) => [t.id, t]));
  while (pending.size) {
    const ready = [...pending.values()].filter((t) => t.dependsOn.every((d) => d in results));
    await Promise.all(
      ready.map(async (t) => {
        pending.delete(t.id);
        const agent = agents.find((a) => a.id === t.agent);
        const inputs = t.dependsOn.map((d) => `Result of ${d}:\n${results[d]}`).join('\n\n');
        onEvent({ type: 'start', id: t.id, agent: t.agent });
        try {
          results[t.id] = await provider.complete([
            { role: 'system', content: agent.system },
            { role: 'user', content: inputs ? `${t.task}\n\n${inputs}` : t.task },
          ]);
          onEvent({ type: 'done', id: t.id });
        } catch (err) {
          results[t.id] = `ERROR: ${err.message}`;
          onEvent({ type: 'error', id: t.id, message: err.message });
        }
      })
    );
  }
  return { plan, results };
}

module.exports = { runGoal, validatePlan };
