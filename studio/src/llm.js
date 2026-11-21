// Client cho mọi provider tương thích OpenAI Chat Completions
// (DeepSeek, Gemini qua endpoint /openai, OpenRouter, MiMo, Groq, Ollama...).
// Đổi provider chỉ cần sửa LLM_BASE_URL / LLM_API_KEY / LLM_MODEL trong .env.

const BASE = (process.env.LLM_BASE_URL || '').replace(/\/+$/, '');
const KEY = process.env.LLM_API_KEY || '';
export const MODEL = process.env.LLM_MODEL || '';
export const JUDGE_MODEL = process.env.LLM_JUDGE_MODEL || MODEL;
// Suy luận (reasoning) làm chậm và tốn token mà không cần cho việc viết nội dung/chấm điểm.
// LLM_THINKING=disabled (mặc định) → gửi {"thinking":{"type":"disabled"}}; =enabled → bật; =off → không gửi tham số này.
const THINKING = (process.env.LLM_THINKING || 'disabled').toLowerCase();

export function llmConfigured() {
  return Boolean(BASE && KEY && MODEL);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Gọi chat completions. Thử lại khi 429/5xx/lỗi mạng (tối đa 3 lần).
 * json=true: xin response_format json_object; provider không hỗ trợ thì tự bỏ và thử lại.
 */
export async function chat({ model = MODEL, messages, maxTokens = 4000, temperature = 0.7, json = false, timeoutMs = 240000 }) {
  if (!llmConfigured()) throw new Error('Chưa cấu hình LLM_BASE_URL / LLM_API_KEY / LLM_MODEL trong .env');
  let useJsonMode = json;
  let useThinking = THINKING === 'disabled' || THINKING === 'enabled';
  let lastErr;
  // chạy song song nhiều lead → dễ gặp 429: thử lại tối đa 6 lần, chờ lâu dần + ngẫu nhiên để các lời gọi không cùng thử lại một lúc
  const backoff = (attempt, retryAfter) => sleep(retryAfter ? retryAfter * 1000 : Math.min(60000, 4000 * 2 ** (attempt - 1)) * (0.6 + Math.random() * 0.8));
  for (let attempt = 1; attempt <= 6; attempt++) {
    const body = { model, messages, temperature, max_tokens: maxTokens };
    if (useJsonMode) body.response_format = { type: 'json_object' };
    if (useThinking) body.thinking = { type: THINKING };
    try {
      const res = await fetch(`${BASE}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await res.text();
      if (!res.ok) {
        // Provider không hỗ trợ response_format → bỏ đi, thử lại ngay
        if (res.status === 400 && useThinking && /thinking/i.test(text)) { useThinking = false; continue; }
        if (res.status === 400 && useJsonMode && /response_format|json/i.test(text)) { useJsonMode = false; continue; }
        const err = new Error(`LLM HTTP ${res.status}: ${text.slice(0, 300)}`);
        if (res.status === 429 || res.status >= 500) { lastErr = err; await backoff(attempt, Number(res.headers.get('retry-after')) || 0); continue; }
        throw err;
      }
      const data = JSON.parse(text);
      const content = data.choices?.[0]?.message?.content ?? '';
      return {
        content,
        finishReason: data.choices?.[0]?.finish_reason,
        tokensIn: data.usage?.prompt_tokens ?? null,
        tokensOut: data.usage?.completion_tokens ?? null,
        // số token đầu vào trúng cache prompt của provider (OpenAI/MiMo: prompt_tokens_details.cached_tokens; DeepSeek: prompt_cache_hit_tokens)
        tokensCached: data.usage?.prompt_tokens_details?.cached_tokens ?? data.usage?.prompt_cache_hit_tokens ?? 0,
      };
    } catch (e) {
      if (e.message?.startsWith('LLM HTTP 4')) throw e;
      lastErr = e;
      if (attempt >= 4) break; // lỗi mạng / quá thời gian: tối đa 4 lần
      await backoff(attempt);
    }
  }
  throw lastErr;
}

/** Lấy object JSON từ câu trả lời (chịu được ```json ... ``` và chữ thừa xung quanh) */
export function parseJson(content) {
  const s = String(content).replace(/```(?:json)?/gi, '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('LLM không trả về JSON hợp lệ');
  return JSON.parse(s.slice(start, end + 1));
}
