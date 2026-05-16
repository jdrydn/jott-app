import type { TagType } from '@shared/tags';
import { Extension } from '@tiptap/core';
import type { EditorState } from '@tiptap/pm/state';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

export type TagSuggestion = {
  id: string;
  type: TagType;
  name: string;
  initials: string;
  color: string;
};

export type TagAutocompleteOptions = {
  // Returns suggestion list for a given trigger sigil + free-form query.
  // Implementation typically combines the live tags list with case-insensitive
  // name matching. Top results only — capped at MAX_SUGGESTIONS.
  suggest: (type: TagType, query: string) => TagSuggestion[];
  // Async create when the user picks the "New" affordance. Backend returns the
  // canonical id (which the plugin then inserts as a `tag` node).
  createTag: (type: TagType, name: string) => Promise<{ id: string }>;
};

const KEY = new PluginKey<TagState>('jott:tagAutocomplete');
const MAX_SUGGESTIONS = 4;

type TagState = {
  active: boolean;
  sigil: '#' | '@';
  query: string;
  from: number;
  to: number;
  dismissedAt: number; // doc pos of last Esc dismiss; -1 if none
};

const INITIAL: TagState = {
  active: false,
  sigil: '#',
  query: '',
  from: 0,
  to: 0,
  dismissedAt: -1,
};

// Detect a trigger: a `#` or `@` preceded by start-of-textblock or whitespace,
// followed by zero or more "name" characters (letters, digits, spaces, _, -)
// extending to the cursor. While active, spaces are allowed so the user can
// type multi-word tag names.
const TRIGGER_RE = /(?:^|\s)([#@])([A-Za-z][A-Za-z0-9 _-]*|)$/;

function detectTrigger(state: EditorState, dismissedAt: number): TagState {
  const { selection } = state;
  if (!selection.empty) return { ...INITIAL, dismissedAt };
  const $from = selection.$from;
  const text = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼');
  const match = TRIGGER_RE.exec(text);
  if (!match) return { ...INITIAL, dismissedAt };
  const sigilChar = match[1];
  if (sigilChar !== '#' && sigilChar !== '@') return { ...INITIAL, dismissedAt };
  const query = match[2] ?? '';
  // index of the sigil within the textblock text
  const sigilOffset = (match.index ?? 0) + match[0].length - (query.length + 1);
  const docFrom = $from.start() + sigilOffset;
  if (docFrom === dismissedAt) return { ...INITIAL, dismissedAt };
  return {
    active: true,
    sigil: sigilChar,
    query,
    from: docFrom,
    to: $from.pos,
    dismissedAt,
  };
}

function renderMenu(opts: {
  sigil: '#' | '@';
  query: string;
  items: TagSuggestion[];
  selected: number;
  onPick: (i: number) => void;
}): HTMLElement {
  const { sigil, query, items, selected, onPick } = opts;
  const root = document.createElement('div');
  root.className = 'jott-tag-menu';

  const header = document.createElement('div');
  header.className = 'jott-tag-menu__header';
  const headerTitle = document.createElement('span');
  headerTitle.className = 'jott-tag-menu__title';
  headerTitle.textContent = sigil === '#' ? 'TOPICS' : 'PEOPLE';
  const headerHint = document.createElement('span');
  headerHint.className = 'jott-tag-menu__hint';
  headerHint.textContent = '↑↓ to nav · ↵ to pick';
  header.appendChild(headerTitle);
  header.appendChild(headerHint);
  root.appendChild(header);

  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'jott-tag-menu__empty';
    empty.textContent = query
      ? `No matches for "${sigil}${query}"`
      : `Type to filter ${sigil === '#' ? 'topics' : 'people'}`;
    root.appendChild(empty);
    return root;
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `jott-tag-menu__item${i === selected ? ' is-selected' : ''}`;
    btn.tabIndex = -1;
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      onPick(i);
    });
    const avatar = document.createElement('span');
    avatar.className = 'jott-tag-menu__avatar';
    avatar.textContent = item.initials;
    avatar.style.backgroundColor = item.color;
    btn.appendChild(avatar);
    const label = document.createElement('span');
    label.className = 'jott-tag-menu__label';
    label.textContent = item.name;
    btn.appendChild(label);
    if (item.id === '__new__') {
      const badge = document.createElement('span');
      badge.className = 'jott-tag-menu__badge';
      badge.textContent = 'New';
      btn.appendChild(badge);
    }
    root.appendChild(btn);
  }
  return root;
}

function positionMenu(view: EditorView, menu: HTMLElement, pos: number): void {
  // Anchor to viewport coords + portal into <body> so the menu escapes any
  // ancestor `overflow: hidden` (composer/editor wrappers).
  const coords = view.coordsAtPos(pos);
  menu.style.position = 'fixed';
  menu.style.top = `${coords.bottom + 4}px`;
  menu.style.left = `${coords.left}px`;
}

export const TagAutocomplete = Extension.create<TagAutocompleteOptions>({
  name: 'tagAutocomplete',

  addOptions() {
    return {
      suggest: () => [],
      createTag: async () => ({ id: '' }),
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    const opts = (): TagAutocompleteOptions => this.options;

    let menu: HTMLElement | null = null;
    let selected = 0;
    let visible: TagSuggestion[] = [];
    let currentRange = { from: 0, to: 0 };
    let currentSigil: '#' | '@' = '#';
    let currentQuery = '';
    let pending = false;

    const close = (dismissedAt = -1) => {
      if (menu) {
        menu.remove();
        menu = null;
      }
      visible = [];
      selected = 0;
      if (dismissedAt >= 0) {
        editor.view.dispatch(editor.view.state.tr.setMeta(KEY, { dismissedAt }));
      }
    };

    const insertTag = (id: string) => {
      const { from, to } = currentRange;
      const nodeType = editor.schema.nodes.tag;
      if (!nodeType) {
        console.error('jott: TagNode extension not registered');
        close();
        return;
      }
      const tr = editor.view.state.tr.replaceWith(from, to, nodeType.create({ id }));
      editor.view.dispatch(tr);
      close();
    };

    const pick = (index: number) => {
      const item = visible[index];
      if (!item || pending) return;
      if (item.id === '__new__') {
        const name = currentQuery.trim();
        if (!name) return;
        const type: TagType = currentSigil === '#' ? 'topic' : 'user';
        pending = true;
        opts()
          .createTag(type, name)
          .then(({ id }) => {
            if (id) insertTag(id);
          })
          .catch((err) => {
            console.error('failed to create tag', err);
            close();
          })
          .finally(() => {
            pending = false;
          });
        return;
      }
      insertTag(item.id);
    };

    const renderAndPosition = (view: EditorView, st: TagState) => {
      currentSigil = st.sigil;
      currentQuery = st.query;
      currentRange = { from: st.from, to: st.to };
      const type: TagType = st.sigil === '#' ? 'topic' : 'user';
      const matches = opts().suggest(type, st.query).slice(0, MAX_SUGGESTIONS);
      visible = matches;

      // Always allow a "New" entry when the typed query doesn't exactly match
      // an existing tag (case-insensitive).
      const trimmed = st.query.trim();
      const exact = trimmed
        ? matches.find((m) => m.name.toLowerCase() === trimmed.toLowerCase())
        : undefined;
      if (trimmed && !exact) {
        visible = [
          ...matches.slice(0, MAX_SUGGESTIONS - 1),
          {
            id: '__new__',
            type,
            name: trimmed,
            initials: defaultInitialsLite(trimmed),
            color: '#A78BFA',
          },
        ];
      }

      if (visible.length === 0) {
        close();
        return;
      }
      selected = Math.min(selected, visible.length - 1);

      if (menu) menu.remove();
      menu = renderMenu({
        sigil: st.sigil,
        query: st.query,
        items: visible,
        selected,
        onPick: pick,
      });
      document.body.appendChild(menu);
      positionMenu(view, menu, st.from);
    };

    return [
      new Plugin<TagState>({
        key: KEY,
        state: {
          init: () => INITIAL,
          apply: (tr, value, _old, newState) => {
            const meta = tr.getMeta(KEY) as { dismissedAt?: number } | undefined;
            let dismissedAt = value.dismissedAt;
            if (meta && typeof meta.dismissedAt === 'number') {
              dismissedAt = meta.dismissedAt;
            } else if (tr.docChanged) {
              // Any edit clears a stale dismiss (so re-typing past the dismissed
              // pos opens the menu again).
              dismissedAt = -1;
            }
            return detectTrigger(newState, dismissedAt);
          },
        },
        view: () => ({
          update: (innerView) => {
            const st = KEY.getState(innerView.state) ?? INITIAL;
            if (!st.active) {
              if (menu) close();
              return;
            }
            renderAndPosition(innerView, st);
          },
          destroy: () => close(),
        }),
        props: {
          handleKeyDown: (view, event) => {
            const st = KEY.getState(view.state) ?? INITIAL;
            if (!st.active || !menu || visible.length === 0) return false;
            if (event.key === 'ArrowDown') {
              selected = (selected + 1) % visible.length;
              renderAndPosition(view, st);
              return true;
            }
            if (event.key === 'ArrowUp') {
              selected = (selected - 1 + visible.length) % visible.length;
              renderAndPosition(view, st);
              return true;
            }
            if (event.key === 'Enter' || event.key === 'Tab') {
              event.preventDefault();
              pick(selected);
              return true;
            }
            if (event.key === 'Escape') {
              close(st.from);
              return true;
            }
            return false;
          },
        },
      }),
    ];
  },
});

function defaultInitialsLite(name: string): string {
  const parts = name
    .trim()
    .split(/[\s_-]+/)
    .filter(Boolean);
  if (parts.length >= 2) {
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
  }
  return (parts[0] ?? name).slice(0, 2).toUpperCase() || '??';
}
