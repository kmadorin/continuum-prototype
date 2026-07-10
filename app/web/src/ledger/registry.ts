export type Registry = { namespace: string; synchronizerId: string; packageName: string; parties: Record<string, string> };
export function loadRegistry(raw: Registry): Registry {
  for (const [k, v] of Object.entries(raw.parties ?? {}))
    if (!v?.includes('::')) throw new Error(`party ${k} is not namespaced: ${v}`);
  return raw;
}
