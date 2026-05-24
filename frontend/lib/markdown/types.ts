export type PMMark = {
  type: string;
  attrs?: Record<string, unknown>;
};

export type PMTextNode = {
  type: 'text';
  text: string;
  marks?: PMMark[];
};

export type PMHardBreak = { type: 'hardBreak'; marks?: PMMark[] };

export type PMTagNode = {
  type: 'tag';
  attrs: { id: string };
  marks?: PMMark[];
};

export type PMEmojiNode = {
  type: 'emoji';
  attrs: { name: string };
  marks?: PMMark[];
};

export type PMInlineNode = PMTextNode | PMHardBreak | PMTagNode | PMEmojiNode;

export type PMBlockNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
};

export type PMNode = PMBlockNode | PMInlineNode;

export type PMDoc = {
  type: 'doc';
  content: PMBlockNode[];
};
