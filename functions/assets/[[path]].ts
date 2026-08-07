// Cloudflare-Pages-Function für alle Anfragen unter /assets/*.
//
// Hintergrund: public/_redirects enthält den SPA-Fallback "/* /index.html 200".
// Der greift auch für Asset-URLs. Fordert ein Client nach einem Deploy einen
// Chunk an, den es nicht mehr gibt – oder der am Edge noch nicht propagiert ist –
// dann antwortet Pages nicht mit 404, sondern mit der index.html:
//
//   HTTP/1.1 200 OK
//   Content-Type: text/html; charset=utf-8
//   Cache-Control: public, max-age=14400, must-revalidate
//
// Der dynamische Import scheitert dadurch mit "error loading dynamically
// imported module" – und weil es eine 200-Antwort ist, speichern Browser,
// Firmen-Proxys und der Cloudflare-Edge sie stundenlang unter der Chunk-URL.
// Danach hilft auch ein normaler Reload nicht mehr, nur noch Strg+Shift+R.
//
// Unter /assets/ ist HTML deshalb immer ein Fehler. Wir machen daraus einen
// echten 404, den kein Cache aufbewahren darf.

interface AssetRequestContext {
  request: Request;
  next: () => Promise<Response>;
}

// Die Dateinamen unter /assets/ enthalten alle einen Content-Hash, ein neuer
// Build erzeugt also neue URLs. Damit ist unbegrenztes Caching gefahrlos.
const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";

export async function onRequest(context: AssetRequestContext): Promise<Response> {
  const response = await context.next();
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("text/html")) {
    const { pathname } = new URL(context.request.url);
    return new Response(`Asset nicht gefunden: ${pathname}\n`, {
      status: 404,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        // Entscheidend: Diese Antwort darf nirgends hängenbleiben, damit der
        // nächste Versuch das inzwischen deployte Asset erreicht.
        "cache-control": "no-store, must-revalidate",
      },
    });
  }

  if (!response.ok) {
    return response;
  }

  // _headers gilt nicht für Function-Antworten, die Cache-Header setzen wir
  // deshalb hier.
  const headers = new Headers(response.headers);
  headers.set("cache-control", IMMUTABLE_CACHE_CONTROL);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
