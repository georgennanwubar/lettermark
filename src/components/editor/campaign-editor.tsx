"use client";
/**
 * campaign-editor.tsx — Block-based email editor.
 *
 * Layout: three regions.
 *   Left  — block library (add buttons) + tree view of current blocks.
 *   Center — live HTML preview (rendered via /api/preview, sandboxed iframe).
 *   Right (or below on mobile) — inspector for the currently-selected block.
 *
 * State model: a single EmailDocument JSON tree held in React state. All edits
 * are pure functions over that tree. Saves debounce a server-render so the
 * preview iframe stays fresh without thrashing.
 *
 * This is intentionally a "structured-fields" editor — not a WYSIWYG. WYSIWYG
 * email editors are notoriously fragile (clients strip styles, contenteditable
 * is buggy across browsers). Structured fields are predictable and produce
 * cleaner output.
 */
import * as React from "react";
import Link from "next/link";
import {
  AnyBlock, BlockType, ContainerAttrs, EmailDocument,
} from "@/lib/email/blocks";
import { updateCampaign } from "@/app/(dashboard)/campaigns/actions";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch, Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/select-tabs";
import {
  ArrowLeft, Save, Eye, Smartphone, Monitor, Plus, Trash2, ChevronUp, ChevronDown,
  Heading1, Type, ImageIcon, Minus, MousePointerClick, Code, Share2, Box,
  Variable,
} from "lucide-react";
import { toast } from "sonner";

type DocumentNode = EmailDocument["root"];

const BLOCK_LIBRARY: { type: Exclude<BlockType, "container">; label: string; icon: React.ElementType }[] = [
  { type: "section", label: "Section", icon: Box },
  { type: "heading", label: "Heading", icon: Heading1 },
  { type: "text", label: "Text", icon: Type },
  { type: "button", label: "Button", icon: MousePointerClick },
  { type: "image", label: "Image", icon: ImageIcon },
  { type: "divider", label: "Divider", icon: Minus },
  { type: "spacer", label: "Spacer", icon: Box },
  { type: "social", label: "Social links", icon: Share2 },
  { type: "html", label: "HTML", icon: Code },
  { type: "merge-snippet", label: "Footer / Snippet", icon: Variable },
];

function defaultAttrsFor(type: BlockType): any {
  switch (type) {
    case "section": return { paddingTop: 24, paddingBottom: 24, paddingLeft: 32, paddingRight: 32 };
    case "heading": return { level: 2, text: "Headline", align: "left" };
    case "text": return { html: "Write your message here.", align: "left", fontSize: 16 };
    case "button": return { text: "Click here", href: "https://example.com", align: "center", backgroundColor: "#2563eb", textColor: "#ffffff" };
    case "image": return { src: "https://placehold.co/600x300", alt: "", align: "center", width: 600 };
    case "divider": return { color: "#e4e4e7", thickness: 1, paddingTop: 16, paddingBottom: 16 };
    case "spacer": return { height: 32 };
    case "social": return { networks: [{ name: "twitter", url: "https://twitter.com/" }, { name: "instagram", url: "https://instagram.com/" }] };
    case "html": return { html: "<p>Custom HTML</p>" };
    case "merge-snippet": return { snippet: "footer-with-unsubscribe" };
    default: return {};
  }
}

function newBlock(type: BlockType): AnyBlock {
  const id = `${type.slice(0, 3)}-${Math.random().toString(36).slice(2, 8)}`;
  if (type === "section") {
    return { id, type: "section", attrs: defaultAttrsFor(type), children: [] } as AnyBlock;
  }
  return { id, type, attrs: defaultAttrsFor(type) } as AnyBlock;
}

interface BlockWithChildren extends AnyBlock { children?: AnyBlock[] }

/** Pure helpers — operate on the document tree without mutating. */
function updateAtPath(doc: EmailDocument, path: number[], patcher: (b: any) => any): EmailDocument {
  const clone = structuredClone(doc) as EmailDocument;
  let target: any = clone.root;
  for (let i = 0; i < path.length - 1; i++) target = target.children[path[i]];
  if (path.length === 0) {
    clone.root = patcher(target);
  } else {
    target.children[path[path.length - 1]] = patcher(target.children[path[path.length - 1]]);
  }
  return clone;
}

function removeAtPath(doc: EmailDocument, path: number[]): EmailDocument {
  if (path.length === 0) return doc;
  const clone = structuredClone(doc) as EmailDocument;
  let target: any = clone.root;
  for (let i = 0; i < path.length - 1; i++) target = target.children[path[i]];
  target.children.splice(path[path.length - 1], 1);
  return clone;
}

function moveAtPath(doc: EmailDocument, path: number[], delta: number): EmailDocument {
  if (path.length === 0) return doc;
  const clone = structuredClone(doc) as EmailDocument;
  let target: any = clone.root;
  for (let i = 0; i < path.length - 1; i++) target = target.children[path[i]];
  const idx = path[path.length - 1];
  const newIdx = Math.max(0, Math.min(target.children.length - 1, idx + delta));
  const [item] = target.children.splice(idx, 1);
  target.children.splice(newIdx, 0, item);
  return clone;
}

function insertChild(doc: EmailDocument, parentPath: number[], block: AnyBlock): EmailDocument {
  const clone = structuredClone(doc) as EmailDocument;
  let target: any = clone.root;
  for (let i = 0; i < parentPath.length; i++) target = target.children[parentPath[i]];
  target.children = target.children || [];
  target.children.push(block);
  return clone;
}

function getAtPath(doc: EmailDocument, path: number[]): any {
  let target: any = doc.root;
  for (const i of path) target = target.children[i];
  return target;
}

interface Props {
  campaign: { id: number; subject: string; preheader: string; fromName: string; fromEmail: string; replyTo: string };
  initialDocument: EmailDocument;
}

export function CampaignEditor({ campaign, initialDocument }: Props) {
  const [doc, setDoc] = React.useState<EmailDocument>(initialDocument);
  const [meta, setMeta] = React.useState({
    subject: campaign.subject,
    preheader: campaign.preheader,
    fromName: campaign.fromName,
    fromEmail: campaign.fromEmail,
    replyTo: campaign.replyTo,
  });
  const [selected, setSelected] = React.useState<number[] | null>(null);
  const [device, setDevice] = React.useState<"desktop" | "mobile">("desktop");
  const [previewHtml, setPreviewHtml] = React.useState<string>("");
  const [previewing, setPreviewing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);

  /** Re-render preview whenever the doc changes (debounced). */
  React.useEffect(() => {
    setDirty(true);
    setPreviewing(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/preview", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ document: doc, preheader: meta.preheader }),
        });
        const text = await res.text();
        setPreviewHtml(text);
      } catch (err) {
        console.error("Preview render failed", err);
      } finally {
        setPreviewing(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [doc, meta.preheader]);

  const save = React.useCallback(async () => {
    setSaving(true);
    try {
      const r = await updateCampaign({
        id: campaign.id,
        subject: meta.subject,
        preheader: meta.preheader || undefined,
        fromName: meta.fromName || undefined,
        fromEmail: meta.fromEmail || undefined,
        replyTo: meta.replyTo || undefined,
        contentJson: doc,
      });
      if (r.ok) {
        toast.success("Campaign saved");
        setDirty(false);
      } else {
        toast.error(r.error ?? "Couldn't save");
      }
    } catch (err) {
      toast.error("Couldn't save");
    } finally {
      setSaving(false);
    }
  }, [campaign.id, doc, meta]);

  // Cmd-S / Ctrl-S
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  const selectedBlock = selected ? getAtPath(doc, selected) : null;

  return (
    <div className="flex h-screen flex-col">
      {/* Toolbar */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/campaigns/${campaign.id}`}><ArrowLeft className="mr-1 h-4 w-4" />Back</Link>
        </Button>
        <Input
          value={meta.subject}
          onChange={(e) => { setMeta({ ...meta, subject: e.target.value }); setDirty(true); }}
          placeholder="Subject line"
          className="max-w-md font-medium"
        />
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden items-center gap-1 rounded-md border border-border p-0.5 sm:flex">
            <button
              type="button"
              onClick={() => setDevice("desktop")}
              className={`flex h-7 w-7 items-center justify-center rounded ${device === "desktop" ? "bg-secondary" : "text-muted-foreground"}`}
              aria-label="Desktop preview"
            >
              <Monitor className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setDevice("mobile")}
              className={`flex h-7 w-7 items-center justify-center rounded ${device === "mobile" ? "bg-secondary" : "text-muted-foreground"}`}
              aria-label="Mobile preview"
            >
              <Smartphone className="h-3.5 w-3.5" />
            </button>
          </div>
          {dirty && <span className="hidden text-xs text-muted-foreground sm:inline">Unsaved changes</span>}
          <Button size="sm" onClick={save} disabled={saving}>
            <Save className="mr-1 h-3.5 w-3.5" />{saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel — blocks + inspector */}
        <aside className="hidden w-80 shrink-0 flex-col border-r border-border bg-card md:flex">
          <Tabs defaultValue="blocks" className="flex flex-1 flex-col">
            <TabsList className="m-3 self-start">
              <TabsTrigger value="blocks">Blocks</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>

            <TabsContent value="blocks" className="flex-1 overflow-y-auto px-3 pb-3">
              <div className="mb-4 space-y-1">
                <div className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Add a block</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {BLOCK_LIBRARY.filter((b) => b.type !== "section").map((b) => (
                    <button
                      key={b.type}
                      type="button"
                      onClick={() => {
                        // Add into the first section, or create one if none
                        const root = doc.root;
                        let target = root.children.find((c) => c.type === "section");
                        if (!target) {
                          const section = newBlock("section") as any;
                          const newDoc = insertChild(doc, [], section);
                          target = section;
                          setDoc(insertChild(newDoc, [newDoc.root.children.length - 1], newBlock(b.type)));
                        } else {
                          const idx = root.children.indexOf(target);
                          setDoc(insertChild(doc, [idx], newBlock(b.type)));
                        }
                      }}
                      className="flex flex-col items-center gap-1 rounded-md border border-border bg-background p-2.5 text-xs transition-colors hover:bg-secondary"
                    >
                      <b.icon className="h-4 w-4 text-muted-foreground" />
                      <span>{b.label}</span>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setDoc(insertChild(doc, [], newBlock("section")))}
                  className="mt-2 flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-border p-2 text-xs text-muted-foreground hover:bg-secondary"
                >
                  <Plus className="h-3.5 w-3.5" />Add new section
                </button>
              </div>

              <div className="space-y-1">
                <div className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Structure</div>
                <BlockTree
                  block={doc.root}
                  path={[]}
                  selected={selected}
                  onSelect={setSelected}
                  onMove={(p, d) => setDoc(moveAtPath(doc, p, d))}
                  onRemove={(p) => { setDoc(removeAtPath(doc, p)); setSelected(null); }}
                />
              </div>

              {selectedBlock && (
                <div className="mt-4 space-y-2 border-t border-border pt-4">
                  <div className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Edit block</div>
                  <BlockInspector
                    block={selectedBlock}
                    onChange={(attrs) =>
                      setDoc(updateAtPath(doc, selected, (b: any) => ({ ...b, attrs: { ...b.attrs, ...attrs } })))
                    }
                  />
                </div>
              )}
            </TabsContent>

            <TabsContent value="settings" className="flex-1 overflow-y-auto px-3 pb-3">
              <div className="space-y-3">
                <Field label="Preheader" hint="The preview line in the inbox">
                  <Input value={meta.preheader} onChange={(e) => { setMeta({ ...meta, preheader: e.target.value }); setDirty(true); }} />
                </Field>
                <Field label="From name">
                  <Input value={meta.fromName} onChange={(e) => { setMeta({ ...meta, fromName: e.target.value }); setDirty(true); }} />
                </Field>
                <Field label="From email">
                  <Input type="email" value={meta.fromEmail} onChange={(e) => { setMeta({ ...meta, fromEmail: e.target.value }); setDirty(true); }} />
                </Field>
                <Field label="Reply-to (optional)">
                  <Input type="email" value={meta.replyTo} onChange={(e) => { setMeta({ ...meta, replyTo: e.target.value }); setDirty(true); }} />
                </Field>
                <div className="mt-6 rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                  <strong className="font-semibold text-foreground">Merge tags</strong>
                  <p className="mt-1">Use <code className="rounded bg-muted px-1">{`{firstname | "there"}`}</code> in any block to personalize. System tags: <code>{`{unsubscribe}`}</code>, <code>{`{webversion}`}</code>, <code>{`{date}`}</code>.</p>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </aside>

        {/* Preview */}
        <div className="flex-1 overflow-auto bg-muted/40 p-4 sm:p-6">
          <div
            className={`mx-auto overflow-hidden rounded-lg border border-border bg-white shadow-sm transition-all ${
              device === "mobile" ? "max-w-[375px]" : "max-w-[660px]"
            }`}
          >
            <iframe
              key={device}
              title="Preview"
              srcDoc={previewHtml || "<html><body style='font-family:sans-serif;padding:32px;text-align:center;color:#71717a'>Rendering…</body></html>"}
              className="h-[800px] w-full"
              sandbox="allow-same-origin"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---- BlockTree ---- */

function BlockTree({
  block, path, selected, onSelect, onMove, onRemove,
}: {
  block: AnyBlock;
  path: number[];
  selected: number[] | null;
  onSelect: (p: number[]) => void;
  onMove: (p: number[], delta: number) => void;
  onRemove: (p: number[]) => void;
}) {
  const isSelected = selected && selected.length === path.length && selected.every((v, i) => v === path[i]);
  const children = (block as BlockWithChildren).children;

  return (
    <div className="space-y-0.5">
      {path.length > 0 && (
        <div
          className={`group flex items-center gap-1 rounded px-1.5 py-1 text-xs transition-colors ${
            isSelected ? "bg-primary/10 text-primary" : "hover:bg-secondary"
          }`}
          onClick={() => onSelect(path)}
        >
          <span className="flex-1 capitalize">{block.type}</span>
          <span className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5">
            <button type="button" onClick={(e) => { e.stopPropagation(); onMove(path, -1); }} title="Move up" className="rounded p-0.5 hover:bg-background">
              <ChevronUp className="h-3 w-3" />
            </button>
            <button type="button" onClick={(e) => { e.stopPropagation(); onMove(path, 1); }} title="Move down" className="rounded p-0.5 hover:bg-background">
              <ChevronDown className="h-3 w-3" />
            </button>
            <button type="button" onClick={(e) => { e.stopPropagation(); onRemove(path); }} title="Remove" className="rounded p-0.5 hover:bg-background text-destructive">
              <Trash2 className="h-3 w-3" />
            </button>
          </span>
        </div>
      )}
      {children && (
        <div className={path.length > 0 ? "ml-3 border-l border-border pl-2" : ""}>
          {children.map((child, idx) => (
            <BlockTree
              key={child.id}
              block={child}
              path={[...path, idx]}
              selected={selected}
              onSelect={onSelect}
              onMove={onMove}
              onRemove={onRemove}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ---- BlockInspector ---- */

function BlockInspector({ block, onChange }: { block: AnyBlock; onChange: (attrs: any) => void }) {
  const a = (block as any).attrs || {};

  switch (block.type) {
    case "heading":
      return (
        <>
          <Field label="Text"><Input value={a.text || ""} onChange={(e) => onChange({ text: e.target.value })} /></Field>
          <Field label="Level">
            <Select value={String(a.level || 2)} onValueChange={(v) => onChange({ level: Number(v) })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{[1, 2, 3, 4].map((n) => <SelectItem key={n} value={String(n)}>H{n}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <AlignField value={a.align} onChange={(align) => onChange({ align })} />
        </>
      );
    case "text":
      return (
        <>
          <Field label="Content (HTML allowed)">
            <Textarea rows={5} value={a.html || ""} onChange={(e) => onChange({ html: e.target.value })} />
          </Field>
          <AlignField value={a.align} onChange={(align) => onChange({ align })} />
          <Field label="Font size">
            <Input type="number" min={10} max={36} value={a.fontSize || 16} onChange={(e) => onChange({ fontSize: Number(e.target.value) })} />
          </Field>
        </>
      );
    case "button":
      return (
        <>
          <Field label="Label"><Input value={a.text || ""} onChange={(e) => onChange({ text: e.target.value })} /></Field>
          <Field label="URL"><Input value={a.href || ""} onChange={(e) => onChange({ href: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Bg color"><Input type="color" value={a.backgroundColor || "#2563eb"} onChange={(e) => onChange({ backgroundColor: e.target.value })} /></Field>
            <Field label="Text color"><Input type="color" value={a.textColor || "#ffffff"} onChange={(e) => onChange({ textColor: e.target.value })} /></Field>
          </div>
          <AlignField value={a.align} onChange={(align) => onChange({ align })} />
        </>
      );
    case "image":
      return (
        <>
          <Field label="Image URL"><Input value={a.src || ""} onChange={(e) => onChange({ src: e.target.value })} /></Field>
          <Field label="Alt text"><Input value={a.alt || ""} onChange={(e) => onChange({ alt: e.target.value })} /></Field>
          <Field label="Link URL (optional)"><Input value={a.href || ""} onChange={(e) => onChange({ href: e.target.value })} /></Field>
          <Field label="Width (px)"><Input type="number" value={a.width || 600} onChange={(e) => onChange({ width: Number(e.target.value) })} /></Field>
          <AlignField value={a.align} onChange={(align) => onChange({ align })} />
        </>
      );
    case "divider":
      return (
        <>
          <Field label="Color"><Input type="color" value={a.color || "#e4e4e7"} onChange={(e) => onChange({ color: e.target.value })} /></Field>
          <Field label="Thickness"><Input type="number" min={1} max={10} value={a.thickness || 1} onChange={(e) => onChange({ thickness: Number(e.target.value) })} /></Field>
        </>
      );
    case "spacer":
      return <Field label="Height (px)"><Input type="number" value={a.height || 32} onChange={(e) => onChange({ height: Number(e.target.value) })} /></Field>;
    case "section":
      return (
        <>
          <Field label="Background color"><Input type="color" value={a.backgroundColor || "#ffffff"} onChange={(e) => onChange({ backgroundColor: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Padding top"><Input type="number" value={a.paddingTop ?? 24} onChange={(e) => onChange({ paddingTop: Number(e.target.value) })} /></Field>
            <Field label="Padding bottom"><Input type="number" value={a.paddingBottom ?? 24} onChange={(e) => onChange({ paddingBottom: Number(e.target.value) })} /></Field>
          </div>
        </>
      );
    case "html":
      return (
        <Field label="Raw HTML">
          <Textarea rows={6} className="font-mono text-xs" value={a.html || ""} onChange={(e) => onChange({ html: e.target.value })} />
        </Field>
      );
    case "merge-snippet":
      return (
        <Field label="Snippet">
          <Select value={a.snippet || "footer-with-unsubscribe"} onValueChange={(v) => onChange({ snippet: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="footer-with-unsubscribe">Footer with unsubscribe</SelectItem>
              <SelectItem value="view-in-browser">View in browser</SelectItem>
              <SelectItem value="address-block">Address block</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      );
    default:
      return <p className="text-xs text-muted-foreground">No editable attributes.</p>;
  }
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function AlignField({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  return (
    <Field label="Align">
      <Select value={value || "left"} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="left">Left</SelectItem>
          <SelectItem value="center">Center</SelectItem>
          <SelectItem value="right">Right</SelectItem>
        </SelectContent>
      </Select>
    </Field>
  );
}
