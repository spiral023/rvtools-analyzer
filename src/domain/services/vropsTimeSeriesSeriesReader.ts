import type { VropsTimeSeriesChunk, VropsTimeSeriesMetricKey } from "@/domain/models/types";

const HOUR_MS = 60 * 60 * 1000;
const objectIndexes = new WeakMap<VropsTimeSeriesChunk, Map<string, number>>();

/** Liest eine Metrik einmalig aus den kompakten Object×Hour-Blöcken; Objektindizes werden pro Chunk gecacht. */
export function readVropsTimeSeriesMetric(
  chunks: readonly VropsTimeSeriesChunk[],
  objectKey: string,
  metric: VropsTimeSeriesMetricKey,
): Map<number, number> {
  const valuesByTimestamp = new Map<number, number>();
  for (const chunk of chunks) {
    const objectIndex = getObjectIndex(chunk, objectKey);
    const buffer = chunk.metricValues[metric];
    if (objectIndex === undefined || !buffer) continue;
    const values = new Float32Array(buffer);
    for (let slot = 0; slot < chunk.slotCount; slot += 1) {
      valuesByTimestamp.set(chunk.startUtc + slot * HOUR_MS, values[objectIndex * chunk.slotCount + slot]);
    }
  }
  return valuesByTimestamp;
}

function getObjectIndex(chunk: VropsTimeSeriesChunk, objectKey: string): number | undefined {
  let index = objectIndexes.get(chunk);
  if (!index) {
    index = new Map(chunk.objectKeys.map((key, position) => [key, position]));
    objectIndexes.set(chunk, index);
  }
  return index.get(objectKey);
}
