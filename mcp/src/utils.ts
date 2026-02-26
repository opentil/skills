export function truncate(text: string, max: number): string {
  const plain = text.replace(/[#*`>\[\]()!]/g, '').replace(/\n+/g, ' ').trim();
  if (plain.length <= max) return plain;
  return plain.slice(0, max).trimEnd() + '…';
}
