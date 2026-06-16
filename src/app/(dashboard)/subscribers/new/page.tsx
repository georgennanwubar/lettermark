import { PageHeader, PageBody } from "@/components/layout/topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NewSubscriberForm } from "./new-form";

export const metadata = { title: "Add subscriber" };

export default function NewSubscriberPage() {
  return (
    <>
      <PageHeader title="Add subscriber" />
      <PageBody>
        <div className="mx-auto max-w-lg">
          <Card>
            <CardHeader><CardTitle>Subscriber details</CardTitle></CardHeader>
            <CardContent><NewSubscriberForm /></CardContent>
          </Card>
        </div>
      </PageBody>
    </>
  );
}
