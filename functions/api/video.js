// Cloudflare Pages Function — video proxy
// Fetches the video from PostFile and re-serves it with the correct
// Content-Type: video/mp4 header so browsers can play it inline.

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

  // Forward the Range header so seeking works
  const rangeHeader = context.request.headers.get('Range');
  const fetchHeaders = {};
  if (rangeHeader) fetchHeaders['Range'] = rangeHeader;

  const postfileRes = await fetch(videoUrl, { headers: fetchHeaders });

  if (!postfileRes.ok && postfileRes.status !== 206) {
    return new Response('Failed to fetch video', { status: postfileRes.status });
  }

  const responseHeaders = new Headers(postfileRes.headers);
  // Force the correct content type so browsers will play it
  responseHeaders.set('Content-Type', 'video/mp4');
  responseHeaders.set('Accept-Ranges', 'bytes');
  responseHeaders.set('Access-Control-Allow-Origin', '*');
  // Let the browser cache the video for a while
  responseHeaders.set('Cache-Control', 'public, max-age=86400');

  return new Response(postfileRes.body, {
    status: postfileRes.status,
    headers: responseHeaders
  });
}
