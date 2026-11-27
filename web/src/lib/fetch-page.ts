import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_BYTES = 3_000_000;
const MAX_TEXT_CHARS = 60_000;
const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 15_000;

/** Sites that need a login or block servers: ask for screenshots or pasted text instead. */
const LOGIN_WALLED = ["instagram.com", "tiktok.com", "facebook.com", "fb.watch", "threads.net", "pinterest.com"];

export class FetchPageError extends Error {}

export type FetchedPage = {
  url: string;
  title: string;
  /** schema.org Recipe objects found in the page's JSON-LD, if any. */
  recipeJsonLd: unknown[];
  /** Visible page text (shortened). */
  text: string;
  /** The recipe's photo from JSON-LD or the page's og:image, if any. */
  imageUrl: string | null;
};

export function isLoginWalled(url: string): boolean {
  const host = new URL(url).hostname.toLowerCase();
  return LOGIN_WALLED.some((d) => host === d || host.endsWith(`.${d}`));
}

function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v.startsWith("::ffff:")) return isPrivateAddress(v.slice(7));
    return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

/** Refuses URLs that point at the server's own network (localhost, private IPs). */
async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new FetchPageError("Das ist kein gültiger Link.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new FetchPageError("Nur http- und https-Links werden unterstützt.");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (addresses.length === 0) throw new FetchPageError("Die Website wurde nicht gefunden.");
  if (addresses.some(isPrivateAddress)) throw new FetchPageError("Dieser Link ist nicht erlaubt.");
  return url;
}

/**
 * Reads at most `limit` bytes. If the body is larger, returns the first `limit` bytes
 * when `truncate` is set, otherwise null.
 */
async function readBytes(res: Response, limit: number, truncate = false): Promise<Uint8Array | null> {
  if (!res.body) return new Uint8Array();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      if (!truncate) return null;
      chunks.push(value.subarray(0, value.byteLength - (total - limit)));
      break;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** GET request that refuses internal addresses, also after each redirect. */
async function safeFetch(rawUrl: string, accept: string): Promise<{ res: Response; url: URL }> {
  let url = await assertPublicUrl(rawUrl);
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; RecipeBook/1.0)",
          accept,
          "accept-language": "de,en;q=0.8",
        },
      });
    } catch {
      throw new FetchPageError("Die Seite konnte nicht geladen werden.");
    }
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      url = await assertPublicUrl(new URL(location, url).toString());
      continue;
    }
    return { res, url };
  }
  throw new FetchPageError("Zu viele Weiterleitungen.");
}

function absoluteHttpUrl(value: unknown, base: string): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const u = new URL(decodeEntities(value.trim()), base);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** schema.org "image" can be a string, an ImageObject or a list of either. */
function jsonLdImage(image: unknown, base: string): string | null {
  if (Array.isArray(image)) {
    for (const item of image) {
      const found = jsonLdImage(item, base);
      if (found) return found;
    }
    return null;
  }
  if (image && typeof image === "object") return absoluteHttpUrl((image as Record<string, unknown>).url, base);
  return absoluteHttpUrl(image, base);
}

function metaContent(html: string, property: string): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const name = tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1];
    if (name?.toLowerCase() === property) return tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1] ?? null;
  }
  return null;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

function findRecipes(node: unknown, out: unknown[]) {
  if (Array.isArray(node)) {
    node.forEach((n) => findRecipes(n, out));
  } else if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    const type = obj["@type"];
    if (type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"))) out.push(obj);
    else if (obj["@graph"]) findRecipes(obj["@graph"], out);
  }
}

export function parseHtml(html: string, url: string): FetchedPage {
  const recipeJsonLd: unknown[] = [];
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      findRecipes(JSON.parse(m[1].trim()), recipeJsonLd);
    } catch {
      // Ignore broken JSON-LD blocks.
    }
  }

  const title = decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "");
  const text = decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|template|iframe)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<\/(p|div|li|h[1-6]|tr|br|section|article)>|<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim()
    .slice(0, MAX_TEXT_CHARS);

  const imageUrl =
    recipeJsonLd.map((r) => jsonLdImage((r as Record<string, unknown>).image, url)).find(Boolean) ??
    absoluteHttpUrl(metaContent(html, "og:image"), url) ??
    absoluteHttpUrl(metaContent(html, "twitter:image"), url);

  return { url, title, recipeJsonLd, text, imageUrl };
}

/** Downloads a public web page (following a few redirects) and extracts recipe data and text. */
export async function fetchPage(rawUrl: string): Promise<FetchedPage> {
  const { res, url } = await safeFetch(rawUrl, "text/html,application/xhtml+xml");
  if (!res.ok) throw new FetchPageError(`Die Seite antwortet mit Fehler ${res.status}.`);
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("html")) throw new FetchPageError("Der Link führt nicht zu einer Webseite.");
  const bytes = await readBytes(res, MAX_BYTES, true);
  return parseHtml(new TextDecoder().decode(bytes ?? new Uint8Array()), url.toString());
}

const MAX_IMAGE_BYTES = 8_000_000;

/** Downloads a picture from a public web address (e.g. a recipe page's photo). */
export async function fetchImage(rawUrl: string): Promise<{ bytes: Uint8Array; type: string }> {
  const { res } = await safeFetch(rawUrl, "image/webp,image/jpeg,image/png,image/gif");
  if (!res.ok) throw new FetchPageError("Das Bild konnte nicht geladen werden.");
  const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const bytes = await readBytes(res, MAX_IMAGE_BYTES);
  if (!bytes) throw new FetchPageError("Das Bild ist zu groß.");
  return { bytes, type };
}
