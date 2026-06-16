/**
 * forms/[id]/page.tsx — Form settings & embed snippet.
 *
 * Two main areas:
 *   - Settings (name, double opt-in, redirect URLs, field definitions)
 *   - Embed (HTML snippet + hosted URL)
 *
 * The form's `schema` field is editable as JSON for flexibility — a full visual
 * field builder is out of scope for the MVP. The hosted page renders correctly
 * from whatever JSON shape the user enters.
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { forms } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth/session";
import { PageHeader, PageBody } from "@/components/layout/topbar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/select-tabs";
import { Button } from "@/components/ui/button";
import { deleteForm } from "../actions";
import { Trash2, ExternalLink } from "lucide-react";
import { FormSettingsEditor } from "./settings-editor";
import { EmbedSnippet } from "./embed-snippet";

export const dynamic = "force-dynamic";

interface PageProps { params: Promise<{ id: string }> }

export default async function FormDetailPage({ params }: PageProps) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) notFound();
  const { account } = await requireAuth();
  const f = await db.query.forms.findFirst({
    where: and(eq(forms.accountId, account.id), eq(forms.id, id)),
  });
  if (!f) notFound();

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";

  return (
    <>
      <PageHeader
        title={f.name}
        description={`Type: ${f.type} · ${f.doubleOptIn ? "Double opt-in" : "Single opt-in"}`}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href={`/subscribe/${f.id}`} target="_blank">
              <ExternalLink className="mr-1 h-4 w-4" />Hosted page
            </Link>
          </Button>
        }
      />
      <PageBody>
        <Tabs defaultValue="settings">
          <TabsList>
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="embed">Embed</TabsTrigger>
            <TabsTrigger value="danger">Danger</TabsTrigger>
          </TabsList>

          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <CardTitle>Form settings</CardTitle>
                <CardDescription>Edit fields and behavior</CardDescription>
              </CardHeader>
              <CardContent>
                <FormSettingsEditor form={f} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="embed">
            <Card>
              <CardHeader>
                <CardTitle>Embed snippet</CardTitle>
                <CardDescription>Drop this HTML into any website</CardDescription>
              </CardHeader>
              <CardContent>
                <EmbedSnippet formId={f.id} appUrl={appUrl} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="danger">
            <Card>
              <CardHeader>
                <CardTitle className="text-destructive">Delete this form</CardTitle>
                <CardDescription>Existing submissions will be preserved; the form itself will be removed.</CardDescription>
              </CardHeader>
              <CardContent>
                <form action={deleteForm}>
                  <input type="hidden" name="id" value={f.id} />
                  <Button type="submit" variant="ghost" className="text-destructive hover:bg-destructive/10">
                    <Trash2 className="mr-1 h-4 w-4" />Delete form
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </PageBody>
    </>
  );
}
