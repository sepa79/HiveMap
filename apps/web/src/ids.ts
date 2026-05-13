export function slugifyNodeId(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  if (slug.length === 0) {
    throw new Error("Node label must contain at least one letter or number");
  }

  return `node-${slug}`;
}
