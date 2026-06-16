/**
 * campaigns/new/page.tsx — Minimal create form.
 * After submit, redirects to the editor for the new campaign.
 */
import { PageHeader, PageBody } from "@/components/layout/topbar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { NewCampaignForm } from "./new-form";

export const metadata = { title: "New campaign" };

export default function NewCampaignPage() {
  return (
    <>
      <PageHeader title="New campaign" description="Start with a subject — design comes next" />
      <PageBody>
        <div className="mx-auto max-w-xl">
          <Card>
            <CardHeader>
              <CardTitle>Campaign details</CardTitle>
              <CardDescription>You can change everything later. We just need a name to get going.</CardDescription>
            </CardHeader>
            <CardContent>
              <NewCampaignForm />
            </CardContent>
          </Card>
        </div>
      </PageBody>
    </>
  );
}
