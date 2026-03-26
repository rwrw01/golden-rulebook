/**
 * Keyboard shortcut registry
 */

interface Shortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  handler: () => void;
  description: string;
}

const shortcuts: Shortcut[] = [];

export function registerShortcut(shortcut: Shortcut): void {
  shortcuts.push(shortcut);
}

export function initKeyboard(): void {
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    for (const s of shortcuts) {
      const ctrlMatch = s.ctrl ? (e.ctrlKey || e.metaKey) : !(e.ctrlKey || e.metaKey);
      const shiftMatch = s.shift ? e.shiftKey : !e.shiftKey;
      if (e.key === s.key && ctrlMatch && shiftMatch) {
        e.preventDefault();
        s.handler();
        return;
      }
    }
  });
}

export function getShortcuts(): Shortcut[] {
  return [...shortcuts];
}
