// Cloudflare Pages Function — PostFile upload proxy
// Lives at /api/upload on your site. No CORS needed because it's same-origin.

const POSTFILE_API_KEY = 'pf_lyIGJBVbqHrpTE4qy8BLeJv6KxgJ4NoRzT_cXaz4cQs';
const POSTFILE_UPLOAD_URL = 'https://postfile.net/v1/upload';

export async function onRequestPost(context) {
  try {
    const incomingForm = await context.request.formData();
    const file = incomingForm.get('file');

    if (!file) {
      return new Response(JSON.stringify({ error: 'No file provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const outgoingForm = new FormData();
    outgoingForm.append('file', file, file.name || 'upload');

    const postfileRes = await fetch(POSTFILE_UPLOAD_URL, {
      method: 'POST',
      headers: { 'X-API-Key': POSTFILE_API_KEY },
      body: outgoingForm
    });

    const text = await postfileRes.text();

    return new Response(text, {
      status: postfileRes.status,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({
      error: 'Proxy error',
      message: err.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
