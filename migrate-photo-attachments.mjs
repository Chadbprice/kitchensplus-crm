import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");

const conn = await mysql.createConnection(url);

const statements = [
  // Add clientVisible to field_captures (safe: column may already exist)
  `ALTER TABLE \`field_captures\` ADD COLUMN \`clientVisible\` tinyint NOT NULL DEFAULT 0`,
  // Create proposal_attachments table
  `CREATE TABLE IF NOT EXISTS \`proposal_attachments\` (
    \`id\` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
    \`estimateId\` int NOT NULL,
    \`fieldCaptureId\` int,
    \`fileUrl\` text NOT NULL,
    \`fileKey\` varchar(512),
    \`fileName\` varchar(255),
    \`clientVisible\` tinyint NOT NULL DEFAULT 1,
    \`sortOrder\` int NOT NULL DEFAULT 0,
    \`createdAt\` timestamp NOT NULL DEFAULT (now())
  )`,
];

for (const sql of statements) {
  try {
    await conn.execute(sql);
    console.log("OK:", sql.slice(0, 60));
  } catch (err) {
    if (err.code === "ER_DUP_FIELDNAME" || err.code === "ER_TABLE_EXISTS_ERROR") {
      console.log("SKIP (already exists):", sql.slice(0, 60));
    } else {
      console.error("FAIL:", err.message);
      process.exit(1);
    }
  }
}

await conn.end();
console.log("Migration complete.");
