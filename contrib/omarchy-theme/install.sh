#!/usr/bin/env bash
# Managed by omarchy-television-theme. Safe to rerun from the permanent copy.
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"
export PYTHONDONTWRITEBYTECODE=1
base=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
source_dir="$base/omarchy"
[[ -d "$source_dir" ]] || source_dir="$base/theme"
adopt=0
if [[ ${1:-} == --adopt-existing ]]; then
  adopt=1
elif [[ $# != 0 ]]; then
  echo 'Usage: install.sh [--adopt-existing]' >&2
  exit 1
fi
themes=$(tv themes-path)
themes_dir=$(python -c 'import json,sys; print(json.loads(sys.argv[1])["themesPath"])' "$themes")
target="$themes_dir/omarchy"
permanent="$HOME/.local/share/omarchy-television-theme"
units="$HOME/.config/systemd/user"
launcher="$HOME/.local/bin/omarchy-television-theme"
config_dir="$HOME/.config/omarchy-television-theme"
owner='omarchy-television-theme:v1'
if [[ -e "$permanent" && $(cat "$permanent/theme/.omarchy-television-theme" 2>/dev/null || true) != "$owner" ]]; then
  echo "Refusing to overwrite unowned integration: $permanent" >&2
  exit 1
fi
if [[ -L "$target" || -L "$permanent" ]]; then
  echo 'Refusing to replace symlinked installation directories' >&2
  exit 1
fi
if [[ -e "$target" && $(cat "$target/.omarchy-television-theme" 2>/dev/null || true) != "$owner" ]]; then
  if [[ "$adopt" != 1 ]]; then
    echo "Refusing to overwrite unowned theme: $target" >&2
    exit 1
  fi
  python - "$target" <<'PY'
import json, sys
from pathlib import Path
p = Path(sys.argv[1])
try:
    owned = (
        json.loads((p/'manifest.json').read_text())['name'] == 'Omarchy'
        and (p/'README.md').read_text().startswith('# Omarchy Television theme\n\nMatches Television')
        and (p/'sync.py').read_text().startswith('#!/usr/bin/env python3\n"""Map the active Omarchy palette')
    )
except (OSError, ValueError, KeyError, TypeError):
    owned = False
if not owned:
    raise SystemExit('Refusing to adopt an unrelated theme')
PY
fi
paths=("$target" "$permanent" "$launcher" "$units/omarchy-television-theme.service" "$units/omarchy-television-theme.timer" "$config_dir/environment")
for event in theme-set post-boot post-update; do
  paths+=("$HOME/.config/omarchy/hooks/$event.d/95-television-omarchy-theme")
done
for path in "${paths[@]:2}"; do
  if [[ -e "$path" ]] && ! grep -qF 'Managed by omarchy-television-theme' "$path"; then
    if [[ "$adopt" == 1 && "$path" == */95-television-omarchy-theme ]] && grep -qF '/omarchy/sync.py' "$path"; then
      continue
    fi
    echo "Refusing to overwrite an unowned file: $path" >&2
    exit 1
  fi
done
backup_dir="$HOME/.local/state/omarchy-television-theme/backups"
mkdir -p "$backup_dir"
backup="$backup_dir/$(TZ=America/New_York date +%Y%m%dT%H%M%S%Z)-$$.tar.gz"
python - "$backup" "${paths[@]}" <<'PY'
import sys, tarfile
from pathlib import Path
with tarfile.open(sys.argv[1], 'w:gz') as archive:
    for value in sys.argv[2:]:
        path = Path(value)
        if path.exists():
            archive.add(path, arcname=str(path).lstrip('/'))
PY
mkdir -p "$permanent/theme" "$target" "$units" "$HOME/.local/bin" "$config_dir"
copy_changed() {
  local source=$1 dest=$2 mode=${3:-644}
  if ! cmp -s "$source" "$dest"; then
    install -m "$mode" "$source" "$dest.new"
    mv -f -- "$dest.new" "$dest"
  fi
}
for file in manifest.json sync.py repair.py README.md 95-television-omarchy-theme omarchy-television-theme.service omarchy-television-theme.timer; do
  copy_changed "$source_dir/$file" "$permanent/theme/$file"
done
copy_changed "$base/install.sh" "$permanent/install.sh" 755
printf '%s\n' "$owner" > "$permanent/theme/.omarchy-television-theme"
printf '%s\n' "$owner" > "$target/.omarchy-television-theme"
cat > "$launcher.new" <<'SH'
#!/usr/bin/env bash
# Managed by omarchy-television-theme.
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH" PYTHONDONTWRITEBYTECODE=1
exec /usr/bin/python "$HOME/.local/share/omarchy-television-theme/theme/repair.py" "$@"
SH
chmod 755 "$launcher.new"
mv -f -- "$launcher.new" "$launcher"
python - "$config_dir/environment" "$PATH" <<'PY'
import os, sys
from pathlib import Path
path = Path(sys.argv[1])
value = sys.argv[2]
if '\n' in value or '\r' in value:
    raise SystemExit('Cannot save a PATH containing line breaks')
escaped = value.replace('\\', '\\\\').replace('"', '\\"')
temporary = path.with_name(path.name + '.new')
temporary.write_text('# Managed by omarchy-television-theme. Only PATH is saved.\nPATH="' + escaped + '"\n')
temporary.chmod(0o600)
os.replace(temporary, path)
PY
for unit in omarchy-television-theme.service omarchy-television-theme.timer; do
  copy_changed "$permanent/theme/$unit" "$units/$unit"
done
for event in theme-set post-boot post-update; do
  omarchy hook install "$event" "$permanent/theme/95-television-omarchy-theme"
done
systemctl --user daemon-reload
systemctl --user enable --now omarchy-television-theme.timer
systemctl --user start omarchy-television-theme.service
tv focus-status
echo "Permanent integration: $permanent"
echo "Previous installation backup: $backup"
