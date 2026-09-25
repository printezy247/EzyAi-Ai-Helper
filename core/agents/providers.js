'use strict';

/**
 * Model providers. Two wire formats cover almost everything:
 *  - "openai": /v1/chat/completions (OpenAI, Ollama, llama-server, NeuraOS)
 *  - "anthropic": /v1/messages
 * API keys are read from the environment only, never stored in app files.
 */

function createProvider({ kind = 'openai', baseUrl, model, apiKeyEnv, fetchImpl = fetch }) {
  const apiKey = apiKeyEnv ? process.env[apiKeyEnv] : undefined;

  async function complete(messages) {
    if (kind === 'anthropic') {
      const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
      const res = await fetchImpl(`${baseUrl || 'https://api.anthropic.com'}/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey || '',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          system,
          messages: messages.filter((m) => m.role !== 'system'),
        }),
      });
      if (!res.ok) throw new Error(`anthropic provider HTTP ${res.status}`);
      const data = await res.json();
      return (data.content || []).map((b) => b.text || '').join('');
    }

    const res = await fetchImpl(`${baseUrl || 'https://api.openai.com'}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({ model, messages }),
    });
    if (!res.ok) throw new Error(`openai-compatible provider HTTP ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? '';
  }

  return { complete };
}

module.exports = { createProvider };
