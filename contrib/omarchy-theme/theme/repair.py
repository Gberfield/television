#!/usr/bin/env python3
"""Restore this integration's theme files, then reconcile the active palette."""
import json
import subprocess
import sys
from pathlib import Path

from sync import write_changed

OWNER = 'omarchy-television-theme:v1\n'
MARKER = '.omarchy-television-theme'


def main():
    source = Path(__file__).resolve().parent
    result = subprocess.run(['tv', 'themes-path'], capture_output=True, text=True, check=True, timeout=15)
    target = Path(json.loads(result.stdout)['themesPath']) / 'omarchy'
    if target.is_symlink():
        raise ValueError('Refusing to replace a symlinked theme folder')
    marker = target / MARKER
    if target.exists() and (not marker.is_file() or marker.read_text() != OWNER):
        raise ValueError('Existing Omarchy theme is not owned by this integration')
    target.mkdir(parents=True, exist_ok=True)
    write_changed(marker, OWNER)
    repaired = False
    for name in ('sync.py', 'repair.py', 'README.md'):
        repaired = write_changed(target / name, (source / name).read_text()) or repaired
    template = json.loads((source / 'manifest.json').read_text())
    try:
        current = json.loads((target / 'manifest.json').read_text())
        template['colorScheme'] = current['colorScheme']
    except (OSError, ValueError, KeyError, TypeError):
        pass
    repaired = write_changed(target / 'manifest.json', json.dumps(template, indent=2) + '\n') or repaired
    command = [sys.executable, str(target / 'sync.py'), '--require-activation']
    if repaired:
        command.append('--force-activate')
    return subprocess.run(command + sys.argv[1:], timeout=45).returncode


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        print(f'Omarchy Television repair failed: {error}', file=sys.stderr)
        sys.exit(1)
