const ALLOWED_ORIGINS = new Set([
  'https://yasinaa2026-hash.github.io'
]);

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const headers = {
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'Content-Type',
    'access-control-max-age': '86400',
    'vary': 'Origin'
  };
  if (ALLOWED_ORIGINS.has(origin)) headers['access-control-allow-origin'] = origin;
  return headers;
}

function jsonResponse(body, status, request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

async function handleAI(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  if (request.method === 'GET') {
    return jsonResponse({ ok: true, service: 'codeyau-ai', message: 'AI backend is online.' }, 200, request);
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405, request);
  }

  if (!env.GEMINI_API_KEY) {
    return jsonResponse({ error: 'GEMINI_API_KEY is not configured on the Cloudflare Worker.' }, 500, request);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON request.' }, 400, request);
  }

  if (!body || !Array.isArray(body.contents) || body.contents.length === 0) {
    return jsonResponse({ error: 'Invalid AI request payload.' }, 400, request);
  }

  const model = typeof body.model === 'string' && /^[a-zA-Z0-9._-]+$/.test(body.model)
    ? body.model
    : 'gemini-3.6-flash';
  const { model: _ignoredModel, ...geminiBody } = body;
  const upstream = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;

  try {
    const response = await fetch(upstream, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(geminiBody)
    });
    const text = await response.text();
    return new Response(text, {
      status: response.status,
      headers: {
        ...corsHeaders(request),
        'content-type': response.headers.get('content-type') || 'application/json',
        'cache-control': 'no-store'
      }
    });
  } catch (error) {
    return jsonResponse({ error: error?.message || 'Unable to reach Gemini.' }, 502, request);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/ai') {
      return handleAI(request, env);
    }

    return env.ASSETS.fetch(request);
  }
};
