function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = [
    'https://yasinaa2026-hash.github.io',
    'http://localhost:8788',
    'http://127.0.0.1:8788'
  ];

  return {
    'access-control-allow-origin': allowed.includes(origin) ? origin : 'null',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'Content-Type',
    'access-control-max-age': '86400',
    'vary': 'Origin'
  };
}

function jsonWithCors(body, init, request) {
  return Response.json(body, {
    ...init,
    headers: {
      ...corsHeaders(request),
      ...(init?.headers || {})
    }
  });
}

export async function onRequestOptions(context) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(context.request)
  });
}

export async function onRequestGet(context) {
  return jsonWithCors(
    { ok: true, service: 'codeyau-ai', message: 'AI backend is online.' },
    { status: 200 },
    context.request
  );
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.GEMINI_API_KEY) {
    return jsonWithCors(
      { error: 'GEMINI_API_KEY is not configured on the server.' },
      { status: 500 },
      request
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonWithCors({ error: 'Invalid JSON request.' }, { status: 400 }, request);
  }

  if (!body || !Array.isArray(body.contents) || body.contents.length === 0) {
    return jsonWithCors({ error: 'Invalid AI request payload.' }, { status: 400 }, request);
  }

  const model = typeof body.model === 'string' && /^[a-zA-Z0-9._-]+$/.test(body.model)
    ? body.model
    : 'gemini-3.6-flash';

  const upstream = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;
  const { model: _ignoredModel, ...geminiBody } = body;

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
    return jsonWithCors(
      { error: error?.message || 'Unable to reach Gemini.' },
      { status: 502 },
      request
    );
  }
}
