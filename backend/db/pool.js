require('dotenv').config();
const { Pool } = require('pg');

const connectionString = process.env.PG_URL || process.env.DATABASE_URL;
const isInternal = connectionString && connectionString.includes('.railway.internal');

const pool = new Pool({
  connectionString,
  ssl: isInternal ? false : { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected database pool error', err);
});

/*
 * IT_HANDOVER: Row-Level Security session variables
 * When RLS is enabled (see backend/db/setup-rls.sql), each database connection must set:
 *   SET LOCAL app.user_region = '<region_id>';
 *   SET LOCAL app.user_role = '<role>';
 * Do this in a request-scoped middleware wrapper after req.user is populated by auth.
 * Example — add to backend/server.js after auditMiddleware:
 *
 *   app.use(async (req, res, next) => {
 *     if (!req.user) return next();
 *     const client = await pool.connect();
 *     try {
 *       await client.query(`SET LOCAL app.user_region = $1`, [req.user.regionId ?? '0']);
 *       await client.query(`SET LOCAL app.user_role = $1`,   [req.user.role ?? '']);
 *       req.dbClient = client;
 *       res.on('finish', () => client.release());
 *       next();
 *     } catch (err) { client.release(); next(err); }
 *   });
 *
 * Then replace pool.query calls in routes with req.dbClient.query for RLS-protected tables.
 * The setup-rls.sql script must be run against the database first.
 */

module.exports = pool;
