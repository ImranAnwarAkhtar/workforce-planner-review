const pool = require('./pool');

async function writeAudit({ userId, userEmail, action, tableName, recordId, oldValues, newValues, ipAddress }) {
  try {
    await pool.query(
      `INSERT INTO audit_log (user_id, user_email, action, table_name, record_id, old_values, new_values, ip_address, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [
        userId    ?? null,
        userEmail ?? null,
        action,
        tableName,
        recordId  ?? null,
        oldValues ? JSON.stringify(oldValues) : null,
        newValues ? JSON.stringify(newValues) : null,
        ipAddress ?? null,
      ]
    );
  } catch (err) {
    // Audit failure must never crash the main operation
    // IT_HANDOVER: if this logs column-not-found errors, run:
    //   ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS user_email  TEXT;
    //   ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS action       TEXT;
    //   ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS table_name   TEXT;
    //   ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS record_id    INTEGER;
    //   ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS old_values   JSONB;
    //   ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS new_values   JSONB;
    console.error('Audit log write failed:', err.message);
  }
}

module.exports = { writeAudit };
