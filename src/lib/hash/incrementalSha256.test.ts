import { describe, expect, it } from "vitest";
import { IncrementalSha256 } from "@/lib/hash/incrementalSha256";
import { computeChecksum } from "@/lib/xlsx/parseHelpers";

function hashInChunks(bytes: Uint8Array, chunkSize: number): string {
  const hash = new IncrementalSha256();
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    hash.update(bytes.subarray(offset, offset + chunkSize));
  }
  return hash.digestHex();
}

function bytesOf(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe("IncrementalSha256", () => {
  it("entspricht den bekannten SHA-256-Testvektoren", async () => {
    const empty = new IncrementalSha256();
    expect(empty.digestHex()).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");

    const abc = new IncrementalSha256();
    abc.update(bytesOf("abc"));
    expect(abc.digestHex()).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("liefert für jede Chunk-Aufteilung denselben Digest wie crypto.subtle", async () => {
    // Deckt Blockgrenzen (64 Byte) und die Sonderfälle der Längenkodierung ab.
    const lengths = [0, 1, 55, 56, 57, 63, 64, 65, 119, 120, 128, 1000];
    for (const length of lengths) {
      const bytes = new Uint8Array(length);
      for (let index = 0; index < length; index += 1) bytes[index] = (index * 31 + 7) % 256;

      const expected = await computeChecksum(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      );
      for (const chunkSize of [1, 7, 64, 100, Math.max(length, 1)]) {
        expect(hashInChunks(bytes, chunkSize), `Länge ${length}, Chunk ${chunkSize}`).toBe(expected);
      }
    }
  });

  it("verweigert Weiterverwendung nach dem Abschluss", () => {
    const hash = new IncrementalSha256();
    hash.update(bytesOf("x"));
    hash.digestHex();

    expect(() => hash.update(bytesOf("y"))).toThrow(/bereits abgeschlossen/);
    expect(() => hash.digestHex()).toThrow(/bereits abgeschlossen/);
  });
});
