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

export type PMInlineNode = PMTextNode | PMHardBreak;

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
