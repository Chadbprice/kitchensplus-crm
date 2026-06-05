-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: AI Agent System — Phase 1 Foundation Tables
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Domain Events (event bus persistence)
CREATE TABLE IF NOT EXISTS `domain_events` (
  `id`          INT AUTO_INCREMENT PRIMARY KEY,
  `eventName`   VARCHAR(100) NOT NULL,
  `entityType`  VARCHAR(50),
  `entityId`    INT,
  `payload`     TEXT,
  `processedAt` TIMESTAMP NULL,
  `createdAt`   TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 2. Approval Queue (human approval surface)
CREATE TABLE IF NOT EXISTS `approval_queue` (
  `id`             INT AUTO_INCREMENT PRIMARY KEY,
  `agentName`      VARCHAR(100) NOT NULL,
  `actionType`     VARCHAR(100) NOT NULL,
  `entityType`     VARCHAR(50),
  `entityId`       INT,
  `title`          VARCHAR(500) NOT NULL,
  `description`    TEXT,
  `severity`       ENUM('info','warning','critical') NOT NULL DEFAULT 'warning',
  `status`         ENUM('pending','approved','rejected','auto_resolved') NOT NULL DEFAULT 'pending',
  `payload`        TEXT,
  `resolvedBy`     INT,
  `resolvedAt`     TIMESTAMP NULL,
  `resolutionNote` TEXT,
  `expiresAt`      TIMESTAMP NULL,
  `createdAt`      TIMESTAMP NOT NULL DEFAULT NOW(),
  `updatedAt`      TIMESTAMP NOT NULL DEFAULT NOW() ON UPDATE NOW()
);

-- 3. Agent Run Log (execution audit trail)
CREATE TABLE IF NOT EXISTS `agent_run_log` (
  `id`               INT AUTO_INCREMENT PRIMARY KEY,
  `agentName`        VARCHAR(100) NOT NULL,
  `runType`          ENUM('scheduled','triggered','manual') NOT NULL DEFAULT 'scheduled',
  `status`           ENUM('running','completed','failed','partial') NOT NULL DEFAULT 'running',
  `entityType`       VARCHAR(50),
  `entityId`         INT,
  `summary`          TEXT,
  `details`          TEXT,
  `alertsCreated`    INT NOT NULL DEFAULT 0,
  `approvalsCreated` INT NOT NULL DEFAULT 0,
  `eventsEmitted`    INT NOT NULL DEFAULT 0,
  `durationMs`       INT,
  `startedAt`        TIMESTAMP NOT NULL DEFAULT NOW(),
  `completedAt`      TIMESTAMP NULL
);

-- 4. Domain Alerts (in-app persistent alert feed)
CREATE TABLE IF NOT EXISTS `domain_alerts` (
  `id`          INT AUTO_INCREMENT PRIMARY KEY,
  `agentName`   VARCHAR(100),
  `alertType`   VARCHAR(100) NOT NULL,
  `entityType`  VARCHAR(50),
  `entityId`    INT,
  `title`       VARCHAR(500) NOT NULL,
  `body`        TEXT,
  `severity`    ENUM('info','warning','critical') NOT NULL DEFAULT 'warning',
  `status`      ENUM('active','dismissed','resolved') NOT NULL DEFAULT 'active',
  `actionUrl`   VARCHAR(512),
  `dismissedAt` TIMESTAMP NULL,
  `resolvedAt`  TIMESTAMP NULL,
  `createdAt`   TIMESTAMP NOT NULL DEFAULT NOW(),
  `updatedAt`   TIMESTAMP NOT NULL DEFAULT NOW() ON UPDATE NOW()
);

-- 5. Compliance Checks (per-doc per-subcontractor check results)
CREATE TABLE IF NOT EXISTS `compliance_checks` (
  `id`              INT AUTO_INCREMENT PRIMARY KEY,
  `subcontractorId` INT NOT NULL,
  `docId`           INT,
  `checkType`       ENUM('coi','workers_comp','license','w9','contract') NOT NULL,
  `result`          ENUM('pass','warn','fail','missing') NOT NULL,
  `daysUntilExpiry` INT,
  `notes`           TEXT,
  `checkedAt`       TIMESTAMP NOT NULL DEFAULT NOW()
);
