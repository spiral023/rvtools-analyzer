import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const SOURCE = "public/favicon-master.png";
const OUT_DIR = "public/icons";
const BACKGROUND = "#0d0f12";

async function generate() {
  await mkdir(OUT_DIR, { recursive: true });

  await sharp(SOURCE).resize(192, 192).toFile(`${OUT_DIR}/pwa-192x192.png`);
  await sharp(SOURCE).resize(512, 512).toFile(`${OUT_DIR}/pwa-512x512.png`);

  // Maskable-Icon braucht eine Safe Zone (~80% sichtbarer Inhalt, Rest
  // Hintergrundfarbe statt Transparenz), sonst schneiden Android-Launcher
  // das Motiv beim Masken zu stark an.
  const canvasSize = 512;
  const contentSize = Math.round(canvasSize * 0.8);
  const resizedContent = await sharp(SOURCE).resize(contentSize, contentSize).toBuffer();
  await sharp({
    create: {
      width: canvasSize,
      height: canvasSize,
      channels: 4,
      background: BACKGROUND,
    },
  })
    .composite([{ input: resizedContent, gravity: "center" }])
    .png()
    .toFile(`${OUT_DIR}/pwa-512x512-maskable.png`);

  console.log(`PWA-Icons erzeugt in ${OUT_DIR}/`);
}

generate().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
