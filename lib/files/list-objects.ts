// One page of an S3 ListObjectsV2 answer (EVE-22): the keys, and the token for the next page. Pure —
// `check:list-objects` holds it. R2 speaks the same XML. Regex over a parser on purpose: the shape is
// fixed and tiny, and this keeps an XML library out of the server bundle for one call.

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };
const decode = (s: string) => s.replace(/&(amp|lt|gt|quot|apos);/g, (m) => ENTITIES[m]);

export function parseListObjects(xml: string): { keys: string[]; next: string | null } {
  const keys = [...xml.matchAll(/<Contents>[\s\S]*?<Key>([\s\S]*?)<\/Key>[\s\S]*?<\/Contents>/g)].map((m) => decode(m[1]));
  const truncated = /<IsTruncated>\s*true\s*<\/IsTruncated>/.test(xml);
  const token = xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/)?.[1];
  return { keys, next: truncated && token ? decode(token) : null };
}
