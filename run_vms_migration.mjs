import mysql from 'mysql2/promise';
import fs from 'fs';

const sql = fs.readFileSync('/tmp/vms_migration.sql', 'utf8');
const statements = sql
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith('--'));

const conn = await mysql.createConnection(process.env.DATABASE_URL);
for (const stmt of statements) {
  try {
    await conn.execute(stmt);
    console.log('OK:', stmt.substring(0, 70));
  } catch (e) {
    console.error('ERR:', e.message, '|', stmt.substring(0, 70));
  }
}
await conn.end();
console.log('VMS migration complete');
