export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.GEMINI_API_KEY) {
    return Response.json(
      { error: 'GEMINI_API_KEY is not configured on the server.' },
      { status: 500 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON request.' }, { status: 400 });
  }

  if (!body || !Array.isArray(body.contents)) {
    return Response.json({ error: 'Invalid AI request payload.' }, { status: 400 });
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
        'content-type': response.headers.get('content-type') || 'application/json',
        'cache-control': 'no-store'
      }
    });
  } catch (error) {
    return Response.json(
      { error: error?.message || 'Unable to reach Gemini.' },
      { status: 502 }
    );
  }
}
