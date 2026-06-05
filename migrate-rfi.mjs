import { createConnection } from "mysql2/promise";

const db = await createConnection(process.env.DATABASE_URL);

await db.execute(`
  CREATE TABLE IF NOT EXISTS rfis (
    id INT AUTO_INCREMENT PRIMARY KEY,
    projectId INT NOT NULL,
    clientId INT,
    token VARCHAR(64) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    attachmentUrls TEXT,
    rfiStatus ENUM('draft','sent','returned','reviewed','expired') NOT NULL DEFAULT 'draft',
    reminderCount INT NOT NULL DEFAULT 0,
    nextReminderAt TIMESTAMP NULL,
    sentAt TIMESTAMP NULL,
    responseAgreed TINYINT,
    responseComments TEXT,
    responseText TEXT,
    responseRequestedMoreTime TINYINT NOT NULL DEFAULT 0,
    responseDelayDays INT,
    respondedAt TIMESTAMP NULL,
    reviewedAt TIMESTAMP NULL,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);
console.log("✓ rfis table created");

await db.execute(`
  CREATE TABLE IF NOT EXISTS rfi_reminders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    rfiId INT NOT NULL,
    reminderNumber INT NOT NULL,
    rfiReminderChannel ENUM('email','sms') NOT NULL,
    sentAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);
console.log("✓ rfi_reminders table created");

await db.end();
console.log("Migration complete.");
