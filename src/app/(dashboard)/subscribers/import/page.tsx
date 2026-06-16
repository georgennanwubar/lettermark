import { PageHeader, PageBody } from "@/components/layout/topbar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ImportForm } from "./import-form";

export const metadata = { title: "Import subscribers" };

export default function ImportPage() {
  return (
    <>
      <PageHeader title="Import subscribers" description="Paste CSV with at least an 'email' column" />
      <PageBody>
        <div className="mx-auto max-w-2xl">
          <Card>
            <CardHeader>
              <CardTitle>Paste CSV</CardTitle>
              <CardDescription>
                Headers must be on the first line. Optional columns: <code className="rounded bg-muted px-1">first_name</code>, <code className="rounded bg-muted px-1">last_name</code>, <code className="rounded bg-muted px-1">status</code>.
              </CardDescription>
            </CardHeader>
            <CardContent><ImportForm /></CardContent>
          </Card>
        </div>
      </PageBody>
    </>
  );
}
