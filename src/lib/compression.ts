function bytesToStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

/**
 * gzip-Kompression für JSON-serialisierbare Werte, genutzt zur kompakten
 * IndexedDB-Ablage roher RVTools-Sheet-Daten (siehe `RawSheetBlob`).
 */
export async function gzipJson(value: unknown): Promise<ArrayBuffer> {
  const json = JSON.stringify(value);
  const bytes = new TextEncoder().encode(json);
  const stream = bytesToStream(bytes).pipeThrough(new CompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}

export async function gunzipJson<T>(buffer: ArrayBuffer): Promise<T> {
  const stream = bytesToStream(new Uint8Array(buffer)).pipeThrough(new DecompressionStream("gzip"));
  const json = await new Response(stream).text();
  return JSON.parse(json) as T;
}
