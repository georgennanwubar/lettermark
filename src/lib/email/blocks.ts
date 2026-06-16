/**
 * Block-based email content schema.
 *
 * Mailster uses WordPress's Gutenberg block editor for emails — we reimplement
 * the essence (a tree of typed blocks with attributes + children) in a
 * portable JSON shape so we don't need WordPress.
 *
 * Rendering happens in two stages:
 *   1. Blocks → MJML (responsive markup, dead-simple to author)
 *   2. MJML → HTML (handled by the official `mjml` package)
 *
 * MJML produces HTML that renders consistently in Outlook, Gmail, Apple Mail,
 * etc., which is the hardest part of email — we get that for free.
 */

export type BlockType =
  | 'container' // The root: holds page-level settings + children
  | 'section' // A horizontal row, can have multiple columns
  | 'column'
  | 'heading'
  | 'text'
  | 'button'
  | 'image'
  | 'divider'
  | 'spacer'
  | 'social'
  | 'html' // raw HTML escape hatch
  | 'merge-snippet'; // pre-built reusable bits like "footer with unsub link"

export interface BaseBlock<T extends BlockType = BlockType> {
  id: string;
  type: T;
  attrs?: Record<string, unknown>;
  children?: AnyBlock[];
}

// ─── Block attribute types ─────────────────────────────────────────────────

export interface ContainerAttrs {
  backgroundColor?: string;
  contentBackgroundColor?: string;
  textColor?: string;
  fontFamily?: string;
  width?: number; // default 600
  preheader?: string;
}

export interface SectionAttrs {
  backgroundColor?: string;
  backgroundUrl?: string;
  paddingTop?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  paddingRight?: number;
}

export interface HeadingAttrs {
  level: 1 | 2 | 3 | 4;
  text: string;
  align?: 'left' | 'center' | 'right';
  color?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
}

export interface TextAttrs {
  /** HTML allowed (limited subset). Merge tags get resolved on render. */
  html: string;
  align?: 'left' | 'center' | 'right' | 'justify';
  color?: string;
  fontSize?: number;
  lineHeight?: number;
}

export interface ButtonAttrs {
  text: string;
  url: string;
  align?: 'left' | 'center' | 'right';
  backgroundColor?: string;
  color?: string;
  borderRadius?: number;
  paddingX?: number;
  paddingY?: number;
  fontWeight?: number;
}

export interface ImageAttrs {
  src: string;
  alt?: string;
  href?: string;
  width?: number;
  align?: 'left' | 'center' | 'right';
}

export interface DividerAttrs {
  color?: string;
  thickness?: number;
  width?: number;
}

export interface SpacerAttrs {
  height: number;
}

export interface SocialAttrs {
  align?: 'left' | 'center' | 'right';
  iconSize?: number;
  links: Array<{
    network: 'twitter' | 'facebook' | 'instagram' | 'linkedin' | 'youtube' | 'website' | 'rss';
    url: string;
  }>;
}

export interface HtmlAttrs {
  html: string;
}

export interface MergeSnippetAttrs {
  snippet: 'footer-with-unsubscribe' | 'view-in-browser' | 'address-block';
  address?: string; // CAN-SPAM-friendly physical address
}

// ─── Discriminated union ───────────────────────────────────────────────────

export type AnyBlock =
  | (BaseBlock<'container'> & { attrs?: ContainerAttrs })
  | (BaseBlock<'section'> & { attrs?: SectionAttrs })
  | BaseBlock<'column'>
  | (BaseBlock<'heading'> & { attrs: HeadingAttrs })
  | (BaseBlock<'text'> & { attrs: TextAttrs })
  | (BaseBlock<'button'> & { attrs: ButtonAttrs })
  | (BaseBlock<'image'> & { attrs: ImageAttrs })
  | (BaseBlock<'divider'> & { attrs?: DividerAttrs })
  | (BaseBlock<'spacer'> & { attrs: SpacerAttrs })
  | (BaseBlock<'social'> & { attrs: SocialAttrs })
  | (BaseBlock<'html'> & { attrs: HtmlAttrs })
  | (BaseBlock<'merge-snippet'> & { attrs: MergeSnippetAttrs });

export interface EmailDocument {
  version: 1;
  root: BaseBlock<'container'> & { attrs?: ContainerAttrs; children: AnyBlock[] };
}

/** A reasonable empty document for new campaigns. */
export function emptyDocument(): EmailDocument {
  return {
    version: 1,
    root: {
      id: 'root',
      type: 'container',
      attrs: {
        backgroundColor: '#f4f4f5',
        contentBackgroundColor: '#ffffff',
        textColor: '#18181b',
        fontFamily: 'Inter, Helvetica, Arial, sans-serif',
        width: 600,
        preheader: '',
      },
      children: [
        {
          id: 'sec-1',
          type: 'section',
          attrs: { paddingTop: 32, paddingBottom: 16, paddingLeft: 32, paddingRight: 32 },
          children: [
            {
              id: 'h-1',
              type: 'heading',
              attrs: { level: 1, text: 'Hi {firstname | "there"} 👋', align: 'left' },
            },
            {
              id: 't-1',
              type: 'text',
              attrs: {
                html: 'Welcome to the newsletter. Replace this with your first message.',
              },
            },
            {
              id: 'b-1',
              type: 'button',
              attrs: { text: 'Read more', url: 'https://example.com', align: 'left' },
            },
          ],
        },
        {
          id: 'footer',
          type: 'section',
          attrs: { paddingTop: 16, paddingBottom: 32, paddingLeft: 32, paddingRight: 32 },
          children: [
            {
              id: 'foot-1',
              type: 'merge-snippet',
              attrs: { snippet: 'footer-with-unsubscribe' },
            },
          ],
        },
      ],
    },
  };
}
