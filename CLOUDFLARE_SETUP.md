# Codeyau AI Backend Setup

Codeyau uses a Cloudflare Pages Function at `functions/api/ai.js` to keep the Gemini API key on the server.

## 1. Deploy the GitHub repository to Cloudflare Pages

In Cloudflare Dashboard:

1. Open **Workers & Pages**.
2. Choose **Create application** → **Pages** → **Import an existing Git repository**.
3. Select `yasinaa2026-hash/codeyau`.
4. Use the `main` branch for production.
5. For this static project, use build command `exit 0`.
6. Set the build output directory to the directory that contains the site's `index.html` (the repository root for Codeyau).
7. Deploy.

Cloudflare Pages automatically detects the top-level `functions/` directory and turns `functions/api/ai.js` into the `/api/ai` route.

## 2. Add the Gemini API key as a secret

Do **not** put the key inside `index.html`, `app.js`, or any file committed to GitHub.

In the Cloudflare project dashboard go to:

**Workers & Pages → your Codeyau project → Settings → Variables and Secrets → Add**

Create a secret with:

- **Name:** `GEMINI_API_KEY`
- **Value:** your Gemini API key
- Enable **Encrypt** / create it as a **Secret**.

Save it for the **Production** environment. If you use preview deployments, add the secret to Preview too.

## 3. Test the backend

After deployment, open:

`https://YOUR-CODEYAU-DOMAIN/api/ai`

A working backend returns JSON similar to:

```json
{
  "ok": true,
  "service": "codeyau-ai",
  "message": "AI backend is online."
}
```

Then open Codeyau and send an AI message.

## Important

GitHub Pages (`github.io`) is static hosting and does not execute the `functions/` directory. The AI endpoint must therefore run from the Cloudflare Pages deployment (or another backend that supports server-side functions).

The Gemini API key should remain a Cloudflare Secret so it is not exposed to visitors or committed to the public repository.
