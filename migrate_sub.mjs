import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const stmts = [
  `CREATE TABLE IF NOT EXISTS subcontractors (
    id INT AUTO_INCREMENT PRIMARY KEY,
    companyName VARCHAR(255) NOT NULL,
    contactName VARCHAR(255),
    email VARCHAR(320),
    phone VARCHAR(30),
    trade VARCHAR(100),
    licenseNumber VARCHAR(100),
    address VARCHAR(512),
    notes TEXT,
    isActive BOOLEAN DEFAULT TRUE,
    complianceStatus ENUM('compliant','expiring_soon','expired','missing','pending') DEFAULT 'pending',
    lastComplianceCheckAt TIMESTAMP NULL,
    performanceScore DECIMAL(3,1),
    completedTaskCount INT DEFAULT 0,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS subcontractor_docs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    subcontractorId INT NOT NULL,
    docType ENUM('coi','workers_comp','license','w9','other') NOT NULL,
    fileName VARCHAR(255),
    fileUrl TEXT,
    fileKey VARCHAR(512),
    expiryDate TIMESTAMP NULL,
    status ENUM('pending','approved','expired','rejected') DEFAULT 'pending',
    notes TEXT,
    uploadedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    reviewedAt TIMESTAMP NULL,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS subcontractor_contracts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    subcontractorId INT NOT NULL,
    projectId INT NOT NULL,
    taskId INT,
    contractNumber VARCHAR(50),
    title VARCHAR(255) NOT NULL,
    scopeOfWork TEXT,
    contractAmount DECIMAL(12,2),
    startDate TIMESTAMP NULL,
    endDate TIMESTAMP NULL,
    status ENUM('draft','sent','signed','voided') DEFAULT 'draft',
    pdfUrl TEXT,
    pdfKey VARCHAR(512),
    signToken VARCHAR(128),
    signedAt TIMESTAMP NULL,
    signerName VARCHAR(255),
    signatureDataUrl TEXT,
    signedPdfUrl TEXT,
    signedPdfKey VARCHAR(512),
    sentAt TIMESTAMP NULL,
    notes TEXT,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS subcontractor_portal_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    subcontractorId INT NOT NULL,
    token VARCHAR(128) NOT NULL UNIQUE,
    expiresAt TIMESTAMP NOT NULL,
    usedAt TIMESTAMP NULL,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS subcontractor_comms (
    id INT AUTO_INCREMENT PRIMARY KEY,
    subcontractorId INT NOT NULL,
    projectId INT,
    contractId INT,
    direction ENUM('inbound','outbound') NOT NULL,
    channel ENUM('sms','email') NOT NULL,
    subject VARCHAR(500),
    body TEXT NOT NULL,
    fromPhone VARCHAR(30),
    toPhone VARCHAR(30),
    fromEmail VARCHAR(320),
    toEmail VARCHAR(320),
    status ENUM('sent','delivered','failed','received') DEFAULT 'sent',
    isRead BOOLEAN DEFAULT FALSE,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`,
];

for (const sql of stmts) {
  await conn.execute(sql);
  console.log("OK:", sql.trim().split("\n")[0]);
}
console.log("All subcontractor tables created.");
await conn.end();
