/**
 * Database schema.
 *
 * Modeled directly on Mailster's table layout (subscribers, queue, action_*, lists,
 * tags, forms, workflows) but adapted to Postgres + a multi-account, multi-user model.
 *
 * Conventions:
 *  - `bigserial` ids everywhere.
 *  - timestamps as `timestamp with time zone` (not unix ints).
 *  - join tables use composite primary keys.
 *  - tracking tables (sent / opens / clicks / etc.) are append-only, lightly indexed
 *    to keep writes cheap on hot paths.
 */

import {
  pgTable,
  pgEnum,
  bigserial,
  bigint,
  varchar,
  text,
  integer,
  smallint,
  boolean,
  timestamp,
  jsonb,
  primaryKey,
  uniqueIndex,
  index,
  doublePrecision,
  decimal,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// ─── Enums ─────────────────────────────────────────────────────────────────

export const subscriberStatusEnum = pgEnum('subscriber_status', [
  'pending', // double-opt-in awaiting confirm
  'subscribed',
  'unsubscribed',
  'hard_bounced',
  'soft_bounced',
  'complained', // marked spam
]);

export const campaignTypeEnum = pgEnum('campaign_type', [
  'standard', // one-off broadcast
  'automation', // sent by a workflow step
  'autoresponder', // legacy time-based series
  'rss', // RSS to email
  'transactional', // welcome / confirm / system
]);

export const campaignStatusEnum = pgEnum('campaign_status', [
  'draft',
  'scheduled',
  'queued',
  'sending',
  'paused',
  'sent',
  'failed',
  'archived',
]);

export const formTypeEnum = pgEnum('form_type', ['inline', 'popup', 'embedded', 'landing']);

export const memberRoleEnum = pgEnum('member_role', ['owner', 'admin', 'editor', 'viewer']);

export const providerKindEnum = pgEnum('provider_kind', [
  'smtp',
  'resend',
  'mailgun',
  'sendgrid',
  'postmark',
  'ses',
]);

export const workflowStatusEnum = pgEnum('workflow_status', ['draft', 'active', 'paused']);

export const queueStateEnum = pgEnum('queue_state', [
  'pending',
  'sending',
  'sent',
  'failed',
  'skipped',
]);

// ─── Accounts & users ──────────────────────────────────────────────────────

/**
 * An account is a tenant. One signup creates one account.
 * Users belong to an account via the `accountMembers` table.
 */
export const accounts = pgTable('accounts', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  name: varchar('name', { length: 191 }).notNull(),
  slug: varchar('slug', { length: 191 }).notNull().unique(),
  // Computed counters (kept in sync by triggers / app code to avoid COUNT(*))
  subscriberCount: integer('subscriber_count').notNull().default(0),
  // Limits — useful for hosted SaaS, ignored on self-host
  subscriberLimit: integer('subscriber_limit'),
  monthlySendLimit: integer('monthly_send_limit'),
  // From-identity defaults; per-campaign overrides allowed
  defaultFromName: varchar('default_from_name', { length: 191 }),
  defaultFromEmail: varchar('default_from_email', { length: 191 }),
  defaultReplyTo: varchar('default_reply_to', { length: 191 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable(
  'users',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    email: varchar('email', { length: 191 }).notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    name: varchar('name', { length: 191 }),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ emailIdx: uniqueIndex('users_email_idx').on(t.email) })
);

export const accountMembers = pgTable(
  'account_members',
  {
    accountId: bigint('account_id', { mode: 'number' })
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: memberRoleEnum('role').notNull().default('owner'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.accountId, t.userId] }) })
);

export const sessions = pgTable(
  'sessions',
  {
    id: varchar('id', { length: 64 }).primaryKey(), // random token
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ userIdx: index('sessions_user_idx').on(t.userId) })
);

// ─── Subscribers ───────────────────────────────────────────────────────────

export const subscribers = pgTable(
  'subscribers',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    accountId: bigint('account_id', { mode: 'number' })
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    // 32-char hex hash used in tracking links and unsubscribe URLs (privacy: no email in URLs)
    hash: varchar('hash', { length: 32 }).notNull(),
    email: varchar('email', { length: 191 }).notNull(),
    status: subscriberStatusEnum('status').notNull().default('pending'),
    firstName: varchar('first_name', { length: 191 }),
    lastName: varchar('last_name', { length: 191 }),
    // The "rating" Mailster uses (0–1) — predicts engagement
    rating: decimal('rating', { precision: 3, scale: 2 }).notNull().default('0.25'),
    // GDPR / opt-in audit
    ipSignup: varchar('ip_signup', { length: 45 }),
    ipConfirm: varchar('ip_confirm', { length: 45 }),
    signupAt: timestamp('signup_at', { withTimezone: true }),
    confirmAt: timestamp('confirm_at', { withTimezone: true }),
    unsubscribeAt: timestamp('unsubscribe_at', { withTimezone: true }),
    // Last known geo / locale / timezone — used for time-zone-aware sending
    timezone: varchar('timezone', { length: 64 }),
    locale: varchar('locale', { length: 8 }),
    country: varchar('country', { length: 2 }),
    // Arbitrary structured custom fields (whatever the account defines)
    customFields: jsonb('custom_fields').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    accountEmailIdx: uniqueIndex('subscribers_account_email_idx').on(t.accountId, t.email),
    hashIdx: uniqueIndex('subscribers_hash_idx').on(t.hash),
    statusIdx: index('subscribers_status_idx').on(t.accountId, t.status),
    ratingIdx: index('subscribers_rating_idx').on(t.accountId, t.rating),
  })
);

// Definition of custom fields the account uses (renders form inputs + segment options)
export const subscriberFieldDefs = pgTable(
  'subscriber_field_defs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    accountId: bigint('account_id', { mode: 'number' })
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    key: varchar('key', { length: 64 }).notNull(),
    label: varchar('label', { length: 191 }).notNull(),
    // text | number | date | select | checkbox | etc.
    type: varchar('type', { length: 32 }).notNull().default('text'),
    options: jsonb('options').$type<unknown[]>(), // for select fields
    required: boolean('required').notNull().default(false),
    position: integer('position').notNull().default(0),
  },
  (t) => ({ accountKeyIdx: uniqueIndex('field_defs_account_key_idx').on(t.accountId, t.key) })
);

// ─── Lists & tags ──────────────────────────────────────────────────────────

export const lists = pgTable(
  'lists',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    accountId: bigint('account_id', { mode: 'number' })
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    parentId: bigint('parent_id', { mode: 'number' }), // nested lists supported
    name: varchar('name', { length: 191 }).notNull(),
    slug: varchar('slug', { length: 191 }).notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ slugIdx: uniqueIndex('lists_account_slug_idx').on(t.accountId, t.slug) })
);

export const listSubscribers = pgTable(
  'list_subscribers',
  {
    listId: bigint('list_id', { mode: 'number' })
      .notNull()
      .references(() => lists.id, { onDelete: 'cascade' }),
    subscriberId: bigint('subscriber_id', { mode: 'number' })
      .notNull()
      .references(() => subscribers.id, { onDelete: 'cascade' }),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.listId, t.subscriberId] }),
    subscriberIdx: index('list_subs_subscriber_idx').on(t.subscriberId),
  })
);

export const tags = pgTable(
  'tags',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    accountId: bigint('account_id', { mode: 'number' })
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 191 }).notNull(),
    color: varchar('color', { length: 16 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ nameIdx: uniqueIndex('tags_account_name_idx').on(t.accountId, t.name) })
);

export const tagSubscribers = pgTable(
  'tag_subscribers',
  {
    tagId: bigint('tag_id', { mode: 'number' })
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
    subscriberId: bigint('subscriber_id', { mode: 'number' })
      .notNull()
      .references(() => subscribers.id, { onDelete: 'cascade' }),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.tagId, t.subscriberId] }),
    subscriberIdx: index('tag_subs_subscriber_idx').on(t.subscriberId),
  })
);

// ─── Campaigns ─────────────────────────────────────────────────────────────

export const campaigns = pgTable(
  'campaigns',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    accountId: bigint('account_id', { mode: 'number' })
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    type: campaignTypeEnum('type').notNull().default('standard'),
    status: campaignStatusEnum('status').notNull().default('draft'),
    subject: text('subject').notNull().default(''),
    preheader: text('preheader'),
    fromName: varchar('from_name', { length: 191 }),
    fromEmail: varchar('from_email', { length: 191 }),
    replyTo: varchar('reply_to', { length: 191 }),
    // The block-based JSON content used by the editor
    contentJson: jsonb('content_json').$type<unknown>(),
    // Rendered HTML (cached on save / send)
    contentHtml: text('content_html'),
    contentText: text('content_text'),
    // Audience targeting — sums of lists, tags, segments, and segment filter JSON
    audience: jsonb('audience').$type<{
      lists?: number[];
      tags?: number[];
      excludeLists?: number[];
      excludeTags?: number[];
      filters?: unknown;
    }>(),
    // Send-time options
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }),
    timezoneAware: boolean('timezone_aware').notNull().default(false),
    trackOpens: boolean('track_opens').notNull().default(true),
    trackClicks: boolean('track_clicks').notNull().default(true),
    // Snapshot counters — cheap to read from list views
    totalRecipients: integer('total_recipients').notNull().default(0),
    sentCount: integer('sent_count').notNull().default(0),
    openCount: integer('open_count').notNull().default(0),
    clickCount: integer('click_count').notNull().default(0),
    bounceCount: integer('bounce_count').notNull().default(0),
    unsubscribeCount: integer('unsubscribe_count').notNull().default(0),
    // Free-form metadata for autoresponder / rss / workflow campaigns
    meta: jsonb('meta').$type<Record<string, unknown>>(),
    createdBy: bigint('created_by', { mode: 'number' }).references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  (t) => ({
    accountStatusIdx: index('campaigns_account_status_idx').on(t.accountId, t.status),
    scheduledIdx: index('campaigns_scheduled_idx').on(t.scheduledFor),
  })
);

// ─── Send queue ─────────────────────────────────────────────────────────────
// Each row = "send this one email to this one subscriber". The worker drains it.
export const queue = pgTable(
  'queue',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    campaignId: bigint('campaign_id', { mode: 'number' })
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    subscriberId: bigint('subscriber_id', { mode: 'number' })
      .notNull()
      .references(() => subscribers.id, { onDelete: 'cascade' }),
    state: queueStateEnum('state').notNull().default('pending'),
    priority: smallint('priority').notNull().default(0),
    // When this row should be processed (timezone-aware sends offset this per subscriber)
    sendAt: timestamp('send_at', { withTimezone: true }).notNull().defaultNow(),
    attempts: smallint('attempts').notNull().default(0),
    lastError: text('last_error'),
    // Workflow context (which step this is from, if any)
    workflowRunId: bigint('workflow_run_id', { mode: 'number' }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  (t) => ({
    // Don't queue the same email to the same subscriber twice
    uniq: uniqueIndex('queue_campaign_subscriber_idx').on(t.campaignId, t.subscriberId),
    pickupIdx: index('queue_pickup_idx').on(t.state, t.sendAt),
  })
);

// ─── Tracking tables (append-only, write-heavy) ─────────────────────────────

const trackingColumns = {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  campaignId: bigint('campaign_id', { mode: 'number' }).references(() => campaigns.id, {
    onDelete: 'cascade',
  }),
  subscriberId: bigint('subscriber_id', { mode: 'number' }).references(() => subscribers.id, {
    onDelete: 'set null',
  }),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  country: varchar('country', { length: 2 }),
};

export const actionSent = pgTable('action_sent', trackingColumns, (t) => ({
  campIdx: index('sent_campaign_idx').on(t.campaignId),
}));

export const actionOpens = pgTable('action_opens', trackingColumns, (t) => ({
  campIdx: index('opens_campaign_idx').on(t.campaignId),
  subIdx: index('opens_subscriber_idx').on(t.subscriberId),
}));

export const actionClicks = pgTable(
  'action_clicks',
  {
    ...trackingColumns,
    linkId: bigint('link_id', { mode: 'number' }),
  },
  (t) => ({
    campIdx: index('clicks_campaign_idx').on(t.campaignId),
    linkIdx: index('clicks_link_idx').on(t.linkId),
  })
);

export const actionBounces = pgTable(
  'action_bounces',
  {
    ...trackingColumns,
    hard: boolean('hard').notNull().default(false),
    reason: text('reason'),
  },
  (t) => ({ campIdx: index('bounces_campaign_idx').on(t.campaignId) })
);

export const actionUnsubs = pgTable(
  'action_unsubs',
  {
    ...trackingColumns,
    reason: text('reason'),
  },
  (t) => ({ campIdx: index('unsubs_campaign_idx').on(t.campaignId) })
);

export const actionComplaints = pgTable('action_complaints', trackingColumns, (t) => ({
  campIdx: index('complaints_campaign_idx').on(t.campaignId),
}));

// Tracked links: every URL in a campaign body gets an entry so /api/track/click can redirect
export const links = pgTable(
  'links',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    campaignId: bigint('campaign_id', { mode: 'number' })
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    label: varchar('label', { length: 255 }),
    clickCount: integer('click_count').notNull().default(0),
  },
  (t) => ({ campIdx: index('links_campaign_idx').on(t.campaignId) })
);

// ─── Forms ─────────────────────────────────────────────────────────────────

export const forms = pgTable(
  'forms',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    accountId: bigint('account_id', { mode: 'number' })
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 191 }).notNull(),
    type: formTypeEnum('type').notNull().default('inline'),
    // Field definitions, layout, styling, copy — all as JSON
    schema: jsonb('schema').$type<unknown>().notNull(),
    // Lists & tags new subscribers from this form should be added to
    targetLists: jsonb('target_lists').$type<number[]>(),
    targetTags: jsonb('target_tags').$type<number[]>(),
    doubleOptIn: boolean('double_opt_in').notNull().default(true),
    // Where to redirect after submit / confirm
    successUrl: text('success_url'),
    confirmRedirectUrl: text('confirm_redirect_url'),
    submissions: integer('submissions').notNull().default(0),
    conversions: integer('conversions').notNull().default(0), // confirmed signups
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ accountIdx: index('forms_account_idx').on(t.accountId) })
);

// ─── Workflows (automation) ─────────────────────────────────────────────────

export const workflows = pgTable('workflows', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  accountId: bigint('account_id', { mode: 'number' })
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 191 }).notNull(),
  description: text('description'),
  status: workflowStatusEnum('status').notNull().default('draft'),
  /**
   * Graph: { triggers: [...], nodes: [...], edges: [...] }
   * - triggers: signup, tag-added, list-added, date (birthday), webhook, manual
   * - nodes: send-campaign, delay, condition, add-tag, remove-tag, end
   */
  graph: jsonb('graph').$type<unknown>().notNull(),
  enrolledCount: integer('enrolled_count').notNull().default(0),
  completedCount: integer('completed_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Subscriber's current position in a workflow (one row per enrollment)
export const workflowRuns = pgTable(
  'workflow_runs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    workflowId: bigint('workflow_id', { mode: 'number' })
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),
    subscriberId: bigint('subscriber_id', { mode: 'number' })
      .notNull()
      .references(() => subscribers.id, { onDelete: 'cascade' }),
    currentNodeId: varchar('current_node_id', { length: 64 }),
    // When to advance to currentNode (set by delay steps)
    waitUntil: timestamp('wait_until', { withTimezone: true }),
    context: jsonb('context').$type<Record<string, unknown>>(),
    enrolledAt: timestamp('enrolled_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    error: text('error'),
  },
  (t) => ({
    workflowSubIdx: index('runs_workflow_sub_idx').on(t.workflowId, t.subscriberId),
    waitIdx: index('runs_wait_idx').on(t.waitUntil),
  })
);

// ─── Templates ─────────────────────────────────────────────────────────────

export const templates = pgTable('templates', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  accountId: bigint('account_id', { mode: 'number' })
    .references(() => accounts.id, { onDelete: 'cascade' }), // null = system template
  name: varchar('name', { length: 191 }).notNull(),
  description: text('description'),
  thumbnail: text('thumbnail'),
  category: varchar('category', { length: 64 }),
  contentJson: jsonb('content_json').$type<unknown>().notNull(),
  isSystem: boolean('is_system').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Email provider configs (per-account) ──────────────────────────────────

export const emailProviders = pgTable(
  'email_providers',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    accountId: bigint('account_id', { mode: 'number' })
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    kind: providerKindEnum('kind').notNull(),
    name: varchar('name', { length: 191 }).notNull(),
    // Encrypted credentials (encrypt at app layer before insert)
    credentials: jsonb('credentials').$type<Record<string, string>>().notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    rateLimit: integer('rate_limit'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ accountIdx: index('providers_account_idx').on(t.accountId) })
);

// ─── Audit / outgoing email log (last N sends per account) ─────────────────

export const sendLog = pgTable(
  'send_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    accountId: bigint('account_id', { mode: 'number' })
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    campaignId: bigint('campaign_id', { mode: 'number' }).references(() => campaigns.id, {
      onDelete: 'set null',
    }),
    subscriberId: bigint('subscriber_id', { mode: 'number' }).references(() => subscribers.id, {
      onDelete: 'set null',
    }),
    messageId: varchar('message_id', { length: 191 }),
    success: boolean('success').notNull(),
    error: text('error'),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    accountTimeIdx: index('send_log_account_time_idx').on(t.accountId, t.sentAt),
  })
);

// ─── Relations (for typed joins in queries) ─────────────────────────────────

export const accountsRelations = relations(accounts, ({ many }) => ({
  members: many(accountMembers),
  subscribers: many(subscribers),
  lists: many(lists),
  tags: many(tags),
  campaigns: many(campaigns),
  forms: many(forms),
  workflows: many(workflows),
  providers: many(emailProviders),
}));

export const subscribersRelations = relations(subscribers, ({ many, one }) => ({
  account: one(accounts, { fields: [subscribers.accountId], references: [accounts.id] }),
  lists: many(listSubscribers),
  tags: many(tagSubscribers),
}));

export const campaignsRelations = relations(campaigns, ({ many, one }) => ({
  account: one(accounts, { fields: [campaigns.accountId], references: [accounts.id] }),
  links: many(links),
  queue: many(queue),
}));

export const listsRelations = relations(lists, ({ many, one }) => ({
  account: one(accounts, { fields: [lists.accountId], references: [accounts.id] }),
  subscribers: many(listSubscribers),
}));

// ─── Type exports ──────────────────────────────────────────────────────────

export type Account = typeof accounts.$inferSelect;
export type User = typeof users.$inferSelect;
export type Subscriber = typeof subscribers.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type List = typeof lists.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type Form = typeof forms.$inferSelect;
export type Workflow = typeof workflows.$inferSelect;
export type Template = typeof templates.$inferSelect;
export type QueueItem = typeof queue.$inferSelect;
export type EmailProvider = typeof emailProviders.$inferSelect;
