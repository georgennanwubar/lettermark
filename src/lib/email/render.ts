/**
 * Render an EmailDocument into bulletproof HTML.
 *
 * Pipeline:
 *   blocks → MJML markup → MJML compile → HTML (+ text version)
 *
 * MJML compile is server-only (uses fs); keep this module out of the client
 * bundle by importing only from server components, route handlers, and the
 * queue worker.
 */

import mjml2html from 'mjml';
import { convert as htmlToText } from 'html-to-text';
import type { AnyBlock, EmailDocument } from './blocks';

/** Escape a value for safe inclusion in an MJML attribute. */
function attr(value: string | number | undefined, fallback = ''): string {
  if (value === undefined || value === null) return fallback;
  return String(value).replace(/"/g, '&quot;');
}

/**
 * Render a complete ` name="value"` attribute, or nothing at all when the
 * value is unset — MJML's validator flags empty color/font-family attrs as
 * invalid, and they should fall back to the <mj-attributes> defaults anyway.
 */
function optAttr(name: string, value: string | number | undefined): string {
  if (value === undefined || value === null || value === '') return '';
  return ` ${name}="${String(value).replace(/"/g, '&quot;')}"`;
}

/** Convert one block to MJML. Sections must wrap their children in columns. */
function blockToMjml(block: AnyBlock, depth = 0): string {
  switch (block.type) {
    case 'section': {
      const a = block.attrs ?? {};
      const styleAttrs = [
        a.backgroundColor && `background-color="${attr(a.backgroundColor)}"`,
        a.backgroundUrl && `background-url="${attr(a.backgroundUrl)}"`,
        a.paddingTop !== undefined && `padding-top="${a.paddingTop}px"`,
        a.paddingBottom !== undefined && `padding-bottom="${a.paddingBottom}px"`,
        a.paddingLeft !== undefined && `padding-left="${a.paddingLeft}px"`,
        a.paddingRight !== undefined && `padding-right="${a.paddingRight}px"`,
      ]
        .filter(Boolean)
        .join(' ');

      // If this section already has explicit column children, render them; otherwise wrap.
      const hasColumns = (block.children ?? []).every((c) => c.type === 'column');
      const inner = (block.children ?? []).map((c) => blockToMjml(c, depth + 1)).join('\n');
      return hasColumns
        ? `<mj-section ${styleAttrs}>${inner}</mj-section>`
        : `<mj-section ${styleAttrs}><mj-column>${inner}</mj-column></mj-section>`;
    }

    case 'column':
      return `<mj-column>${(block.children ?? []).map((c) => blockToMjml(c, depth + 1)).join('\n')}</mj-column>`;

    case 'heading': {
      const { level, text, align, color, fontFamily, fontSize, fontWeight } = block.attrs;
      const defaultSize = { 1: 28, 2: 22, 3: 18, 4: 16 }[level] ?? 22;
      return `<mj-text align="${attr(align, 'left')}"${optAttr('color', color)}${optAttr('font-family', fontFamily)} font-size="${fontSize ?? defaultSize}px" font-weight="${fontWeight ?? 700}" line-height="1.25" padding-bottom="12px">
<h${level} style="margin:0;font-size:inherit;font-weight:inherit;color:inherit;">${escapeHtml(text)}</h${level}>
</mj-text>`;
    }

    case 'text': {
      const { html, align, color, fontSize, lineHeight } = block.attrs;
      return `<mj-text align="${attr(align, 'left')}"${optAttr('color', color)} font-size="${fontSize ?? 16}px" line-height="${lineHeight ?? 1.6}" padding-bottom="12px">${html}</mj-text>`;
    }

    case 'button': {
      const { text, url, align, backgroundColor, color, borderRadius, paddingX, paddingY, fontWeight } =
        block.attrs;
      return `<mj-button href="${attr(url)}" align="${attr(align, 'left')}" background-color="${attr(backgroundColor, '#18181b')}" color="${attr(color, '#ffffff')}" border-radius="${borderRadius ?? 6}px" inner-padding="${paddingY ?? 12}px ${paddingX ?? 20}px" font-weight="${fontWeight ?? 600}">${escapeHtml(text)}</mj-button>`;
    }

    case 'image': {
      const { src, alt, href, width, align } = block.attrs;
      return `<mj-image src="${attr(src)}" alt="${attr(alt)}" ${href ? `href="${attr(href)}"` : ''} ${width ? `width="${width}px"` : ''} align="${attr(align, 'center')}" />`;
    }

    case 'divider': {
      const { color, thickness, width } = block.attrs ?? {};
      return `<mj-divider border-color="${attr(color, '#e4e4e7')}" border-width="${thickness ?? 1}px" width="${width ?? 100}%" />`;
    }

    case 'spacer':
      return `<mj-spacer height="${block.attrs.height}px" />`;

    case 'social': {
      const { align, iconSize, links } = block.attrs;
      const items = links
        .map(
          (l) =>
            `<mj-social-element name="${attr(l.network)}" href="${attr(l.url)}" />`
        )
        .join('\n');
      return `<mj-social align="${attr(align, 'center')}" icon-size="${iconSize ?? 28}px">${items}</mj-social>`;
    }

    case 'html':
      return `<mj-raw>${block.attrs.html}</mj-raw>`;

    case 'merge-snippet': {
      // Snippets are expanded inline; they reference merge tags that the
      // engine fills in later (one HTML produced per subscriber).
      switch (block.attrs.snippet) {
        case 'footer-with-unsubscribe':
          return `<mj-text align="center" color="#71717a" font-size="12px" line-height="1.6" padding-top="16px">
You're receiving this because you subscribed to our newsletter.<br/>
<a href="{unsubscribe}" style="color:#71717a;text-decoration:underline;">Unsubscribe</a> &middot;
<a href="{profile}" style="color:#71717a;text-decoration:underline;">Update preferences</a>
${block.attrs.address ? `<br/><span style="opacity:0.8">${escapeHtml(block.attrs.address)}</span>` : ''}
</mj-text>`;
        case 'view-in-browser':
          return `<mj-text align="center" color="#a1a1aa" font-size="11px"><a href="{webversion}" style="color:#a1a1aa;text-decoration:underline;">View in browser</a></mj-text>`;
        case 'address-block':
          return `<mj-text align="center" color="#71717a" font-size="11px">${escapeHtml(block.attrs.address ?? '')}</mj-text>`;
      }
      return '';
    }

    case 'container':
      // Container is handled at the top level
      return (block.children ?? []).map((c) => blockToMjml(c, depth + 1)).join('\n');
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Render a document into both HTML and text representations.
 * The HTML still contains unresolved merge tags ({firstname}, {unsubscribe}, …)
 * — those get filled in later by `replaceMergeTags()` per-subscriber.
 */
export async function renderEmail(
  doc: EmailDocument
): Promise<{ html: string; text: string; mjml: string; errors: unknown[] }> {
  const c = doc.root.attrs ?? {};
  const preheader = c.preheader
    ? `<mj-raw><div style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(c.preheader)}</div></mj-raw>`
    : '';

  const body = (doc.root.children ?? []).map((b) => blockToMjml(b)).join('\n');

  const mjml = `<mjml>
  <mj-head>
    <mj-attributes>
      <mj-all font-family="${attr(c.fontFamily, 'Inter, Helvetica, Arial, sans-serif')}" />
      <mj-text color="${attr(c.textColor, '#18181b')}" font-size="16px" line-height="1.6" />
    </mj-attributes>
    <mj-style>
      a { color: #2563eb; }
    </mj-style>
  </mj-head>
  <mj-body background-color="${attr(c.backgroundColor, '#f4f4f5')}" width="${c.width ?? 600}px">
    ${preheader}
    <mj-wrapper background-color="${attr(c.contentBackgroundColor, '#ffffff')}">
      ${body}
    </mj-wrapper>
  </mj-body>
</mjml>`;

  const compiled = await mjml2html(mjml, { validationLevel: 'soft', minify: true });
  const text = htmlToText(compiled.html, {
    wordwrap: 80,
    selectors: [
      { selector: 'a', options: { hideLinkHrefIfSameAsText: true } },
      { selector: 'img', format: 'skip' },
    ],
  });

  return { html: compiled.html, text, mjml, errors: compiled.errors };
}
