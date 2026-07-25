import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

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
  const { stdout } = await execFileAsync("magick", ["identify", "-format", "%wx%h", path]);
  return stdout.trim();
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
