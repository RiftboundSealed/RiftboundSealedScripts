import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

import { fetchJsonWithTimeout } from "../util/helpers";
import type { CardData, ReturnData } from "../util/types";

// ---- Config (env) ----
const CDN_BASE_URL = mustGetEnv("CDN_BASE_URL").replace(/\/+$/, "");
const CHECK_BASE_URL = (process.env.CHECK_BASE_URL ?? CDN_BASE_URL).replace(/\/+$/, "");

const SPACES_BUCKET = mustGetEnv("SPACES_BUCKET");
const SPACES_ENDPOINT_URL = mustGetEnv("SPACES_ENDPOINT_URL").replace(/\/+$/, "");

const PAGE_SIZE = 100;
const API_TIMEOUT_MS = 60_000;
const HEAD_TIMEOUT_MS = 10_000;
const DOWNLOAD_TIMEOUT_MS = 60_000;
const CONCURRENCY = 4;

// ---- Public entrypoint ----
export async function syncCardsPage(page: number): Promise<void> {
  if (!Number.isInteger(page) || page < 1) {
    throw new Error(`"page" must be an integer >= 1. Got: ${page}`);
  }

  const url = `https://api.riftcodex.com/cards?sort=public_code&dir=1&page=${page}&size=${PAGE_SIZE}`;
  console.log(`Fetching: ${url}`);

  const data = await fetchJsonWithTimeout<ReturnData>(url, API_TIMEOUT_MS);

  console.log(
    `Fetched page ${data.page}/${data.pages} | items=${data.items.length} | total=${data.total}`,
  );

  const tmpDir = path.join(os.tmpdir(), "riftbound-card-sync");
  await mkdir(tmpDir, { recursive: true });

  await mapLimit(data.items, CONCURRENCY, async (card, idx) => {
    const cardId = toCardId(card);
    if (!cardId) {
      console.warn(`Index [${idx}] - Skipping: ${card.public_code} - missing or malformed set_id/public_code`);
      return;
    }

    const objectKey = `cards/${cardId}.webp`;
    const checkUrl = `${CHECK_BASE_URL}/${objectKey}`;

    const exists = await headExists(checkUrl, HEAD_TIMEOUT_MS);
    if (exists) {
      console.log(`Index [${idx}] - Exists: ${cardId}`);
      return;
    }

    const imageUrl = card.media?.image_url ?? null;
    if (!imageUrl) {
      console.warn(`Index [${idx}] - Missing image_url for ${cardId} — skipping`);
      return;
    }

    console.log(`Index [${idx}] - Downloading: ${cardId} from ${imageUrl}`);
    const original = await downloadToBuffer(imageUrl, DOWNLOAD_TIMEOUT_MS);

    // Convert to webp so the folder structure stays consistent (i.e. OGN-001.webp)
    const webp = await sharp(original).webp({ quality: 85 }).toBuffer();

    const filePath = path.join(os.tmpdir(), `riftbound-${cardId}-${crypto.randomUUID()}.webp`);
    await writeFile(filePath, webp);

    try {
      console.log(`Index [${idx}] - Uploading: s3://${SPACES_BUCKET}/${objectKey}`);
      await awsS3Cp({
        filePath,
        bucket: SPACES_BUCKET,
        key: objectKey,
        endpointUrl: SPACES_ENDPOINT_URL,
        contentType: "image/webp",
        cacheControl: "public, max-age=31536000, immutable",
      });
      console.log(`Index [${idx}] - Uploaded: ${cardId} -> ${CDN_BASE_URL}/${objectKey}`);
    } finally {
      await rm(filePath, { force: true }).catch(() => {});
    }

  });
}

// ---- Helpers ----

function toCardId(card: CardData): string | null {
  const splits = card.public_code?.split("/") ?? [];
  if (splits.length > 2) return null;

  const cardId = splits[0];
  // Card ids with "*" indicate a signature, though in our card/CDN IDs, we will use "s".
  const finalCardId = cardId?.replace("*", "s") || null;

  return finalCardId;
}

async function headExists(url: string, timeoutMs: number): Promise<boolean> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { method: "HEAD", signal: controller.signal });
    if (res.status === 200) return true;
    if (res.status === 404) return false;

    // For anything else (403/5xx/etc), treat as "unknown" and log it.
    console.warn(`HEAD ${url} -> ${res.status} (treating as missing)`);
    return false;
  } catch (e) {
    console.warn(`HEAD ${url} failed (treating as missing): ${(e as Error).message}`);
    return false;
  } finally {
    clearTimeout(t);
  }
}

async function downloadToBuffer(url: string, timeoutMs: number): Promise<Buffer> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      const body = await safeText(res);
      throw new Error(`Download failed ${res.status} ${res.statusText}: ${body}`);
    }
    const arrayBuf = await res.arrayBuffer();
    return Buffer.from(arrayBuf);
  } finally {
    clearTimeout(t);
  }
}

async function awsS3Cp(args: {
  filePath: string;
  bucket: string;
  key: string;
  endpointUrl: string;
  contentType: string;
  cacheControl: string;
}): Promise<void> {
  const {
    filePath,
    bucket,
    key,
    endpointUrl,
    contentType,
    cacheControl,
  } = args;

  // Upload images in public-read.
  const cmdArgs = [
    "--endpoint-url",
    endpointUrl,
    "s3",
    "cp",
    filePath,
    `s3://${bucket}/${key}`,
    "--acl",
    "public-read",
    "--content-type",
    contentType,
    "--cache-control",
    cacheControl,
  ];

  await spawnAsync("aws", cmdArgs);
}

function spawnAsync(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit" });

    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code === 0) return resolve();
      reject(new Error(`${cmd} exited with code ${code}`));
    });
  });
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "<unreadable body>";
  }
}

function mustGetEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

/**
 * Simple concurrency limiter (no dependency)
 */
async function mapLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  const executing = new Set<Promise<void>>();

  for (let i = 0; i < items.length; i++) {
    const p = (async () => fn(items[i]!, i))();
    executing.add(p);

    const cleanup = () => executing.delete(p);
    p.then(cleanup, cleanup);

    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
}

// ---- CLI runner ----
const pageArgIdx = process.argv.indexOf("--page");
const pageStr = pageArgIdx >= 0 ? process.argv[pageArgIdx + 1] : undefined;

if (!pageStr) {
  console.error("Usage: npx tsx scripts/upload-card-images.ts --page <number>");
  process.exit(1);
}

const page = Number(pageStr);
syncCardsPage(page).catch((err) => {
  console.error(err);
  process.exit(1);
});
