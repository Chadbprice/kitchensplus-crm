import mysql from "mysql2/promise";
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const conn = await mysql.createConnection(url);
try {
  await conn.execute("ALTER TABLE `projects` ADD COLUMN `archivedAt` timestamp NULL");
  console.log("✅ Added archivedAt column to projects table");
} catch (e) {
  if (e.code === "ER_DUP_FIELDNAME") {
    console.log("ℹ️  archivedAt column already exists — skipping");
  } else {
    throw e;
  }
}
await conn.end();
console.log("Migration complete.");
