"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/select-tabs";
import { Textarea } from "@/components/ui/input";
import { toast } from "sonner";
import { Copy } from "lucide-react";

export function EmbedSnippet({ formId, appUrl }: { formId: number; appUrl: string }) {
  const iframeSnippet = `<iframe src="${appUrl}/subscribe/${formId}" width="100%" height="480" style="border:0;border-radius:12px;max-width:480px" loading="lazy"></iframe>`;

  const htmlSnippet = `<form action="${appUrl}/api/subscribe" method="post" style="max-width:420px;display:flex;flex-direction:column;gap:8px">
  <input type="hidden" name="formId" value="${formId}" />
  <input type="email" name="email" required placeholder="you@example.com" style="padding:10px;border:1px solid #ccc;border-radius:6px" />
  <input type="text" name="firstName" placeholder="First name" style="padding:10px;border:1px solid #ccc;border-radius:6px" />
  <button type="submit" style="padding:10px;background:#2563eb;color:#fff;border:0;border-radius:6px;cursor:pointer">Subscribe</button>
</form>`;

  const hostedUrl = `${appUrl}/subscribe/${formId}`;

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <Tabs defaultValue="iframe">
      <TabsList>
        <TabsTrigger value="iframe">iframe</TabsTrigger>
        <TabsTrigger value="html">HTML form</TabsTrigger>
        <TabsTrigger value="link">Direct link</TabsTrigger>
      </TabsList>

      <TabsContent value="iframe" className="space-y-3">
        <Textarea readOnly rows={3} value={iframeSnippet} className="font-mono text-xs" />
        <Button size="sm" onClick={() => copy(iframeSnippet, "iframe snippet")}>
          <Copy className="mr-1 h-3.5 w-3.5" />Copy
        </Button>
      </TabsContent>

      <TabsContent value="html" className="space-y-3">
        <Textarea readOnly rows={9} value={htmlSnippet} className="font-mono text-xs" />
        <p className="text-xs text-muted-foreground">
          A fully native HTML form. Style it to match your site. POSTs to <code className="rounded bg-muted px-1">/api/subscribe</code>.
        </p>
        <Button size="sm" onClick={() => copy(htmlSnippet, "HTML snippet")}>
          <Copy className="mr-1 h-3.5 w-3.5" />Copy
        </Button>
      </TabsContent>

      <TabsContent value="link" className="space-y-3">
        <div className="rounded-md border border-border bg-muted p-3 font-mono text-sm break-all">{hostedUrl}</div>
        <Button size="sm" onClick={() => copy(hostedUrl, "Link")}>
          <Copy className="mr-1 h-3.5 w-3.5" />Copy link
        </Button>
      </TabsContent>
    </Tabs>
  );
}
