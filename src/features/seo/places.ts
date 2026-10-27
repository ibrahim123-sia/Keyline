/** A place's area and city for titles: buildings give way to the place they stand in. */
export function placeOf(
  nodes: Array<{ id: string; parentId: string | null; name: string; level: string }>,
  id: string | null,
): { area: string | null; city: string | null } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let node = id ? byId.get(id) : undefined;
  if (node?.level === "building") node = node.parentId ? byId.get(node.parentId) : undefined;
  let city = node;
  for (let i = 0; city && city.level !== "city" && i < 10; i++)
    city = city.parentId ? byId.get(city.parentId) : undefined;
  return { area: node?.name ?? null, city: city?.name ?? null };
}
