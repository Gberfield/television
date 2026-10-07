import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SOURCE = Path(__file__).resolve().parents[1] / "theme"
FIXTURES = Path(__file__).with_name("fixtures")


class SyncTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.package = Path(self.tmp.name)
        source = SOURCE / 'sync.py'
        if source.exists():
            shutil.copy(source, self.package / 'sync.py')
        (self.package / 'manifest.json').write_text(json.dumps({
            'name': 'Omarchy', 'version': '1.0.0', 'colorScheme': 'dark',
            'authoredForAppVersion': '1.4.23',
        }))

    def tearDown(self):
        self.tmp.cleanup()

    def run_sync(self, palette):
        return subprocess.run([
            sys.executable, str(self.package / 'sync.py'),
            '--colors', str(palette), '--no-activate',
        ], capture_output=True, text=True)

    def test_all_installed_palettes_and_light_dark_switches(self):
        palettes = sorted(FIXTURES.glob('*/colors.toml')) + sorted(Path('/usr/share/omarchy/themes').glob('*/colors.toml'))
        self.assertGreater(len(palettes), 0)
        import tomllib
        for palette in palettes:
            with self.subTest(theme=palette.parent.name):
                result = self.run_sync(palette)
                self.assertEqual(result.returncode, 0, result.stderr)
                colors = tomllib.loads(palette.read_text())
                css = (self.package / 'theme.css').read_text()
                self.assertIn('--color-surface: ' + colors['background'].lower(), css)
                self.assertIn('--color-text: ' + colors['foreground'].lower(), css)
                self.assertIn('--accent: ' + colors['accent'].lower(), css)
                tokens = dict(re.findall(r'--([a-z-]+): (#[a-f0-9]{6})', css))
                import importlib.util
                spec = importlib.util.spec_from_file_location('sync', self.package / 'sync.py')
                sync = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(sync)
                for token in ('color-text-muted', 'color-link'):
                    for ground in ('color-surface', 'color-surface-muted'):
                        self.assertGreaterEqual(sync.contrast(tokens[token], tokens[ground]), 4.5)
                self.assertGreaterEqual(sync.contrast(tokens['color-primary-text'], tokens['accent']), 4.5)
                manifest = json.loads((self.package / 'manifest.json').read_text())
                self.assertEqual(manifest['colorScheme'], colors['mode'])
                self.assertEqual(manifest['authoredForAppVersion'], '1.4.23')
                first_mtime = (self.package / 'theme.css').stat().st_mtime_ns
                self.assertEqual(self.run_sync(palette).returncode, 0)
                self.assertEqual(first_mtime, (self.package / 'theme.css').stat().st_mtime_ns)

    def test_legacy_palette_infers_mode_and_ignores_noncolor_settings(self):
        palette = self.package / 'legacy.toml'
        palette.write_text('background = "#ffffff"\nforeground = "#000000"\nhyprland_active_border = "rgb(ffffffff) 45deg"\n')
        result = self.run_sync(palette)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads((self.package / 'manifest.json').read_text())['colorScheme'], 'light')

    def test_valid_json_with_wrong_state_shape_is_rebuilt(self):
        self.assertEqual(self.run_sync(FIXTURES / 'dark/colors.toml').returncode, 0)
        (self.package / 'sync-state.json').write_text('[]')
        result = self.run_sync(FIXTURES / 'dark/colors.toml')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(json.loads((self.package / 'sync-state.json').read_text())['activationPending'])

    def test_bad_palette_preserves_last_good_package(self):
        good = FIXTURES / 'dark/colors.toml'
        result = self.run_sync(good)
        self.assertEqual(result.returncode, 0, result.stderr)
        files = ['theme.css', 'manifest.json', 'sync-state.json']
        before = {name: (self.package / name).read_bytes() for name in files}
        bad = self.package / 'bad.toml'
        for contents in ['background = "#ffffff"',
                         'background = "#fff; } body { display:none"\nforeground = "#000000"',
                         'this is not TOML']:
            bad.write_text(contents)
            self.assertNotEqual(self.run_sync(bad).returncode, 0)
            self.assertEqual(before, {name: (self.package / name).read_bytes() for name in files})

    def test_failed_activation_is_retried_and_successful_sync_is_idle(self):
        bin_dir = self.package / 'bin'
        bin_dir.mkdir()
        tv = bin_dir / 'tv'
        tv.write_text('#!' + sys.executable + '\n'
                      'import os,sys\n'
                      'from pathlib import Path\n'
                      'if sys.argv[1] == "focus-status":\n'
                      ' print(\'{"activeThemeName":"\' + os.environ["FAKE_THEME"] + \'"}\')\n'
                      'else:\n'
                      ' with Path(os.environ["TV_CALLS"]).open("a") as out: out.write("activate\\n")\n'
                      ' sys.exit(int(os.environ["TV_FAIL"]))\n')
        tv.chmod(0o755)
        calls = self.package / 'calls'
        env = dict(os.environ, PATH=str(bin_dir) + ':' + os.environ['PATH'],
                   FAKE_THEME=self.package.name, TV_CALLS=str(calls), TV_FAIL='1')
        command = [sys.executable, str(self.package / 'sync.py'), '--require-activation',
                   '--colors', str(FIXTURES / 'dark/colors.toml')]
        result = subprocess.run(command, env=env, capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue(json.loads((self.package / 'sync-state.json').read_text())['activationPending'])
        env['TV_FAIL'] = '0'
        result = subprocess.run(command, env=env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(json.loads((self.package / 'sync-state.json').read_text())['activationPending'])
        before = calls.read_text()
        result = subprocess.run(command, env=env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(before, calls.read_text())


class RepairTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.source = self.root / 'source'
        self.source.mkdir()
        for name in ('sync.py', 'repair.py', 'manifest.json', 'README.md'):
            shutil.copy(SOURCE / name, self.source / name)
        bin_dir = self.root / 'bin'
        bin_dir.mkdir()
        tv = bin_dir / 'tv'
        tv.write_text('#!' + sys.executable + '\nimport json,os\n'
                      'print(json.dumps({"themesPath":os.environ["FAKE_THEMES"]}))\n')
        tv.chmod(0o755)
        self.themes = self.root / 'themes'
        self.target = self.themes / 'omarchy'
        self.env = dict(os.environ, PATH=str(bin_dir) + ':' + os.environ['PATH'],
                        FAKE_THEMES=str(self.themes), PYTHONDONTWRITEBYTECODE='1')

    def tearDown(self):
        self.tmp.cleanup()

    def repair(self):
        return subprocess.run([sys.executable, str(self.source / 'repair.py'),
                               '--no-activate', '--colors', str(FIXTURES / 'dark/colors.toml')],
                              env=self.env, capture_output=True, text=True)

    def test_missing_theme_and_corrupted_manifest_recover_without_workspace(self):
        result = self.repair()
        self.assertEqual(result.returncode, 0, result.stderr)
        expected = (self.target / 'theme.css').read_bytes()
        (self.target / 'manifest.json').write_text('corrupted')
        (self.target / 'sync.py').unlink()
        result = self.repair()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(expected, (self.target / 'theme.css').read_bytes())
        self.assertEqual(json.loads((self.target / 'manifest.json').read_text())['colorScheme'], 'dark')
        shutil.rmtree(self.target)
        result = self.repair()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(expected, (self.target / 'theme.css').read_bytes())

    def test_another_authors_theme_is_preserved(self):
        self.target.mkdir(parents=True)
        css = self.target / 'theme.css'
        css.write_text('someone else owns this')
        result = self.repair()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(css.read_text(), 'someone else owns this')

    def installer_env(self):
        home = self.root / 'home'
        home.mkdir()
        bin_dir = self.root / 'bin'
        for name in ('systemctl', 'omarchy'):
            command = bin_dir / name
            command.write_text('#!/bin/sh\nexit 0\n')
            command.chmod(0o755)
        return dict(self.env, HOME=str(home), PYTHONOPTIMIZE='1')

    def test_optimized_python_cannot_adopt_unrelated_theme(self):
        self.target.mkdir(parents=True)
        files = {'manifest.json': '{"name":"Unrelated"}', 'README.md': 'unrelated', 'sync.py': 'unrelated'}
        for name, content in files.items():
            (self.target / name).write_text(content)
        result = subprocess.run(['bash', str(SOURCE.parent / 'install.sh'), '--adopt-existing'],
                                env=self.installer_env(), capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.target / '.omarchy-television-theme').exists())
        self.assertEqual(files, {name: (self.target / name).read_text() for name in files})

    def test_installer_preserves_cli_path_for_service_and_can_be_rerun(self):
        env = self.installer_env()
        for _ in range(2):
            result = subprocess.run(['bash', str(SOURCE.parent / 'install.sh')],
                                    env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
        import shlex
        home = Path(env['HOME'])
        saved = home / '.config/omarchy-television-theme/environment'
        assignments = shlex.split(saved.read_text(), comments=True)
        service_path = dict(value.split('=', 1) for value in assignments)['PATH']
        self.assertIn(str(self.root / 'bin'), service_path.split(':'))
        unit = home / '.config/systemd/user/omarchy-television-theme.service'
        self.assertIn('EnvironmentFile=%h/.config/omarchy-television-theme/environment', unit.read_text())
        permanent = home / '.local/share/omarchy-television-theme/theme/repair.py'
        result = subprocess.run([sys.executable, str(permanent), '--no-activate',
                                 '--colors', str(FIXTURES / 'dark/colors.toml')],
                                env=dict(env, PATH=service_path), capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue((self.target / 'theme.css').exists())


if __name__ == '__main__':
    unittest.main()
