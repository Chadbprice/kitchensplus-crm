# Kitchens Plus CRM — AI Agent System: Phase 1 Implementation Plan

**Date:** April 2026  
**Scope:** Foundation layer + Subcontractor Compliance AI System  
**Constraint:** Build inside existing tRPC + Drizzle + MySQL architecture. No new infrastructure.

---

## 1. Codebase Audit Summary

### What Already Exists (Reusable)

| Asset | Location | Reuse Role |
|---|---|---|
| `subcontractors` table | `drizzle/schema.ts:901` | Primary entity for Compliance AI |
| `subcontractorDocs` table | `drizzle/schema.ts:922` | COI, workers_comp, license, w9 docs |
| `subcontractorContracts` table | `drizzle/schema.ts:938` | Contract signed/unsigned state |
| `refreshComplianceStatus()` | `server/routers/subcontractors.ts:43` | Deterministic rollup — extend, don't replace |
| `automationLogs` table | `drizzle/schema.ts:494` | Extend as agent_run_log base |
| `notifyOwner()` | `server/_core/notification.ts` | Owner alert transport — reuse directly |
| Scheduler pattern | `server/complianceReminder.ts` | `setTimeout` + `setInterval` — same pattern for agent scans |
| `invokeLLM()` | `server/_core/llm.ts` | AI reasoning layer — call from agents |
| `appSettings` table | `drizzle/schema.ts:486` | Key-value store — extend as shared memory |

### What Does Not Exist (Must Build)

- Domain event bus (emit/subscribe pattern with persistence)
- Approval queue (internal human-approval surface)
- Agent run log (structured per-run audit trail)
- Domain alerts (in-app alert feed, separate from owner push notifications)
- Compliance checks table (per-doc per-subcontractor check results)
- Frontend: Approval Queue page, Agent Activity log, Compliance badge

---

## 2. New Database Tables

### 2.1 `domain_events` — Event Bus Persistence

```sql
CREATE TABLE domain_events (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  eventName   VARCHAR(100) NOT NULL,       -- e.g. 'subcontractor.doc.expired'
  entityType  VARCHAR(50),                 -- 'subcontractor', 'project', 'invoice'
  entityId    INT,
  payload     TEXT,                        -- JSON blob
  processedAt TIMESTAMP,                   -- null = unprocessed
  createdAt   TIMESTAMP DEFAULT NOW() NOT NULL
);
```

**Purpose:** Every significant state change emits a row. Agents poll or react to unprocessed events.

### 2.2 `approval_queue` — Human Approval Surface

```sql
CREATE TABLE approval_queue (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  agentName     VARCHAR(100) NOT NULL,     -- 'SubcontractorComplianceAgent'
  actionType    VARCHAR(100) NOT NULL,     -- 'block_task_assignment', 'flag_expired_doc'
  entityType    VARCHAR(50),
  entityId      INT,
  title         VARCHAR(500) NOT NULL,
  description   TEXT,
  severity      ENUM('info','warning','critical') DEFAULT 'warning',
  status        ENUM('pending','approved','rejected','auto_resolved') DEFAULT 'pending',
  payload       TEXT,                      -- JSON: context for the approver
  resolvedBy    INT,                       -- users.id
  resolvedAt    TIMESTAMP,
  resolutionNote TEXT,
  expiresAt     TIMESTAMP,
  createdAt     TIMESTAMP DEFAULT NOW() NOT NULL,
  updatedAt     TIMESTAMP DEFAULT NOW() ON UPDATE NOW() NOT NULL
);
```

**Purpose:** Any agent action requiring human sign-off creates a row here. The owner sees a badge count and can approve/reject from the UI.

### 2.3 `agent_run_log` — Execution Audit Trail

```sql
CREATE TABLE agent_run_log (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  agentName   VARCHAR(100) NOT NULL,
  runType     ENUM('scheduled','triggered','manual') DEFAULT 'scheduled',
  status      ENUM('running','completed','failed','partial') DEFAULT 'running',
  entityType  VARCHAR(50),
  entityId    INT,
  summary     TEXT,                        -- human-readable outcome
  details     TEXT,                        -- JSON: full structured output
  alertsCreated  INT DEFAULT 0,
  approvalsCreated INT DEFAULT 0,
  eventsEmitted INT DEFAULT 0,
  durationMs  INT,
  startedAt   TIMESTAMP DEFAULT NOW() NOT NULL,
  completedAt TIMESTAMP
);
```

**Purpose:** Every agent run (scheduled or triggered) writes a row. Enables debugging, auditing, and performance monitoring.

### 2.4 `domain_alerts` — In-App Alert Feed

```sql
CREATE TABLE domain_alerts (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  agentName   VARCHAR(100),
  alertType   VARCHAR(100) NOT NULL,       -- 'compliance.doc.expired', 'project.stale'
  entityType  VARCHAR(50),
  entityId    INT,
  title       VARCHAR(500) NOT NULL,
  body        TEXT,
  severity    ENUM('info','warning','critical') DEFAULT 'warning',
  status      ENUM('active','dismissed','resolved') DEFAULT 'active',
  actionUrl   VARCHAR(512),               -- deep link into the app
  dismissedAt TIMESTAMP,
  resolvedAt  TIMESTAMP,
  createdAt   TIMESTAMP DEFAULT NOW() NOT NULL,
  updatedAt   TIMESTAMP DEFAULT NOW() ON UPDATE NOW() NOT NULL
);
```

**Purpose:** Persistent in-app alerts surfaced in the dashboard. Different from push notifications — these stay visible until dismissed or resolved.

### 2.5 `compliance_checks` — Per-Doc Compliance Check Results

```sql
CREATE TABLE compliance_checks (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  subcontractorId  INT NOT NULL,
  docId            INT,                    -- subcontractor_docs.id (null = missing doc check)
  checkType        ENUM('coi','workers_comp','license','w9','contract') NOT NULL,
  result           ENUM('pass','warn','fail','missing') NOT NULL,
  daysUntilExpiry  INT,                    -- null if missing or no expiry
  notes            TEXT,
  checkedAt        TIMESTAMP DEFAULT NOW() NOT NULL
);
```

**Purpose:** Granular per-check results. The rollup in `subcontractors.complianceStatus` is derived from these rows.

### 2.6 `agent_memory` — Shared Memory Layer

Rather than a new table, the existing `app_settings` table (key-value store) is extended with a namespaced convention:

```
agent:SubcontractorComplianceAgent:lastFullScanAt
agent:SubcontractorComplianceAgent:sub:42:lastAlertSentAt
agent:ProjectRiskAgent:project:17:riskScore
```

No schema change needed. The `agentMemory` service wraps `appSettings` with typed get/set helpers.

---

## 3. New Server Modules

### File Layout

```
server/
  agents/
    eventBus.ts           ← emit() + getUnprocessed() + markProcessed()
    agentRunner.ts        ← base executor: start run log, catch errors, write completion
    approvalQueue.ts      ← createApprovalItem() + resolve() + reject()
    alertService.ts       ← createAlert() + dismissAlert() + resolveAlert()
    sharedMemory.ts       ← get() + set() + del() (wraps appSettings)
    SubcontractorComplianceAgent/
      index.ts            ← orchestrator: runs all specialist checks
      LicenseCheckAgent.ts
      InsuranceCheckAgent.ts
      W9StatusAgent.ts
      ContractStatusAgent.ts
  subcontractorComplianceScan.ts  ← scheduler wrapper (same pattern as complianceReminder.ts)
```

### 3.1 `eventBus.ts`

```typescript
// Emit a domain event (fire-and-forget persistence)
export async function emitEvent(name: string, entityType: string, entityId: number, payload: object): Promise<void>

// Get unprocessed events (for polling agents)
export async function getUnprocessedEvents(name?: string): Promise<DomainEvent[]>

// Mark event as processed
export async function markEventProcessed(eventId: number): Promise<void>
```

**Event names defined in Phase 1:**

| Event Name | Fired When |
|---|---|
| `subcontractor.created` | New subcontractor record saved |
| `subcontractor.doc.uploaded` | Doc uploaded to subcontractor_docs |
| `subcontractor.doc.approved` | Doc status set to 'approved' |
| `subcontractor.doc.expired` | Scheduled scan finds expired doc |
| `subcontractor.doc.expiring_soon` | Scheduled scan finds doc expiring ≤30 days |
| `subcontractor.task.assigned` | Project task assigned to a subcontractor |
| `compliance.check.failed` | Any compliance check returns 'fail' or 'missing' |
| `approval_queue.item.created` | New item added to approval queue |
| `approval_queue.item.resolved` | Item approved or rejected by owner |

### 3.2 `agentRunner.ts`

Wraps every agent execution with:
1. Insert `agent_run_log` row with `status: 'running'`
2. Execute the agent function
3. Update the log row with outcome, duration, counts
4. On uncaught error: set `status: 'failed'`, notify owner

```typescript
export async function runAgent<T>(
  agentName: string,
  runType: 'scheduled' | 'triggered' | 'manual',
  entityType: string | null,
  entityId: number | null,
  fn: (logId: number) => Promise<AgentResult>
): Promise<AgentResult>
```

### 3.3 `approvalQueue.ts`

```typescript
export async function createApprovalItem(opts: {
  agentName: string;
  actionType: string;
  entityType: string;
  entityId: number;
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
  payload?: object;
  expiresAt?: Date;
}): Promise<number>  // returns new item id

export async function resolveApprovalItem(id: number, resolvedBy: number, note?: string): Promise<void>
export async function rejectApprovalItem(id: number, resolvedBy: number, note?: string): Promise<void>
export async function autoResolveApprovalItem(id: number, note: string): Promise<void>
```

### 3.4 `alertService.ts`

```typescript
export async function createAlert(opts: {
  agentName?: string;
  alertType: string;
  entityType: string;
  entityId: number;
  title: string;
  body?: string;
  severity: 'info' | 'warning' | 'critical';
  actionUrl?: string;
}): Promise<number>

export async function dismissAlert(id: number): Promise<void>
export async function resolveAlert(id: number): Promise<void>
export async function getActiveAlerts(): Promise<DomainAlert[]>
```

### 3.5 `sharedMemory.ts`

```typescript
export async function memGet(key: string): Promise<string | null>
export async function memSet(key: string, value: string): Promise<void>
export async function memDel(key: string): Promise<void>

// Convenience: agent-namespaced keys
export function agentKey(agentName: string, ...parts: string[]): string
// → "agent:SubcontractorComplianceAgent:lastFullScanAt"
```

---

## 4. Subcontractor Compliance AI System — Phase 1 Design

### Architecture

```
SubcontractorComplianceAgent (orchestrator)
├── LicenseCheckAgent        → checks licenseNumber field + license doc
├── InsuranceCheckAgent      → checks COI doc expiry
├── WorkersCompCheckAgent    → checks workers_comp doc expiry
├── W9StatusAgent            → checks w9 doc on file
└── ContractStatusAgent      → checks signed contract for active project tasks
```

### Trigger Points

| Trigger | When | How |
|---|---|---|
| Scheduled full scan | Every 24 hours | `subcontractorComplianceScan.ts` scheduler |
| On doc upload | After `subcontractorDocs` insert | `emitEvent('subcontractor.doc.uploaded', ...)` → agent reacts |
| On doc approval | After doc status → 'approved' | `emitEvent('subcontractor.doc.approved', ...)` |
| On task assignment | When project task assigned to sub | `emitEvent('subcontractor.task.assigned', ...)` |
| Manual trigger | Owner clicks "Run Compliance Check" | tRPC mutation `agents.runComplianceCheck` |

### Deterministic Rules (Phase 1 — No AI Required)

| Check | Pass | Warn | Fail |
|---|---|---|---|
| COI doc | Approved + expiry > 30 days | Expiry ≤ 30 days | Missing or expired |
| Workers Comp | Approved + expiry > 30 days | Expiry ≤ 30 days | Missing or expired |
| License | licenseNumber field populated | — | Empty field |
| W9 | w9 doc on file (any status) | — | No w9 doc |
| Contract | Signed contract for active task | Sent but not signed | No contract for active task |

### Outputs Per Sub

1. **`compliance_checks` rows** — one per check type, timestamped
2. **`subcontractors.complianceStatus` update** — rolled up from check results
3. **`domain_alerts` rows** — one per failing check (deduped: only create if no active alert of same type+entity exists)
4. **`approval_queue` items** — only for `critical` severity (expired COI while sub has active tasks)
5. **`agent_run_log` row** — one per full scan run
6. **Owner push notification** — only when new `critical` items are created

### Human Approval Required

| Situation | Approval Type | Auto-Resolve When |
|---|---|---|
| Sub has expired COI + active project tasks | `block_task_assignment` | Doc renewed and approved |
| Sub has no W9 + payment pending | `flag_missing_w9` | W9 uploaded |
| Sub contract not signed 48h before task start | `flag_unsigned_contract` | Contract signed |

---

## 5. tRPC Procedures to Add

### New router: `server/routers/agents.ts`

```typescript
// Approval Queue
agents.approvalQueue.list     → list pending items (owner/admin)
agents.approvalQueue.resolve  → approve an item
agents.approvalQueue.reject   → reject an item
agents.approvalQueue.count    → count of pending items (for badge)

// Domain Alerts
agents.alerts.list            → list active alerts (owner/admin)
agents.alerts.dismiss         → dismiss an alert
agents.alerts.count           → count of active alerts

// Agent Run Log
agents.runLog.list            → list recent runs (owner/admin)
agents.runLog.get             → get single run with details

// Manual Triggers
agents.runComplianceCheck     → trigger full compliance scan now (owner/admin)
agents.runComplianceCheckForSub → trigger for single subcontractor
```

---

## 6. Frontend Changes

### 6.1 Dashboard badge

Add alert/approval count badges to the sidebar nav. The `agents.approvalQueue.count` and `agents.alerts.count` queries drive these.

### 6.2 New page: `/agents/approvals`

- List of pending approval queue items
- Each card shows: agent name, severity, title, description, entity link, approve/reject buttons
- Resolved items shown in a separate "History" tab

### 6.3 New page: `/agents/activity`

- Agent run log table: agent name, run type, status, duration, alerts created, approvals created
- Expandable row shows full JSON details

### 6.4 Subcontractor list — Compliance badge

The existing `complianceStatus` field already drives a badge. Phase 1 adds a tooltip showing which specific checks failed.

### 6.5 Subcontractor detail — Compliance tab

New "Compliance" tab showing:
- Per-check results from `compliance_checks`
- Active alerts for this sub
- Pending approval queue items for this sub
- "Run Check Now" button

---

## 7. Implementation Order (Phase 1)

1. **Schema migration** — add `domain_events`, `approval_queue`, `agent_run_log`, `domain_alerts`, `compliance_checks` tables
2. **Foundation services** — `eventBus.ts`, `agentRunner.ts`, `approvalQueue.ts`, `alertService.ts`, `sharedMemory.ts`
3. **Subcontractor Compliance Agent** — orchestrator + 5 specialist checks
4. **Scheduler** — `subcontractorComplianceScan.ts` + wire into `_core/index.ts`
5. **tRPC router** — `server/routers/agents.ts`
6. **Frontend** — Approval Queue page, Activity log, compliance tab on sub detail
7. **Tests** — unit tests for each agent check function

---

## 8. Risks and Constraints

| Risk | Mitigation |
|---|---|
| Alert deduplication — same alert created on every scan | Check for existing `active` alert of same `alertType + entityId` before inserting |
| Approval queue bloat — items never resolved | Add `expiresAt` + auto-resolve when underlying condition clears |
| Agent run log grows unbounded | Add a cleanup job: delete runs older than 90 days |
| `appSettings` used as memory — key collisions | Namespace all agent keys with `agent:` prefix |
| Scheduler startup race — multiple scans overlap | Use `_started` flag pattern (already used in `questionTaskReminder.ts`) |
| LLM calls in Phase 1 | Phase 1 is 100% deterministic rules. LLM is not called in Phase 1. |
