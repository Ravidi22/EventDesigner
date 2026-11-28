// Pure event-folder logic (no imports — keeps the self-check runnable under plain node).
// Run: npm run check:folder

// Pure toggle — add if absent, remove if present.
export function nextFolder(folder: string[], imageId: string): string[] {
  return folder.includes(imageId) ? folder.filter((x) => x !== imageId) : [imageId, ...folder];
}

// The bridge to the studio: the distinct products behind the liked photos, newest-liked first.
// Several liked photos can point at one product (same chandelier, three events) — it pins once.
export function likedProductIds(images: { id: string; productId: string }[], folder: string[]): string[] {
  const productOf = new Map(images.map((img) => [img.id, img.productId]));
  const out: string[] = [];
  for (const imageId of folder) {
    const pid = productOf.get(imageId);
    if (pid && !out.includes(pid)) out.push(pid);
  }
  return out;
}
