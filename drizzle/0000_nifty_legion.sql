CREATE TYPE "public"."campaign_status" AS ENUM('draft', 'scheduled', 'queued', 'sending', 'paused', 'sent', 'failed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."campaign_type" AS ENUM('standard', 'automation', 'autoresponder', 'rss', 'transactional');--> statement-breakpoint
CREATE TYPE "public"."form_type" AS ENUM('inline', 'popup', 'embedded', 'landing');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'admin', 'editor', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."provider_kind" AS ENUM('smtp', 'resend', 'mailgun', 'sendgrid', 'postmark', 'ses');--> statement-breakpoint
CREATE TYPE "public"."queue_state" AS ENUM('pending', 'sending', 'sent', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."subscriber_status" AS ENUM('pending', 'subscribed', 'unsubscribed', 'hard_bounced', 'soft_bounced', 'complained');--> statement-breakpoint
CREATE TYPE "public"."workflow_status" AS ENUM('draft', 'active', 'paused');--> statement-breakpoint
CREATE TABLE "account_members" (
	"account_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"role" "member_role" DEFAULT 'owner' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_members_account_id_user_id_pk" PRIMARY KEY("account_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" varchar(191) NOT NULL,
	"slug" varchar(191) NOT NULL,
	"subscriber_count" integer DEFAULT 0 NOT NULL,
	"subscriber_limit" integer,
	"monthly_send_limit" integer,
	"default_from_name" varchar(191),
	"default_from_email" varchar(191),
	"default_reply_to" varchar(191),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "action_bounces" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"campaign_id" bigint,
	"subscriber_id" bigint,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" varchar(45),
	"user_agent" text,
	"country" varchar(2),
	"hard" boolean DEFAULT false NOT NULL,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "action_clicks" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"campaign_id" bigint,
	"subscriber_id" bigint,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" varchar(45),
	"user_agent" text,
	"country" varchar(2),
	"link_id" bigint
);
--> statement-breakpoint
CREATE TABLE "action_complaints" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"campaign_id" bigint,
	"subscriber_id" bigint,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" varchar(45),
	"user_agent" text,
	"country" varchar(2)
);
--> statement-breakpoint
CREATE TABLE "action_opens" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"campaign_id" bigint,
	"subscriber_id" bigint,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" varchar(45),
	"user_agent" text,
	"country" varchar(2)
);
--> statement-breakpoint
CREATE TABLE "action_sent" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"campaign_id" bigint,
	"subscriber_id" bigint,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" varchar(45),
	"user_agent" text,
	"country" varchar(2)
);
--> statement-breakpoint
CREATE TABLE "action_unsubs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"campaign_id" bigint,
	"subscriber_id" bigint,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" varchar(45),
	"user_agent" text,
	"country" varchar(2),
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"type" "campaign_type" DEFAULT 'standard' NOT NULL,
	"status" "campaign_status" DEFAULT 'draft' NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"preheader" text,
	"from_name" varchar(191),
	"from_email" varchar(191),
	"reply_to" varchar(191),
	"content_json" jsonb,
	"content_html" text,
	"content_text" text,
	"audience" jsonb,
	"scheduled_for" timestamp with time zone,
	"timezone_aware" boolean DEFAULT false NOT NULL,
	"track_opens" boolean DEFAULT true NOT NULL,
	"track_clicks" boolean DEFAULT true NOT NULL,
	"total_recipients" integer DEFAULT 0 NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"open_count" integer DEFAULT 0 NOT NULL,
	"click_count" integer DEFAULT 0 NOT NULL,
	"bounce_count" integer DEFAULT 0 NOT NULL,
	"unsubscribe_count" integer DEFAULT 0 NOT NULL,
	"meta" jsonb,
	"created_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "email_providers" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"kind" "provider_kind" NOT NULL,
	"name" varchar(191) NOT NULL,
	"credentials" jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"rate_limit" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forms" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"name" varchar(191) NOT NULL,
	"type" "form_type" DEFAULT 'inline' NOT NULL,
	"schema" jsonb NOT NULL,
	"target_lists" jsonb,
	"target_tags" jsonb,
	"double_opt_in" boolean DEFAULT true NOT NULL,
	"success_url" text,
	"confirm_redirect_url" text,
	"submissions" integer DEFAULT 0 NOT NULL,
	"conversions" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "links" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"campaign_id" bigint NOT NULL,
	"url" text NOT NULL,
	"label" varchar(255),
	"click_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "list_subscribers" (
	"list_id" bigint NOT NULL,
	"subscriber_id" bigint NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "list_subscribers_list_id_subscriber_id_pk" PRIMARY KEY("list_id","subscriber_id")
);
--> statement-breakpoint
CREATE TABLE "lists" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"parent_id" bigint,
	"name" varchar(191) NOT NULL,
	"slug" varchar(191) NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "queue" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"campaign_id" bigint NOT NULL,
	"subscriber_id" bigint NOT NULL,
	"state" "queue_state" DEFAULT 'pending' NOT NULL,
	"priority" smallint DEFAULT 0 NOT NULL,
	"send_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"last_error" text,
	"workflow_run_id" bigint,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "send_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"campaign_id" bigint,
	"subscriber_id" bigint,
	"message_id" varchar(191),
	"success" boolean NOT NULL,
	"error" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriber_field_defs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"key" varchar(64) NOT NULL,
	"label" varchar(191) NOT NULL,
	"type" varchar(32) DEFAULT 'text' NOT NULL,
	"options" jsonb,
	"required" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscribers" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"hash" varchar(32) NOT NULL,
	"email" varchar(191) NOT NULL,
	"status" "subscriber_status" DEFAULT 'pending' NOT NULL,
	"first_name" varchar(191),
	"last_name" varchar(191),
	"rating" numeric(3, 2) DEFAULT '0.25' NOT NULL,
	"ip_signup" varchar(45),
	"ip_confirm" varchar(45),
	"signup_at" timestamp with time zone,
	"confirm_at" timestamp with time zone,
	"unsubscribe_at" timestamp with time zone,
	"timezone" varchar(64),
	"locale" varchar(8),
	"country" varchar(2),
	"custom_fields" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tag_subscribers" (
	"tag_id" bigint NOT NULL,
	"subscriber_id" bigint NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tag_subscribers_tag_id_subscriber_id_pk" PRIMARY KEY("tag_id","subscriber_id")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"name" varchar(191) NOT NULL,
	"color" varchar(16),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint,
	"name" varchar(191) NOT NULL,
	"description" text,
	"thumbnail" text,
	"category" varchar(64),
	"content_json" jsonb NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"email" varchar(191) NOT NULL,
	"password_hash" text NOT NULL,
	"name" varchar(191),
	"email_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "workflow_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"workflow_id" bigint NOT NULL,
	"subscriber_id" bigint NOT NULL,
	"current_node_id" varchar(64),
	"wait_until" timestamp with time zone,
	"context" jsonb,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "workflows" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"name" varchar(191) NOT NULL,
	"description" text,
	"status" "workflow_status" DEFAULT 'draft' NOT NULL,
	"graph" jsonb NOT NULL,
	"enrolled_count" integer DEFAULT 0 NOT NULL,
	"completed_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_members" ADD CONSTRAINT "account_members_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_members" ADD CONSTRAINT "account_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_bounces" ADD CONSTRAINT "action_bounces_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_bounces" ADD CONSTRAINT "action_bounces_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_clicks" ADD CONSTRAINT "action_clicks_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_clicks" ADD CONSTRAINT "action_clicks_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_complaints" ADD CONSTRAINT "action_complaints_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_complaints" ADD CONSTRAINT "action_complaints_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_opens" ADD CONSTRAINT "action_opens_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_opens" ADD CONSTRAINT "action_opens_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_sent" ADD CONSTRAINT "action_sent_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_sent" ADD CONSTRAINT "action_sent_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_unsubs" ADD CONSTRAINT "action_unsubs_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_unsubs" ADD CONSTRAINT "action_unsubs_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_providers" ADD CONSTRAINT "email_providers_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forms" ADD CONSTRAINT "forms_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_subscribers" ADD CONSTRAINT "list_subscribers_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_subscribers" ADD CONSTRAINT "list_subscribers_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue" ADD CONSTRAINT "queue_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue" ADD CONSTRAINT "queue_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "send_log" ADD CONSTRAINT "send_log_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "send_log" ADD CONSTRAINT "send_log_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "send_log" ADD CONSTRAINT "send_log_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriber_field_defs" ADD CONSTRAINT "subscriber_field_defs_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscribers" ADD CONSTRAINT "subscribers_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag_subscribers" ADD CONSTRAINT "tag_subscribers_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag_subscribers" ADD CONSTRAINT "tag_subscribers_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bounces_campaign_idx" ON "action_bounces" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "clicks_campaign_idx" ON "action_clicks" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "clicks_link_idx" ON "action_clicks" USING btree ("link_id");--> statement-breakpoint
CREATE INDEX "complaints_campaign_idx" ON "action_complaints" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "opens_campaign_idx" ON "action_opens" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "opens_subscriber_idx" ON "action_opens" USING btree ("subscriber_id");--> statement-breakpoint
CREATE INDEX "sent_campaign_idx" ON "action_sent" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "unsubs_campaign_idx" ON "action_unsubs" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "campaigns_account_status_idx" ON "campaigns" USING btree ("account_id","status");--> statement-breakpoint
CREATE INDEX "campaigns_scheduled_idx" ON "campaigns" USING btree ("scheduled_for");--> statement-breakpoint
CREATE INDEX "providers_account_idx" ON "email_providers" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "forms_account_idx" ON "forms" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "links_campaign_idx" ON "links" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "list_subs_subscriber_idx" ON "list_subscribers" USING btree ("subscriber_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lists_account_slug_idx" ON "lists" USING btree ("account_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "queue_campaign_subscriber_idx" ON "queue" USING btree ("campaign_id","subscriber_id");--> statement-breakpoint
CREATE INDEX "queue_pickup_idx" ON "queue" USING btree ("state","send_at");--> statement-breakpoint
CREATE INDEX "send_log_account_time_idx" ON "send_log" USING btree ("account_id","sent_at");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "field_defs_account_key_idx" ON "subscriber_field_defs" USING btree ("account_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "subscribers_account_email_idx" ON "subscribers" USING btree ("account_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "subscribers_hash_idx" ON "subscribers" USING btree ("hash");--> statement-breakpoint
CREATE INDEX "subscribers_status_idx" ON "subscribers" USING btree ("account_id","status");--> statement-breakpoint
CREATE INDEX "subscribers_rating_idx" ON "subscribers" USING btree ("account_id","rating");--> statement-breakpoint
CREATE INDEX "tag_subs_subscriber_idx" ON "tag_subscribers" USING btree ("subscriber_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_account_name_idx" ON "tags" USING btree ("account_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "runs_workflow_sub_idx" ON "workflow_runs" USING btree ("workflow_id","subscriber_id");--> statement-breakpoint
CREATE INDEX "runs_wait_idx" ON "workflow_runs" USING btree ("wait_until");