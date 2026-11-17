// Cloudflare Pages Function — video proxy with proper range request handling
// iOS Safari requires 206 Partial Content responses for video playback.

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const videoUrl = url.searchParams.get('url');

  if (!videoUrl) {
    return new Response('Missing url parameter', { status: 400 });
  }

  // Security: only proxy videos from PostFile's CDN
  if (!videoUrl.startsWith('https://cdn.postfile.download/')) {
    return new Response('Invalid video URL', { status: 403 });
  }

  // Forward the Range header from the client (Safari sends this)
  const rangeHeader = context.request.headers.get('Range');

  const fetchHeaders = {};
  if (rangeHeader) {
    fetchHeaders['Range'] = rangeHeader;
  }

  // Fetch from PostFile with the same Range header
  const postfileRes = await fetch(videoUrl, { headers: fetchHeaders });

  // Get the raw body as an ArrayBuffer so we can set Content-Length correctly
  const body = await postfileRes.arrayBuffer();

  // Build response headers
  const responseHeaders = new Headers();

  // Copy important headers from PostFile's response
  const contentType = postfileRes.headers.get('Content-Type') || 'video/mp4';
  responseHeaders.set('Content-Type', 'video/mp4'); // Force correct type
  responseHeaders.set('Accept-Ranges', 'bytes');
  responseHeaders.set('Access-Control-Allow-Origin', '*');

  // Handle partial content (206) vs full content (200)
  const contentRange = postfileRes.headers.get('Content-Range');
  if (contentRange) {
    responseHeaders.set('Content-Range', contentRange);
    responseHeaders.set('Content-Length', body.byteLength.toString());
    return new Response(body, {
      status: 206,  // ← This is the critical fix for Safari
      headers: responseHeaders
    });
  } else {
    responseHeaders.set('Content-Length', body.byteLength.toString());
    return new Response(body, {
      status: 200,
      headers: responseHeaders
    });
  }
}
