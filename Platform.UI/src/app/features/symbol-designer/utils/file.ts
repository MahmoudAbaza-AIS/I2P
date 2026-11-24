/** File-system-safe base name (POC `safeFileName`). */
export function safeFileName(value: string): string {
  return (
    (value || 'symbol')
      .trim()
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-') || 'symbol'
  );
}

/** "tile-bed.svg" → "Tile bed". */
export function displayNameFromFile(file: string): string {
  const base = file
    .replace(/\.svg$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  return base ? base[0].toUpperCase() + base.slice(1) : file;
}

/** Trigger a browser download of text content. */
export function downloadText(doc: Document, filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = doc.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
