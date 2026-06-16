/**
 * dashboard/campaign-status-badge.tsx + subscriber-status-badge.tsx
 *
 * Maps enum string -> visual variant. Centralized so we never have one
 * "sent" green badge and another "sent" blue badge across pages.
 */
import { Badge } from "@/components/ui/card";

type CampaignStatus =
  | "draft"
  | "scheduled"
  | "queued"
  | "sending"
  | "paused"
  | "sent"
  | "failed"
  | "archived";

const campaignMap: Record<CampaignStatus, { label: string; variant: any }> = {
  draft: { label: "Draft", variant: "outline" },
  scheduled: { label: "Scheduled", variant: "info" },
  queued: { label: "Queued", variant: "info" },
  sending: { label: "Sending", variant: "warning" },
  paused: { label: "Paused", variant: "secondary" },
  sent: { label: "Sent", variant: "success" },
  failed: { label: "Failed", variant: "destructive" },
  archived: { label: "Archived", variant: "outline" },
};

export function CampaignStatusBadge({ status }: { status: string }) {
  const m = campaignMap[status as CampaignStatus] ?? { label: status, variant: "secondary" };
  return <Badge variant={m.variant}>{m.label}</Badge>;
}

type SubscriberStatus =
  | "pending"
  | "subscribed"
  | "unsubscribed"
  | "hard_bounced"
  | "soft_bounced"
  | "complained";

const subscriberMap: Record<SubscriberStatus, { label: string; variant: any }> = {
  pending: { label: "Pending", variant: "warning" },
  subscribed: { label: "Subscribed", variant: "success" },
  unsubscribed: { label: "Unsubscribed", variant: "secondary" },
  hard_bounced: { label: "Hard bounced", variant: "destructive" },
  soft_bounced: { label: "Soft bounced", variant: "warning" },
  complained: { label: "Complained", variant: "destructive" },
};

export function SubscriberStatusBadge({ status }: { status: string }) {
  const m = subscriberMap[status as SubscriberStatus] ?? { label: status, variant: "secondary" };
  return <Badge variant={m.variant}>{m.label}</Badge>;
}
