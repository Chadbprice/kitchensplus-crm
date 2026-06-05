/**
 * Migration: AI Agent System Phase 2 — Financial Snapshots + Project Risk Scores
 */
import mysql from "mysql2/promise";

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const statements = [
  // ── financial_snapshots ──────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS financial_snapshots (
    id                    INT AUTO_INCREMENT PRIMARY KEY,
    projectId             INT NOT NULL,
    agentRunLogId         INT,
    budgetEstimated       DECIMAL(12,2),
    budgetActual          DECIMAL(12,2),
    totalInvoiced         DECIMAL(12,2) DEFAULT 0,
    totalCollected        DECIMAL(12,2) DEFAULT 0,
    totalOverdue          DECIMAL(12,2) DEFAULT 0,
    overdueInvoiceCount   INT DEFAULT 0,
    unbilledMilestoneCount INT DEFAULT 0,
    depositCollected      BOOLEAN DEFAULT FALSE,
    overrunPercent        DECIMAL(8,2),
    financialHealth       ENUM('healthy','watch','warning','critical') DEFAULT 'healthy',
    notes                 TEXT,
    snapshotAt            TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`,

  // ── project_risk_scores ──────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS project_risk_scores (
    id                    INT AUTO_INCREMENT PRIMARY KEY,
    projectId             INT NOT NULL,
    agentRunLogId         INT,
    scheduleRisk          INT DEFAULT 0,
    communicationRisk     INT DEFAULT 0,
    staleTaskRisk         INT DEFAULT 0,
    evidenceRisk          INT DEFAULT 0,
    subcontractorRisk     INT DEFAULT 0,
    budgetRisk            INT DEFAULT 0,
    overallRiskScore      INT DEFAULT 0,
    riskLevel             ENUM('low','medium','high','critical') DEFAULT 'low',
    topRiskFactor         VARCHAR(100),
    notes                 TEXT,
    scoredAt              TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`,
];

for (const sql of statements) {
  const tableName = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/)?.[1] ?? "unknown";
  try {
    await conn.execute(sql);
    console.log(`✓  ${tableName}`);
  } catch (err) {
    console.error(`✗  ${tableName}:`, err.message);
  }
}

// Verify
const [rows] = await conn.execute(
  `SELECT table_name FROM information_schema.tables
   WHERE table_schema = DATABASE()
   AND table_name IN ('financial_snapshots','project_risk_scores')`
);
console.log("\nVerification:");
for (const row of rows) {
  console.log(`  ✓  ${row.table_name}: EXISTS`);
}

await conn.end();
console.log("Done.");
