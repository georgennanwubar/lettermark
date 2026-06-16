/**
 * settings/page.tsx — Workspace settings.
 *
 * Tabs: General (from-identity, name), Delivery (email provider credentials),
 * Team (members — placeholder), Custom fields (placeholder).
 */
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { emailProviders } from "@/lib/db/schema";
import { PageHeader, PageBody } from "@/components/layout/topbar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/select-tabs";
import { AccountForm } from "./account-form";
import { DeliveryForm } from "./delivery-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { account } = await requireAuth();
  const provider = await db.query.emailProviders.findFirst({ where: eq(emailProviders.accountId, account.id) });

  return (
    <>
      <PageHeader title="Settings" description="Workspace and delivery configuration" />
      <PageBody>
        <Tabs defaultValue="general">
          <TabsList>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="delivery">Delivery</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
          </TabsList>

          <TabsContent value="general">
            <Card>
              <CardHeader>
                <CardTitle>Workspace</CardTitle>
                <CardDescription>Name and default from-identity for new campaigns</CardDescription>
              </CardHeader>
              <CardContent>
                <AccountForm
                  name={account.name}
                  defaultFromName={account.defaultFromName ?? ""}
                  defaultFromEmail={account.defaultFromEmail ?? ""}
                  defaultReplyTo={account.defaultReplyTo ?? ""}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="delivery">
            <Card>
              <CardHeader>
                <CardTitle>Email delivery</CardTitle>
                <CardDescription>Configure the provider that sends your campaigns</CardDescription>
              </CardHeader>
              <CardContent>
                <DeliveryForm
                  initial={provider ? { kind: provider.kind, name: provider.name, credentials: provider.credentials } : null}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="team">
            <Card>
              <CardHeader>
                <CardTitle>Team</CardTitle>
                <CardDescription>Invite teammates to collaborate</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Team management UI is on the roadmap. The data model already supports multiple users via{" "}
                  <code className="rounded bg-muted px-1">account_members</code>.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </PageBody>
    </>
  );
}
