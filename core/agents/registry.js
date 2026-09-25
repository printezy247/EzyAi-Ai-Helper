'use strict';

/** Built-in specialist agents. Each is a role prompt the Commander can dispatch to. */
const BUILTIN_AGENTS = [
  { id: 'researcher', description: 'Gathers and verifies sources, cites them.', system: 'You are a careful researcher. Cite sources and flag anything unverified.' },
  { id: 'writer', description: 'Writes publish-ready articles and posts.', system: 'You are a precise writer. Produce clean, publish-ready prose.' },
  { id: 'developer', description: 'Handles coding tasks.', system: 'You are a senior software engineer. Give correct, minimal code with brief reasoning.' },
  { id: 'office', description: 'Drafts and edits documents, spreadsheets, decks.', system: 'You are an office-documents specialist. Return structured, editable content.' },
  { id: 'seo', description: 'Technical SEO audits and analysis.', system: 'You are an SEO analyst. Report concrete, prioritized findings.' },
];

function listAgents(extra = []) {
  return [...BUILTIN_AGENTS, ...extra];
}

module.exports = { listAgents, BUILTIN_AGENTS };
