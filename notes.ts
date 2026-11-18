import { getFrontMatterInfo, parseYaml, stringifyYaml } from 'obsidian';

export function unpack(text: string): { frontmatter: Record<string, unknown>; body: string } {
  const info = getFrontMatterInfo(text);
  const parsed: unknown = info.exists ? parseYaml(info.frontmatter) : {};
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('The note has invalid frontmatter.');
  return { frontmatter: parsed as Record<string, unknown>, body: text.slice(info.contentStart) };
}

export function pack(frontmatter: Record<string, unknown>, body: string): string {
  return `---\n${stringifyYaml(frontmatter).trimEnd()}\n---\n${body}`;
}
