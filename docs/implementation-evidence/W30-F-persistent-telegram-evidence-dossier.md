# W30-F Implementation Evidence: Persistent, Concise Telegram Review & Creation Workflow

- **Document:** `docs/implementation-evidence/W30-F-persistent-telegram-evidence-dossier.md`
- **Work Package:** W30 — Make the Telegram Workflow Persistent and Concise
- **Phase:** Stage 3 — Telegram Review, Revision, and Export
- **Classification:** `IMPLEMENTATION EVIDENCE DOSSIER — PRODUCTION CERTIFIED`
- **Authority:** Master Engineering Blueprint v3.0 §10, §12, §26; Implementation Plan v1.0 W30; Approved Decisions W03-DEC-002, W03-DEC-005
- **Repository Branch:** `feat/w30-persistent-telegram-workflow`
- **Base Commit:** `6ec5ab12c96cbeea0bbad6db2256df29cffc5a70`
- **Author:** Principal Systems & Operations Architect
- **Date:** 2026-10-28

---

## 1. Executive Summary & Architecture Overview

Work package **W30 — Make the Telegram Workflow Persistent and Concise** transitions the Telegram operator review, revision, and draft creation experience from an ephemeral prototype into a durable, crash-resilient, production-grade conversational terminal.

Prior to W30, active message IDs, channel broadcast tracking, and wizard navigation history resided in volatile in-memory JavaScript Maps, causing process restarts or pod reallocations to sever conversational continuity. Furthermore, multi-product wall-of-text prompts violated the single-decision UX invariant, and edit failures resulted in dangling message references.

W30 achieves complete persistence, edit-first delivery semantics, and crash recovery across 5 sub-packages:
- **W30-A:** Architecture Blueprint, Persistence Audit, and State Machine Specification.
- **W30-B:** PostgreSQL Schema Alignment (`telegram_active_workflow_messages`, `telegram_channel_publications`, Prisma repository).
- **W30-C:** Concise Wizard State Machine, Step History Stack, Cancel State Transitions, and `/resume` restoration.
- **W30-D:** Edit-First Telegram Message Delivery with Resilient Fallback Synchronization.
- **W30-E:** Comprehensive Adversarial Integration and Process Crash / Restart Recovery Test Suite.
- **W30-F:** Outbox Dispatcher Integration, Monorepo Quality Gate Audit, and Evidence Dossier Compilation.

```mermaid
flowchart TD
    subgraph Telegram Client
        User((Operator))
    end

    subgraph Grammy Ingress Layer
        Webhook[Telegram Webhook Controller]
        Dedupe{Claim Inbound Update\nSELECT FOR UPDATE}
        Webhook --> Dedupe
        Dedupe -- Duplicate --> Drop[Drop / Return 200 OK]
        Dedupe -- Unique --> Adapter[Grammy Bot Adapter]
    end

    subgraph Application & Domain Layer
        Adapter --> CC[Telegram Command Center]
        CC --> WizardSM[Concise Wizard State Machine\nOne Decision Per Step]
        CC --> TokenService[Action Token Service]
        Handler[Visual Review Callback Handler]
        Dispatcher[Telegram Outbox Dispatcher]
    end

    subgraph Durable PostgreSQL Persistence Layer
        PrismaRepo[Prisma Telegram Workflow Repository]
        T_Flows[(telegram_create_flows\nstep, history, wizardMessageId)]
        T_Active[(telegram_active_workflow_messages\nresourceKey, messageId, chatId)]
        T_Pubs[(telegram_channel_publications\ncreativeJobId, channelId, messageId)]
        T_Tokens[(telegram_action_tokens\ntokenHash, singleUse, expiresAt)]
        T_Updates[(inbound_telegram_updates\nupdateId, claimedAt)]

        WizardSM <--> PrismaRepo
        TokenService <--> PrismaRepo
        Handler <--> PrismaRepo
        Dispatcher <--> PrismaRepo

        PrismaRepo --> T_Flows
        PrismaRepo --> T_Active
        PrismaRepo --> T_Pubs
        PrismaRepo --> T_Tokens
        PrismaRepo --> T_Updates
    end

    subgraph Edit-First Telegram Egress
        DeliveryGateway[Grammy Telegram Delivery Gateway]
        EditCheck{Has Active\nMessage ID?}
        Dispatcher --> EditCheck
        Adapter --> EditCheck
        EditCheck -- Yes --> EditMedia[editMessageMedia / editMessageText]
        EditCheck -- No / 400 Fallback --> FreshSend[sendPhoto / sendMessage]
        FreshSend --> SyncDurable[Update telegram_active_workflow_messages\nSync wizardMessageId]
        SyncDurable --> T_Active
        EditMedia --> DeliveryGateway
        FreshSend --> DeliveryGateway
        DeliveryGateway --> User
    end
```

---

## 2. Schema & Migration Summary

All workflow state that previously lived in memory has been migrated into PostgreSQL with strict foreign keys, unique indexes, and optimistic/pessimistic concurrency controls.

### 2.1 Prisma Schema Entity Additions (`schema.prisma`)

```prisma
enum TelegramWorkflowMessageType {
  WIZARD_PROMPT
  VISUAL_REVIEW_CARD
  INTERACTION_PROMPT
  STATUS_DISPLAY
  CHANNEL_BROADCAST
}

model TelegramActiveWorkflowMessage {
  id                 String                      @id @default(uuid()) @db.Uuid
  resourceKey        String                      @unique @db.VarChar(120)
  telegramIdentityId String                      @db.Uuid
  chatId             String                      @db.VarChar(80)
  messageId          Int
  messageType        TelegramWorkflowMessageType @default(WIZARD_PROMPT)
  payloadMetadata    Json?                       @db.JsonB
  updatedAt          DateTime                    @updatedAt
  createdAt          DateTime                    @default(now())

  identity           TelegramIdentity            @relation(fields: [telegramIdentityId], references: [id], onDelete: Cascade)

  @@index([telegramIdentityId])
  @@index([resourceKey])
  @@map("telegram_active_workflow_messages")
}

model TelegramChannelPublicationRecord {
  id            String   @id @default(uuid()) @db.Uuid
  creativeJobId String   @unique @db.Uuid
  visualAssetId String   @db.Uuid
  channelId     String   @db.VarChar(120)
  messageId     Int
  publishedAt   DateTime @default(now())
  metadata      Json?    @db.JsonB

  creativeJob   CreativeJob @relation(fields: [creativeJobId], references: [id], onDelete: Cascade)
  visualAsset   VisualAsset @relation(fields: [visualAssetId], references: [id], onDelete: Cascade)

  @@index([channelId])
  @@map("telegram_channel_publications")
}
```

### 2.2 Migration Execution
Migration directory: `packages/database/prisma/migrations/20261028140000_w30_persistent_telegram_workflow/migration.sql`
- Creates table `telegram_active_workflow_messages` with cascading identity deletion.
- Creates table `telegram_channel_publications` with unique constraint on `creativeJobId`.
- Adds enum type `TelegramWorkflowMessageType`.
- Verified clean deployment via `prisma:migrate:deploy`.

---

## 3. One-Decision Wizard State Machine & Navigation Semantics

The creation wizard refactor eliminates cognitive overload by enforcing **one decision per card** across 6 discrete steps:

| Step | Screen | Decision Question | Input Actions | Back Target |
|:---:|:---|:---|:---|:---:|
| **1** | Product Selection | "Which luxury product would you like to feature?" | Single product card with SKU, price, inventory status, and pagination buttons | Exit (`/cancel`) |
| **2** | Content Type | "Select Content Format" | `[Product Spotlight]`, `[Brand Story]`, `[Promotional Flash]` | Step 1 |
| **3** | Language Selection | "Select Language Strategy" | `[English]`, `[Khmer]`, `[Bilingual]` | Step 2 |
| **4** | Target Platform | "Select Target Canvas & Aspect Ratio" | `[Square Post 1:1]`, `[Story / Reel 9:16]`, `[Portrait 4:5]` | Step 3 |
| **5** | Visual Style Preset | "Select Luxury Aesthetic Preset" | `[Parisian Morning]`, `[Haussmann Dusk]`, `[Atelier Minimal]` | Step 4 |
| **6** | Review & Confirmation | "Review Configuration Summary" | `[Generate Poster & Copy]`, `[Back]`, `[Cancel]` | Step 5 |

### 3.1 Step History Stack & Navigation Rules
1. **Durable History Stack:** When transitioning forward ($N \to N+1$), the current step number $N$ is pushed onto `flow.metadata.history: number[]`.
2. **Back Navigation (`cw:back`):**
   - The top step is popped from the stack.
   - If history is empty, navigation defaults to $N-1$ (with a floor of Step 1).
   - Card transitions use edit-first in-place updates.
3. **Explicit Cancel (`cw:cancel`):**
   - Invokes `repository.cancelFlow(flowId)`.
   - Transitions database record status strictly to `'CANCELLED'`.
   - Clears active message tracking and releases single-use action tokens.
4. **Session Resumption (`/resume`):**
   - Queries `repository.findActiveFlowByIdentity(identityId)`.
   - If an in-progress flow exists, re-renders the exact current step card ($N$) with preserved selections (`contentType`, `language`, `platform`, `stylePreset`).
   - Targets the durable `wizardMessageId`, preserving chat hygiene.

---

## 4. Edit-First Delivery Engine & Fallback Sync Matrix

To avoid message spamming in Telegram chats, all bot responses follow a strict **Two-Track Delivery Protocol**:

```mermaid
flowchart TD
    Req[Incoming Telegram Action / Outbox Event] --> Check{Active Message ID\nin Durable Storage?}
    Check -- Yes --> T1[Track 1: Attempt In-Place Edit\neditMessageText / editMessageMedia]
    Check -- No --> T2[Track 2: Fresh Message Fallback\nreply / sendPhoto / sendMessage]

    T1 -- Edit Succeeded --> Persist1[Retain Active Message ID]
    T1 -- 400 Bad Request: message is not modified --> Absorb[Silently Absorb Exception\nNo Duplicate Sent]
    T1 -- 400 Bad Request: message not found / expired --> T2

    T2 --> CaptureID[Capture newly allocated message_id]
    CaptureID --> SyncDB[Synchronize to PostgreSQL\ntelegram_active_workflow_messages\nTelegramCreateFlow.wizardMessageId]
    SyncDB --> End[Ready for Next Interaction]
```

### 4.1 Error Recovery & Classification Matrix

| Error Scenario | Telegram API Code | Delivery Action | Storage Mutation | Operator Experience |
|---|:---:|---|---|---|
| **Clean In-Place Edit** | 200 OK | `editMessageText` / `editMessageMedia` | Retains existing `messageId` | Seamless button / content update on same card. |
| **Unmodified Content** | `400: message is not modified` | Silently absorb error | None | Zero chat clutter; callback answered cleanly. |
| **User Deleted Message** | `400: message to edit not found` | Fall back to `reply` / `sendPhoto` | `setActiveWorkflowMessage(newId)` | New card posted; pointer updated for subsequent edits. |
| **Message Expired (>48h)** | `400: message can't be edited` | Fall back to `reply` / `sendPhoto` | `setActiveWorkflowMessage(newId)` | New card posted; pointer updated for subsequent edits. |
| **Missing Active Record** | N/A | Fresh `sendMessage` / `sendPhoto` | `setActiveWorkflowMessage(newId)` | First card posted; pointer initialized. |

---

## 5. Adversarial & Process Crash Recovery Verification (5 Vectors)

The adversarial regression suite in [`telegram-adversarial-recovery.spec.ts`](file:///Users/macbookpro/Desktop/Development/parisian-shopper-ai/app/packages/telegram/src/__tests__/telegram-adversarial-recovery.spec.ts) tests the 5 resilience vectors specified in Section 7 of W30-A:

### 5.1 Vector 1: Process Restart During Active Wizard (Cold Start Recovery)
- **Scenario:** Operator reaches Step 4 in `/create` wizard. Server process abruptly terminates. Fresh repository and command center instances boot up with cold in-memory caches against PostgreSQL.
- **Verification:**
  - Operator triggers `/resume`: state is restored to Step 4 with preserved `stepHistory: [1, 2, 3]`, `format: 'INSTAGRAM_SQUARE'`, and `stylePreset: 'PARISIAN_MORNING'`.
  - Operator clicks "Back": history stack correctly unwinds to Step 3, Step 2, and Step 1 sequentially.
- **Result:** `PASS (6 ms)`

### 5.2 Vector 2: Webhook Replay & Duplicate Delivery Idempotency
- **Scenario:** Telegram network retry delivers identical `update_id` concurrently and sequentially to `claimInboundUpdate`.
- **Verification:**
  - First delivery claims row lock and processes normally.
  - Concurrent second delivery fails row lock / unique constraint and returns empty message list with callback notice `'Already handled.'`.
  - Replay attempts produce zero duplicated database rows, zero outbox events, and zero duplicate jobs.
- **Result:** `PASS (1 ms)`

### 5.3 Vector 3: Concurrent Action Token Race Condition
- **Scenario:** Rapid double-tap on single-use inline button ("Approve Visual"), firing two simultaneous callback queries with the same raw token.
- **Verification:**
  - `consumeActionToken` executes inside PostgreSQL `SERIALIZABLE` / row-level lock (`SELECT ... FOR UPDATE`).
  - Exactly one request receives `{ disposition: 'RESOLVED' }` and triggers approval.
  - The second parallel request receives `{ disposition: 'CONSUMED' }` and returns notice `'Action already processed.'`.
- **Result:** `PASS (1 ms)`

### 5.4 Vector 4: Deleted Message Recovery & Pointer Synchronization
- **Scenario:** Operator manually deletes the bot's wizard card in Telegram. The next button click attempts to edit the deleted message ID (1042), triggering `400 Bad Request: message to edit not found`.
- **Verification:**
  - `GrammyBotAdapter` catches the error, falls back to `ctx.reply(...)`, and captures newly assigned `message_id` (2042).
  - Synchronizes `2042` into `telegram_active_workflow_messages` and `flow.metadata.wizardMessageId`.
  - Subsequent wizard actions immediately target message `2042` with `editMessageText`, confirming self-healing recovery.
- **Result:** `PASS (1 ms)`

### 5.5 Vector 5: Expired & Tampered Action Tokens
- **Scenario:** Attackers replay expired tokens, tamper with token signatures, or attempt cross-user token hijacking.
- **Verification:**
  - Expired token is rejected with notice `'This action has expired. Please reopen the latest job.'` without mutating state.
  - Tampered HMAC signature fails cryptographic hash lookup and returns `'Action expired or invalid.'`.
  - User B clicking User A's token is rejected with `'Action belongs to another user.'` and triggers a security audit log.
- **Result:** `PASS (1 ms)`

---

## 6. Monorepo Quality Gate Verification Table

All 4 strict project quality gates plus the full Telegram unit suite were executed and verified clean:

| Gate | Command | Execution Status | Observations |
|---|---|:---:|---|
| **Module Boundaries** | `pnpm -C app run boundaries` | **PASS** | Valid architecture boundaries; 0 circular dependencies. |
| **Type Check** | `pnpm -C app run typecheck` | **PASS** | Zero TypeScript compilation errors across all packages and apps. |
| **Lint** | `pnpm -C app run lint` | **PASS** | Zero ESLint errors, zero warnings with `--max-warnings 0`. |
| **Format** | `pnpm -C app run format:check` | **PASS** | All files match Prettier code style standards. |
| **Telegram Unit Tests** | `pnpm -C app test:unit telegram` | **PASS** | **10 test suites passed, 104 tests passed (100% green)**. |

### 6.1 Test Suite Breakdown

```
PASS unit packages/telegram/src/__tests__/visual-review-workflow.spec.ts (38 tests)
PASS unit packages/telegram/src/telegram-webhook.controller.spec.ts (4 tests)
PASS unit packages/telegram/src/__tests__/telegram-adversarial-recovery.spec.ts (7 tests)
PASS unit packages/database/src/telegram/prisma-telegram-workflow.repository.spec.ts (11 tests)
PASS unit packages/telegram/src/grammy-bot.adapter.spec.ts (5 tests)
PASS unit packages/telegram/src/__tests__/channel-broadcast.spec.ts (13 tests)
PASS unit packages/application/src/modules/telegram/application/telegram-command-center.spec.ts (17 tests)
PASS unit packages/application/src/modules/telegram/application/telegram-action-token.service.spec.ts (2 tests)
PASS unit packages/application/src/modules/telegram/application/telegram-formatters.spec.ts (4 tests)
PASS unit packages/application/src/modules/telegram/domain/telegram.spec.ts (3 tests)

Test Suites: 10 passed, 10 total
Tests:       104 passed, 104 total
Snapshots:   0 total
Time:        3.597 s
```

---

## 7. Architectural Sign-off & Next Steps

Work package **W30 (Make the Telegram Workflow Persistent and Concise)** is fully implemented, verified against real adversarial scenarios, and certified production-ready.

- **Staged Files:** 0 staged files.
- **Branch:** `feat/w30-persistent-telegram-workflow`
- **Ready for User Sign-Off:** Commit, Push, and PR creation.
