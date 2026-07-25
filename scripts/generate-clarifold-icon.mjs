import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { inflateSync } from "node:zlib";

const execFileAsync = promisify(execFile);
const rootDirectory = process.cwd();
const sourcePath = join(rootDirectory, "docs", "brand", "icon-candidates", "learning-trail.png");
const assetDirectory = join(rootDirectory, "src", "renderer", "src", "assets");
const iconsetDirectory = join(assetDirectory, "Clarifold.iconset");
const rendererIconPath = join(assetDirectory, "clarifold-icon.png");
const nativeIconPath = join(assetDirectory, "Clarifold.icns");
const manifestPath = join(assetDirectory, "clarifold-icon-manifest.json");
const iconSizes = [16, 32, 64, 128, 256, 512, 1024];
const iconsetEntries = [
  ["icon_16x16.png", 16],
  ["icon_16x16@2x.png", 32],
  ["icon_32x32.png", 32],
  ["icon_32x32@2x.png", 64],
  ["icon_128x128.png", 128],
  ["icon_128x128@2x.png", 256],
  ["icon_256x256.png", 256],
  ["icon_256x256@2x.png", 512],
  ["icon_512x512.png", 512],
  ["icon_512x512@2x.png", 1024]
];

export async function readIconManifest(rootDirectory = process.cwd()) {
  return JSON.parse(await readFile(join(rootDirectory, "src", "renderer", "src", "assets", "clarifold-icon-manifest.json"), "utf8"));
}

export async function validateClarifoldIconAssets(rootDirectory = process.cwd()) {
  const manifest = await readIconManifest(rootDirectory);
  const assetDirectory = join(rootDirectory, "src", "renderer", "src", "assets");
  const sourcePath = join(rootDirectory, manifest.source);
  const rendererIconPath = join(assetDirectory, manifest.rendererAsset);
  const nativeIconPath = join(assetDirectory, manifest.nativeAsset);
  const iconsetDirectory = join(assetDirectory, manifest.iconsetDirectory);
  const sourceDigest = createHash("sha256").update(await readFile(sourcePath)).digest("hex");
  if (sourceDigest !== manifest.sourceSha256) {
    throw new Error(`Clarifold icon source digest changed; regenerate ${relative(rootDirectory, assetDirectory)}.`);
  }
  for (const [fileName, size] of iconsetEntries) {
    const path = join(iconsetDirectory, fileName);
    await stat(path);
    const dimensions = await imageDimensions(path);
    if (dimensions !== `${size}x${size}`) throw new Error(`${relative(rootDirectory, path)} is ${dimensions}; expected ${size}x${size}.`);
  }
  await stat(rendererIconPath);
  await stat(nativeIconPath);
  const rendererDimensions = await imageDimensions(rendererIconPath);
  if (rendererDimensions !== "1024x1024") throw new Error(`${relative(rootDirectory, rendererIconPath)} is ${rendererDimensions}; expected 1024x1024.`);
  const rendererSignature = await imageSignature(rendererIconPath);
  const iconsetSignature = await imageSignature(join(iconsetDirectory, "icon_512x512@2x.png"));
  if (rendererSignature !== iconsetSignature) throw new Error("The renderer icon does not match the generated 1024 px macOS source.");
  await validateTransparentCorner(rendererIconPath);
  await validateIcns(nativeIconPath, iconsetDirectory);
  return manifest;
}

async function generate() {
  const sourceSha256 = createHash("sha256").update(await readFile(sourcePath)).digest("hex");
  await rm(iconsetDirectory, { recursive: true, force: true });
  await mkdir(iconsetDirectory, { recursive: true });
  for (const [fileName, size] of iconsetEntries) {
    await renderIcon(size, join(iconsetDirectory, fileName));
  }
  await renderIcon(1024, rendererIconPath);
  await execFileAsync("iconutil", ["--convert", "icns", "--output", nativeIconPath, iconsetDirectory]);
  const manifest = {
    source: "docs/brand/icon-candidates/learning-trail.png",
    sourceSha256,
    generatedBy: "scripts/generate-clarifold-icon.mjs",
    rendererAsset: "clarifold-icon.png",
    nativeAsset: "Clarifold.icns",
    iconsetDirectory: "Clarifold.iconset",
    sizes: iconSizes,
    mask: "The selected source is retained while its opaque rounded tile is converted to a transparent outside edge for macOS mask handling."
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

async function renderIcon(size, outputPath) {
  await execFileAsync("magick", [
    sourcePath,
    "-alpha", "on",
    "-gravity", "center",
    "-crop", "1254x1254+0+0", "+repage",
    "(", "-size", "1254x1254", "xc:none", "-fill", "white",
    "-draw", "roundrectangle 0,0 1253,1253 200,200", ")",
    "-compose", "CopyOpacity", "-composite",
    "-resize", `${size}x${size}!`,
    `PNG32:${outputPath}`
  ]);
}

async function imageDimensions(path) {
  const { width, height } = await readPngRgba(path);
  return `${width}x${height}`;
}

async function imageSignature(path) {
  const { pixels } = await readPngRgba(path);
  return createHash("sha256").update(pixels).digest("hex");
}

async function validateTransparentCorner(path) {
  const { pixels } = await readPngRgba(path);
  if (pixels[3] !== 0) throw new Error(`${relative(rootDirectory, path)} must retain a transparent outside corner.`);
}

async function readPngRgba(path) {
  const input = await readFile(path);
  if (input.subarray(0, 8).compare(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) !== 0) {
    throw new Error(`${relative(rootDirectory, path)} is not a PNG.`);
  }
  let offset = 8;
  let width;
  let height;
  let bitDepth;
  let colorType;
  const compressedRows = [];
  while (offset < input.length) {
    const length = input.readUInt32BE(offset);
    const type = input.toString("ascii", offset + 4, offset + 8);
    const data = input.subarray(offset + 8, offset + 8 + length);
    offset += length + 12;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      compressedRows.push(data);
    } else if (type === "IEND") {
      break;
    }
  }
  if (width === undefined || height === undefined || bitDepth !== 8 || colorType !== 6) {
    throw new Error(`${relative(rootDirectory, path)} must be an 8-bit RGBA PNG.`);
  }
  const rowLength = width * 4;
  const compressed = inflateSync(Buffer.concat(compressedRows));
  const pixels = Buffer.alloc(height * rowLength);
  let sourceOffset = 0;
  for (let rowIndex = 0; rowIndex < height; rowIndex += 1) {
    const filter = compressed[sourceOffset++];
    const row = Buffer.from(compressed.subarray(sourceOffset, sourceOffset + rowLength));
    sourceOffset += rowLength;
    const previous = rowIndex === 0 ? null : pixels.subarray((rowIndex - 1) * rowLength, rowIndex * rowLength);
    unfilterRow(row, previous, filter);
    row.copy(pixels, rowIndex * rowLength);
  }
  return { width, height, pixels };
}

function unfilterRow(row, previous, filter) {
  for (let index = 0; index < row.length; index += 1) {
    const left = index >= 4 ? row[index - 4] : 0;
    const above = previous?.[index] ?? 0;
    const upperLeft = index >= 4 ? previous?.[index - 4] ?? 0 : 0;
    if (filter === 1) row[index] = (row[index] + left) & 0xff;
    else if (filter === 2) row[index] = (row[index] + above) & 0xff;
    else if (filter === 3) row[index] = (row[index] + Math.floor((left + above) / 2)) & 0xff;
    else if (filter === 4) row[index] = (row[index] + paethPredictor(left, above, upperLeft)) & 0xff;
    else if (filter !== 0) throw new Error(`Unsupported PNG row filter: ${filter}.`);
  }
}

function paethPredictor(left, above, upperLeft) {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  if (aboveDistance <= upperLeftDistance) return above;
  return upperLeft;
}

async function validateIcns(path, expectedIconsetDirectory) {
  const temporaryDirectory = await mkdtemp(join(dirname(path), ".clarifold-icon-check-"));
  try {
    const extractedDirectory = join(temporaryDirectory, "Clarifold.iconset");
    await execFileAsync("iconutil", ["--convert", "iconset", "--output", extractedDirectory, path]);
    const actual = (await readdir(extractedDirectory)).sort();
    const expected = (await readdir(expectedIconsetDirectory)).sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("Clarifold.icns does not contain the committed iconset sizes.");
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--check")) {
    await validateClarifoldIconAssets();
    console.log("Clarifold icon assets are current and contain all macOS sizes.");
  } else {
    await generate();
    await validateClarifoldIconAssets();
    console.log("Generated the Clarifold Learning Trail renderer and macOS icon assets.");
  }
}
