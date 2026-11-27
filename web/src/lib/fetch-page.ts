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

async function readLimited(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
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

  return { url, title, recipeJsonLd, text };
}

/** Downloads a public web page (following a few redirects) and extracts recipe data and text. */
export async function fetchPage(rawUrl: string): Promise<FetchedPage> {
  let url = await assertPublicUrl(rawUrl);

  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; RecipeBook/1.0)",
          accept: "text/html,application/xhtml+xml",
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
    if (!res.ok) throw new FetchPageError(`Die Seite antwortet mit Fehler ${res.status}.`);
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("html")) throw new FetchPageError("Der Link führt nicht zu einer Webseite.");

    return parseHtml(await readLimited(res), url.toString());
  }
  throw new FetchPageError("Zu viele Weiterleitungen.");
}
