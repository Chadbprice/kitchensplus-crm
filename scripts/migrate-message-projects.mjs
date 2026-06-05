import mysql from "mysql2/promise";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const conn = await mysql.createConnection(DATABASE_URL);

try {
  // Create the message_projects join table
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS message_projects (
      id INT AUTO_INCREMENT PRIMARY KEY,
      messageId INT NOT NULL,
      projectId INT NOT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_message_projects_messageId (messageId),
      INDEX idx_message_projects_projectId (projectId)
    )
  `);
  console.log("✅ Created message_projects table");

  // Backfill: any existing message with a non-null projectId gets a row in message_projects
  await conn.execute(`
    INSERT IGNORE INTO message_projects (messageId, projectId, createdAt)
    SELECT id, projectId, createdAt
    FROM messages
    WHERE projectId IS NOT NULL
  `);
  const [rows] = await conn.execute(`SELECT COUNT(*) as cnt FROM message_projects`);
  console.log(`✅ Backfilled ${rows[0].cnt} rows into message_projects`);

} catch (err) {
  console.error("Migration failed:", err);
  process.exit(1);
} finally {
  await conn.end();
}
