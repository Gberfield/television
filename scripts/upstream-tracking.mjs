// Trusted default-branch tooling. Never install or execute candidate code here.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const FORK = 'Gberfield/television';
const TV = 'telepath-computer/television';
const OMARCHY = 'basecamp/omarchy';
const MANIFEST = '.github/upstream-tracking.json';
const childEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/TOKEN|SECRET|PASSWORD|KEY|CREDENTIAL/i.test(key)));
childEnv.GIT_CONFIG_GLOBAL = '/dev/null';
childEnv.GIT_CONFIG_NOSYSTEM = '1';
const git = (root, ...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-C', root, ...args], { encoding: 'utf8', env: childEnv });
const validSHA = (value) => /^[a-f0-9]{40}$/.test(value);

export const relevantOmarchyPath = (path) => /(^|\/)(themes?|hypr|hyprland|waybar|packages)(\/|\.)|^install\/|^bin\/omarchy-(theme|launch|update|hypr|restart)/i.test(path);
export const branchAvailable = (ref) => ref === null;
export function pendingUpdates(manifest, observed, pulls) {
  const pending = [];
  if (manifest.television.integrated_sha !== observed.television) pending.push('television');
  if (manifest.omarchy.stable_tag !== observed.omarchy.tag || manifest.omarchy.default_branch !== observed.omarchy.default_branch || observed.omarchy.relevant.length) pending.push('omarchy');
  return pending.filter((track) => !pulls.some((pr) => pr.head.repo?.full_name === FORK && pr.head.ref.startsWith(`sync/${track}-`)));
}

export function preserveVersions(root, base) {
  const files = git(root, 'ls-files', '-z', '*package.json').split('\0').filter(Boolean);
  for (const file of files) {
    let old;
    try { old = JSON.parse(git(root, 'show', `${base}:${file}`)); } catch { continue; }
    const current = JSON.parse(readFileSync(resolve(root, file), 'utf8'));
    if (old.version && current.version !== old.version) {
      const text = readFileSync(resolve(root, file), 'utf8');
      writeFileSync(resolve(root, file), text.replace(/"version":\s*"[^"]+"/, `"version": "${old.version}"`));
    }
  }
  const lock = JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8'));
  const oldLock = JSON.parse(git(root, 'show', `${base}:package-lock.json`));
  lock.version = oldLock.version;
  for (const [name, entry] of Object.entries(lock.packages)) {
    if (!name.startsWith('node_modules/') && oldLock.packages[name]?.version) entry.version = oldLock.packages[name].version;
  }
  writeFileSync(resolve(root, 'package-lock.json'), `${JSON.stringify(lock, null, 2)}\n`);
}

export function mergeCandidate(root, base, sourceSHA) {
  let integrated = false;
  let conflicts = [];
  try { git(root, 'merge', '--no-commit', '--no-ff', sourceSHA); integrated = true; }
  catch {
    conflicts = git(root, 'diff', '--name-only', '--diff-filter=U').trim().split('\n').filter(Boolean);
    if (!conflicts.length) throw new Error('Merge failed without resolvable conflicts');
  }
  if (integrated) {
    preserveVersions(root, base);
    const protectedPaths = git(root, 'diff', '--name-only', base).trim().split('\n').filter((file) => /^\.github\/|^packages\/desktop\/linux\/|^specs\/arch\/updates\/update-channel\.json$/.test(file));
    if (protectedPaths.length) { conflicts = protectedPaths.map((file) => `review-required: ${file}`); integrated = false; }
  }
  if (!integrated) git(root, 'reset', '--hard', base);
  return { integrated, conflicts };
}

async function api(path, { method = 'GET', body, optional = false } = {}) {
  const response = await fetch(`https://api.github.com/${path}`, {
    method, headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(process.env.GH_TOKEN ? { Authorization: `Bearer ${process.env.GH_TOKEN}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (optional && response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub ${method} ${path}: ${response.status}`);
  return response.json();
}
async function pages(path) {
  const result = [];
  for (let page = 1; ; page++) {
    const rows = await api(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    result.push(...rows);
    if (rows.length < 100) return result;
  }
}
async function discovery(manifest) {
  const [tv, repo, release, pulls] = await Promise.all([
    api(`repos/${TV}/commits/main`), api(`repos/${OMARCHY}`), api(`repos/${OMARCHY}/releases/latest`), pages(`repos/${FORK}/pulls?state=open`),
  ]);
  const [head, stable] = await Promise.all([api(`repos/${OMARCHY}/commits/${encodeURIComponent(repo.default_branch)}`), api(`repos/${OMARCHY}/commits/${encodeURIComponent(release.tag_name)}`)]);
  let relevant = [];
  if (head.sha !== manifest.omarchy.baseline_sha) {
    const comparison = await api(`repos/${OMARCHY}/compare/${manifest.omarchy.baseline_sha}...${head.sha}`);
    // API file lists cap at 300. Divergence/truncation merits human review too.
    relevant = (comparison.files ?? []).filter((file) => relevantOmarchyPath(file.filename) || relevantOmarchyPath(file.previous_filename ?? '')).map((file) => file.filename);
    if (comparison.status === 'diverged' || comparison.status === 'behind' || comparison.files?.length >= 300) relevant.push('review-required: comparison incomplete or divergent');
  }
  const observed = { television: tv.sha, omarchy: { sha: head.sha, stable_sha: stable.sha, tag: release.tag_name, default_branch: repo.default_branch, relevant } };
  if (![tv.sha, head.sha, stable.sha].every(validSHA)) throw new Error('Invalid upstream SHA');
  return { observed, pending: pendingUpdates(manifest, observed, pulls) };
}

async function main() {
  if (process.env.GITHUB_REPOSITORY !== FORK || process.env.GITHUB_REF !== 'refs/heads/main') throw new Error('Tracking writes/discovery require fork main');
  const root = process.cwd();
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const { observed, pending } = await discovery(manifest);
  if (process.argv[2] === 'detect') {
    if (process.env.GITHUB_OUTPUT) {
      const { appendFileSync } = await import('node:fs');
      appendFileSync(process.env.GITHUB_OUTPUT, ['television', 'omarchy'].map((track) => `${track}=${pending.includes(track)}\n`).join('') + `write_enabled=${manifest.policy.pr_creation_enabled === true}\n`);
    }
    console.log(JSON.stringify({ observed, pending }));
    if (pending.length && !manifest.policy.pr_creation_enabled) console.log('PR writing blocked pending specific owner approval of the Actions PR-creation capability; no settings changed.');
    return;
  }
  const track = process.argv[3];
  if (process.argv[2] !== 'prepare' || !['television', 'omarchy'].includes(track)) throw new Error('Use detect or prepare television|omarchy');
  if (manifest.policy.pr_creation_enabled !== true) throw new Error('Automated PR creation is not enabled; owner capability approval required');
  if (!pending.includes(track)) return;
  const sourceSHA = track === 'television' ? observed.television : observed.omarchy.sha;
  const branch = `sync/${track}-${sourceSHA}`;
  const remoteRef = await api(`repos/${FORK}/git/ref/heads/${branch}`, { optional: true });
  if (!branchAvailable(remoteRef)) throw new Error('Existing sync branch preserved; owner intervention required');
  const base = git(root, 'rev-parse', 'HEAD').trim();
  // Abort a stale dispatch instead of preparing against an obsolete fork tip.
  if ((await api(`repos/${FORK}/commits/main`)).sha !== base) throw new Error('Fork main moved; rerun detection');
  git(root, 'config', 'user.name', 'github-actions[bot]');
  git(root, 'config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com');
  git(root, 'checkout', '-b', branch);
  let integrated = false;
  let conflicts = [];
  if (track === 'television') {
    git(root, 'fetch', '--no-tags', `https://github.com/${TV}.git`, sourceSHA);
    ({ integrated, conflicts } = mergeCandidate(root, base, sourceSHA));
    manifest.television.observed_sha = sourceSHA;
    if (integrated) manifest.television.integrated_sha = sourceSHA;
  } else {
    // Compatibility input only: no Omarchy fetch or merge.
    manifest.omarchy.observed_sha = sourceSHA;
    manifest.omarchy.observed_stable_tag = observed.omarchy.tag;
    manifest.omarchy.observed_stable_sha = observed.omarchy.stable_sha;
    manifest.omarchy.observed_default_branch = observed.omarchy.default_branch;
  }
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  const report = { track, observed_sha: sourceSHA, integrated_sha: integrated ? sourceSHA : null, tested_sha: null, conflicts, compatibility: track === 'omarchy' ? observed.omarchy : null };
  writeFileSync('.github/upstream-pending.json', `${JSON.stringify(report, null, 2)}\n`);
  git(root, 'add', '-A');
  git(root, 'commit', '-m', `Track ${track} update ${sourceSHA.slice(0, 12)}${integrated ? ' (ancestry preserved)' : ' (human resolution required)'}`);
  // Credentials reach this git transport only. Candidate hooks are disabled.
  const authorization = Buffer.from(`x-access-token:${process.env.GH_TOKEN}`).toString('base64');
  execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-C', root, 'push', `https://github.com/${FORK}.git`, `HEAD:refs/heads/${branch}`, `--force-with-lease=refs/heads/${branch}:`], {
    env: { ...childEnv, GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader', GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${authorization}` }, stdio: 'pipe',
  });
  const head = git(root, 'rev-parse', 'HEAD').trim();
  const pr = await api(`repos/${FORK}/pulls`, { method: 'POST', body: {
    title: `[sync/${track}] Review ${sourceSHA.slice(0, 12)}`, head: branch, base: 'main', draft: true,
    body: `Observed ${track} SHA: \`${sourceSHA}\`. Candidate: \`${head}\`.\n\n${integrated ? 'Television ancestry merged; fork versions retained.' : 'Human resolution/compatibility review required; no integration claimed.'}\n\nConflicts/review paths: ${conflicts.length ? conflicts.join(', ') : 'none'}.\n\nNo checks have run yet. Run **Sync validation** manually on this branch (or approve token-created PR workflow runs where offered). Keep draft until final-SHA checks and independent review pass. Omarchy baseline/stable_tag advance only after compatibility review; observed fields are discovery, never acceptance. No merge/release/install is performed.`,
  } });
  console.log(pr.html_url);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
