import { GEMINI_API_BASE_URL, GEMINI_MODEL, GEMINI_MAX_CONTEXT } from '../core/constants.js';

export class GeminiAssistant {
  constructor({ enabled = true, logger }) {
    this.enabled = enabled;
    this.logger = logger;
    this.history = [];
  }

  addContextMessage(role, text) {
    if (!text) return;
    this.history.push({ role, text, ts: Date.now() });
    if (this.history.length > GEMINI_MAX_CONTEXT) {
      this.history = this.history.slice(-GEMINI_MAX_CONTEXT);
    }
  }

  isAvailable() {
    return this.enabled && Boolean(process.env.GEMINI_API_KEY);
  }

  async ask(userQuery, extraContext = []) {
    if (!this.enabled) {
      return { ok: false, reason: 'ai_disabled' };
    }

    if (!process.env.GEMINI_API_KEY) {
      return { ok: false, reason: 'missing_gemini_api_key' };
    }

    const context = [...this.history, ...extraContext]
      .slice(-GEMINI_MAX_CONTEXT)
      .map((x) => `${x.role}: ${x.text}`)
      .join('\n');

    const prompt = [
      'You are Archipel assistant for an offline-first P2P app.',
      'Answer concisely in French.',
      context ? `Conversation context:\n${context}` : '',
      `User question: ${userQuery}`,
    ].filter(Boolean).join('\n\n');

    try {
      const url = `${GEMINI_API_BASE_URL}/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
        }),
      });

      if (!res.ok) {
        return { ok: false, reason: `gemini_http_${res.status}` };
      }

      const json = await res.json();
      const text = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (!text) return { ok: false, reason: 'gemini_empty_response' };

      this.addContextMessage('user', userQuery);
      this.addContextMessage('assistant', text);
      return { ok: true, text };
    } catch (err) {
      this.logger?.warn?.(`Gemini query failed: ${err.message}`);
      return { ok: false, reason: 'gemini_unreachable' };
    }
  }
}
