import { emojis as defaultEmojis, type EmojiItem } from '@tiptap/extension-emoji';
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion';

const MAX_SUGGESTIONS = 8;

export function emojiItems({ query }: { query: string }): EmojiItem[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    // No query yet — show a small starter set so the popup isn't empty on `:`.
    return defaultEmojis.slice(0, MAX_SUGGESTIONS);
  }
  const matches: EmojiItem[] = [];
  for (const item of defaultEmojis) {
    if (!item.emoji && !item.fallbackImage) continue;
    const inShortcode = item.shortcodes.some((s) => s.includes(q));
    const inTags = item.tags?.some((t) => t.includes(q));
    if (inShortcode || inTags || item.name.toLowerCase().includes(q)) {
      matches.push(item);
      if (matches.length >= MAX_SUGGESTIONS) break;
    }
  }
  return matches;
}

type EmojiSuggestionProps = SuggestionProps<EmojiItem, { name: string }>;

type Renderer = {
  onStart: (props: EmojiSuggestionProps) => void;
  onUpdate: (props: EmojiSuggestionProps) => void;
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
  onExit: () => void;
};

export function emojiRender(): Renderer {
  let menu: HTMLElement | null = null;
  let items: EmojiItem[] = [];
  let selected = 0;
  let command: ((sel: { name: string }) => void) | null = null;
  let clientRect: (() => DOMRect | null) | null | undefined = null;

  const close = () => {
    menu?.remove();
    menu = null;
    items = [];
    selected = 0;
    command = null;
    clientRect = null;
  };

  const pick = (i: number) => {
    const item = items[i];
    if (!item || !command) return;
    command({ name: item.name });
  };

  const renderMenu = () => {
    if (menu) menu.remove();
    menu = document.createElement('div');
    menu.className = 'jott-emoji-menu';

    const header = document.createElement('div');
    header.className = 'jott-emoji-menu__header';
    const title = document.createElement('span');
    title.className = 'jott-emoji-menu__title';
    title.textContent = 'EMOJI';
    const hint = document.createElement('span');
    hint.className = 'jott-emoji-menu__hint';
    hint.textContent = '↑↓ to nav · ↵ to pick';
    header.appendChild(title);
    header.appendChild(hint);
    menu.appendChild(header);

    if (items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'jott-emoji-menu__empty';
      empty.textContent = 'No matches';
      menu.appendChild(empty);
    } else {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item) continue;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `jott-emoji-menu__item${i === selected ? ' is-selected' : ''}`;
        btn.tabIndex = -1;
        btn.addEventListener('mousedown', (e) => {
          e.preventDefault();
          pick(i);
        });
        const glyph = document.createElement('span');
        glyph.className = 'jott-emoji-menu__glyph';
        glyph.textContent = item.emoji ?? '⬚';
        btn.appendChild(glyph);
        const label = document.createElement('span');
        label.className = 'jott-emoji-menu__label';
        label.textContent = `:${item.shortcodes[0] ?? item.name}:`;
        btn.appendChild(label);
        menu.appendChild(btn);
      }
    }
    document.body.appendChild(menu);
    position();
  };

  const position = () => {
    if (!menu) return;
    const rect = clientRect?.();
    if (!rect) return;
    menu.style.position = 'fixed';
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.left = `${rect.left}px`;
  };

  return {
    onStart(props) {
      items = props.items;
      selected = 0;
      command = props.command;
      clientRect = props.clientRect;
      renderMenu();
    },
    onUpdate(props) {
      items = props.items;
      command = props.command;
      clientRect = props.clientRect;
      if (selected >= items.length) selected = Math.max(0, items.length - 1);
      renderMenu();
    },
    onKeyDown({ event }) {
      if (!menu) return false;
      if (event.key === 'ArrowDown') {
        if (items.length > 0) {
          selected = (selected + 1) % items.length;
          renderMenu();
        }
        return true;
      }
      if (event.key === 'ArrowUp') {
        if (items.length > 0) {
          selected = (selected - 1 + items.length) % items.length;
          renderMenu();
        }
        return true;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        pick(selected);
        return true;
      }
      if (event.key === 'Escape') {
        close();
        return true;
      }
      return false;
    },
    onExit() {
      close();
    },
  };
}
