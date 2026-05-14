import { describe, expect, test } from 'bun:test';
import { docToMarkdown } from './toMarkdown';
import { markdownToDoc } from './toProseMirror';

function roundTrip(md: string): string {
  return docToMarkdown(markdownToDoc(md));
}

const GOLDEN: Array<{ name: string; md: string }> = [
  {
    name: 'plain paragraph',
    md: 'hello world',
  },
  {
    name: 'two paragraphs',
    md: 'first paragraph\n\nsecond paragraph',
  },
  {
    name: 'bold and italic and strike',
    md: 'this is **bold** and *italic* and ~~strike~~',
  },
  {
    name: 'nested bold + italic',
    md: 'mixing ***both*** here',
  },
  {
    name: 'inline code',
    md: 'try `npm run dev` to start',
  },
  {
    name: 'inline link',
    md: 'see [the docs](https://example.com) for more',
  },
  {
    name: 'fenced code block with language',
    md: '```ts\nconst x = 1;\n```',
  },
  {
    name: 'fenced code block no language',
    md: '```\nplain\n```',
  },
  {
    name: 'blockquote',
    md: '> a wise quote\n> on two lines',
  },
  {
    name: 'unordered list',
    md: '- one\n- two\n- three',
  },
  {
    name: 'ordered list starting at 1',
    md: '1. first\n2. second\n3. third',
  },
  {
    name: 'task list mixed states',
    md: '- [ ] todo\n- [x] done',
  },
  {
    name: 'horizontal rule between paragraphs',
    md: 'above\n\n---\n\nbelow',
  },
  {
    name: 'hard break inside paragraph',
    md: 'line one  \nline two',
  },
];

describe('markdown round-trip', () => {
  for (const { name, md } of GOLDEN) {
    test(name, () => {
      expect(roundTrip(md)).toBe(md);
    });
  }

  test('idempotent on second round trip', () => {
    for (const { md } of GOLDEN) {
      const once = roundTrip(md);
      const twice = roundTrip(once);
      expect(twice).toBe(once);
    }
  });
});

describe('markdownToDoc shape', () => {
  test('produces a doc node', () => {
    const doc = markdownToDoc('hello');
    expect(doc.type).toBe('doc');
    expect(doc.content[0]?.type).toBe('paragraph');
  });

  test('codeBlock attrs carry language', () => {
    const doc = markdownToDoc('```ts\nx\n```');
    expect(doc.content[0]).toMatchObject({
      type: 'codeBlock',
      attrs: { language: 'ts' },
    });
  });

  test('link attrs carry href', () => {
    const doc = markdownToDoc('[hi](https://example.com)');
    const para = doc.content[0];
    const text = para?.content?.[0];
    expect(text).toMatchObject({
      type: 'text',
      text: 'hi',
      marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
    });
  });

  test('taskItem checked state', () => {
    const doc = markdownToDoc('- [x] done');
    const list = doc.content[0];
    expect(list?.type).toBe('taskList');
    expect(list?.content?.[0]).toMatchObject({
      type: 'taskItem',
      attrs: { checked: true },
    });
  });

  test('headings degrade to paragraphs (not allowed in editor)', () => {
    const doc = markdownToDoc('# heading text');
    expect(doc.content[0]?.type).toBe('paragraph');
  });
});

describe('docToMarkdown edge cases', () => {
  test('empty doc returns empty string', () => {
    expect(docToMarkdown({ type: 'doc', content: [] })).toBe('');
  });

  test('paragraph with only marks emits in mark order', () => {
    const md = docToMarkdown({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'x',
              marks: [{ type: 'italic' }, { type: 'bold' }],
            },
          ],
        },
      ],
    });
    expect(md).toBe('***x***');
  });
});
