export function relevantOmarchyPath(path: string): boolean;
export function branchAvailable(ref: unknown): boolean;
export function pendingUpdates(manifest: { television: { integrated_sha: string; observed_sha?: string }; omarchy: { baseline_sha?: string; stable_tag: string; default_branch: string } }, observed: { television: string; omarchy: { sha: string; tag: string; default_branch: string; relevant: string[] } }, pulls: { head: { ref: string; repo?: { full_name: string } } }[]): string[];
export function preserveVersions(root: string, base: string): void;
export function mergeCandidate(root: string, base: string, sourceSHA: string): { integrated: boolean; conflicts: string[] };
