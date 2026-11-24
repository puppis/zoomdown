import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const editors = resolve(__dirname, '..', 'editors');
const files = (readdirSync(editors, { recursive: true, withFileTypes: true }) as import('node:fs').Dirent[])
  .filter((entry) => entry.isFile())
  .map((entry) => join(entry.parentPath, entry.name));
const read = (path: string): string => readFileSync(join(editors, path), 'utf8');

describe('the editor setups leave saving to the author', () => {
  it('no setup saves a deck', () => {
    // Emacs, Sublime Text, VS Code and Vim: the calls and settings that write a buffer.
    const saving = [/save-buffer|save-some-buffers|auto-save|autosave/i, /run_command\(\s*['"](save|save_all)['"]/, /"save_on_focus_lost"\s*:\s*true/, /"files\.autoSave"/, /^\s*(silent!?\s+)?(update|write|wall|wa|w)!?\s*$/m, /\|\s*(silent!?\s+)?(update|write|wall)\b/, /CursorHold[^\n]*(update|write)/];
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const pattern of saving) expect(text, `${relative(editors, file)} saves (${pattern})`).not.toMatch(pattern);
    }
  });

  it('no shortcut goes through a command of the editor that saves first', () => {
    // Sublime Text's build saves as Tools > Save All on Build says, VS Code's tasks as task.saveBeforeRun does.
    for (const file of ['Default.sublime-keymap', 'Default (OSX).sublime-keymap', 'Default.sublime-commands']) {
      expect(read(join('sublime', 'ZoomDown', file))).not.toMatch(/"command"\s*:\s*"build"/);
    }
    expect(JSON.parse(read(join('vscode', 'settings.json')))['task.saveBeforeRun']).toBe('never');
    // Emacs's `compile` saves the buffers; `compilation-start` does not.
    expect(read(join('emacs', 'zoomdown.el'))).not.toMatch(/\((compile|recompile)\s/);
  });
});
