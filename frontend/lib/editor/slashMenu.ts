import type { Editor } from '@tiptap/core';
import { Extension } from '@tiptap/core';
import type { EditorState } from '@tiptap/pm/state';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

export type SlashCommand = {
  id: string;
  label: string;
  hint?: string;
  run: (editor: Editor, range: { from: number; to: number }) => void;
};

const KEY = new PluginKey<SlashMenuState>('jott:slashMenu');

type SlashMenuState = {
  active: boolean;
  from: number;
  to: number;
  query: string;
};

const INITIAL: SlashMenuState = { active: false, from: 0, to: 0, query: '' };

// Find a "/word" trigger that ends at the current cursor and starts after
// either the start of a textblock or a whitespace character.
function detectTrigger(state: EditorState): SlashMenuState {
  const { selection } = state;
  if (!selection.empty) return INITIAL;
  const $from = selection.$from;
  const text = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼');
  const match = /\/([A-Za-z0-9_-]*)$/.exec(text);
  if (!match) return INITIAL;
  // Require start of line or whitespace before the '/'.
  const slashOffset = match.index;
  const charBefore = slashOffset === 0 ? '' : text.charAt(slashOffset - 1);
  if (charBefore !== '' && !/\s/.test(charBefore)) return INITIAL;
  const docFrom = $from.start() + slashOffset;
  return { active: true, from: docFrom, to: $from.pos, query: match[1] ?? '' };
}

function filter(query: string, commands: readonly SlashCommand[]): SlashCommand[] {
  const q = query.toLowerCase();
  if (!q) return [...commands];
  return commands.filter((c) => c.id.startsWith(q) || c.label.toLowerCase().includes(q));
}

function renderMenu(
  items: SlashCommand[],
  onPick: (i: number) => void,
  selected: number,
): HTMLElement {
  const root = document.createElement('div');
  root.className = 'jott-slash';
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `jott-slash__item${i === selected ? ' is-selected' : ''}`;
    el.tabIndex = -1;
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      onPick(i);
    });
    const label = document.createElement('span');
    label.className = 'jott-slash__label';
    label.textContent = item.label;
    el.appendChild(label);
    if (item.hint) {
      const hint = document.createElement('span');
      hint.className = 'jott-slash__hint';
      hint.textContent = item.hint;
      el.appendChild(hint);
    }
    root.appendChild(el);
  }
  return root;
}

function positionMenu(view: EditorView, menu: HTMLElement, pos: number): void {
  const coords = view.coordsAtPos(pos);
  const wrap = view.dom.parentElement;
  if (!wrap) {
    menu.style.position = 'fixed';
    menu.style.top = `${coords.bottom + 4}px`;
    menu.style.left = `${coords.left}px`;
    return;
  }
  const rect = wrap.getBoundingClientRect();
  menu.style.position = 'absolute';
  menu.style.top = `${coords.bottom - rect.top + 4}px`;
  menu.style.left = `${coords.left - rect.left}px`;
}

export interface SlashMenuOptions {
  commands: SlashCommand[];
}

export const SlashMenu = Extension.create<SlashMenuOptions>({
  name: 'slashMenu',
  addOptions() {
    return { commands: [] };
  },
  addProseMirrorPlugins() {
    const editor = this.editor;
    const allCommands = (): SlashCommand[] => this.options.commands;

    let menu: HTMLElement | null = null;
    let selected = 0;
    let visibleCommands: SlashCommand[] = [];
    let currentRange: { from: number; to: number } = { from: 0, to: 0 };

    const close = () => {
      if (menu) {
        menu.remove();
        menu = null;
      }
      visibleCommands = [];
      selected = 0;
    };

    const pick = (index: number) => {
      const cmd = visibleCommands[index];
      if (!cmd) return;
      const range = currentRange;
      close();
      cmd.run(editor, range);
    };

    const renderAndPosition = (view: EditorView, st: SlashMenuState) => {
      visibleCommands = filter(st.query, allCommands());
      if (visibleCommands.length === 0) {
        close();
        return;
      }
      selected = Math.min(selected, visibleCommands.length - 1);
      currentRange = { from: st.from, to: st.to };
      if (menu) menu.remove();
      menu = renderMenu(visibleCommands, pick, selected);
      const host = view.dom.parentElement;
      if (!host) return;
      if (getComputedStyle(host).position === 'static') {
        host.style.position = 'relative';
      }
      host.appendChild(menu);
      positionMenu(view, menu, st.from);
    };

    return [
      new Plugin<SlashMenuState>({
        key: KEY,
        state: {
          init: () => INITIAL,
          apply: (_tr, _value, _old, newState) => detectTrigger(newState),
        },
        view: () => ({
          update: (innerView) => {
            const st = KEY.getState(innerView.state) ?? INITIAL;
            if (!st.active) {
              close();
              return;
            }
            renderAndPosition(innerView, st);
          },
          destroy: () => close(),
        }),
        props: {
          handleKeyDown: (view, event) => {
            const st = KEY.getState(view.state) ?? INITIAL;
            if (!st.active || !menu || visibleCommands.length === 0) return false;
            if (event.key === 'ArrowDown') {
              selected = (selected + 1) % visibleCommands.length;
              renderAndPosition(view, st);
              return true;
            }
            if (event.key === 'ArrowUp') {
              selected = (selected - 1 + visibleCommands.length) % visibleCommands.length;
              renderAndPosition(view, st);
              return true;
            }
            if (event.key === 'Enter' || event.key === 'Tab') {
              event.preventDefault();
              pick(selected);
              return true;
            }
            if (event.key === 'Escape') {
              close();
              return true;
            }
            return false;
          },
        },
      }),
    ];
  },
});
