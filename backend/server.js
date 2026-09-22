require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const helmet  = require('helmet');
const morgan  = require('morgan');
const winston = require('winston');

const cookieParser       = require('cookie-parser');
const { limiter }        = require('./middleware/rateLimiter');
const { auditMiddleware }= require('./middleware/audit');
const { errorHandler, notFound } = require('./middleware/errorHandler');

const planningCyclesRouter= require('./routes/planningCycles');
const projectsRouter      = require('./routes/projects');
const peopleRouter        = require('./routes/people');
const allocationsRouter   = require('./routes/allocations');
const tbhCodesRouter      = require('./routes/tbhCodes');
const gearingRouter       = require('./routes/gearing');
const hireRequestsRouter  = require('./routes/hireRequests');
const changeRequestsRouter= require('./routes/changeRequests');
const dashboardRouter     = require('./routes/dashboard');
const adminRouter         = require('./routes/admin');
const commentsRouter      = require('./routes/comments');
const importsRouter       = require('./routes/imports');
const headcountRouter     = require('./routes/headcount');
const countryAllocationsRouter = require('./routes/countryAllocations');
const personCommentsRouter     = require('./routes/personComments');
const smartsheetRouter         = require('./routes/smartsheet');

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()],
});

function wrapAsync(router) {
  router.stack.forEach(layer => {
    if (layer.route) {
      layer.route.stack.forEach(routeLayer => {
        const originalHandle = routeLayer.handle;
        routeLayer.handle = async (req, res, next) => {
          try {
            await originalHandle(req, res, next);
          } catch (err) {
            next(err);
          }
        };
      });
    }
  });
  return router;
}

const app = express();

app.set('trust proxy', 1);

// IT_HANDOVER: Review scriptSrc and styleSrc once the frontend build is finalised.
// Remove 'unsafe-inline' from styleSrc if styled-components or Tailwind are replaced with static CSS.
// Add your CDN domain to connectSrc if Anaplan or Workday APIs are called directly from the browser.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:              ["'self'"],
      scriptSrc:               ["'self'", "'unsafe-inline'"],
      styleSrc:                ["'self'", "'unsafe-inline'"],
      imgSrc:                  ["'self'", "data:", "https://flagcdn.com"],
      connectSrc:              ["'self'"],
      fontSrc:                 ["'self'"],
      objectSrc:               ["'none'"],
      frameAncestors:          ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  hsts: {
    maxAge:            31536000,
    includeSubDomains: true,
    preload:           true,
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  frameguard: { action: 'deny' },
}));
app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }));
app.use(express.json({ limit: '5mb' }));
/*
 * IT_HANDOVER: Token storage
 * Currently the frontend stores the session token in localStorage (dev mode).
 * For production, tokens must be moved to httpOnly, Secure, SameSite=Strict cookies.
 * Steps for IT:
 *   1. On login success, set: res.cookie('token', jwt, { httpOnly: true, secure: true, sameSite: 'Strict', maxAge: 3600000 })
 *   2. Update frontend/src/hooks/useAuth.ts to remove localStorage token storage
 *      and rely on the cookie being sent automatically with credentials: 'include' on fetch calls.
 *   3. Update api.ts axios instance to add: withCredentials: true
 * The cookie-parser middleware is already registered below — IT enables it in production.
 */
app.use(cookieParser());
app.use(morgan('combined', { stream: { write: (msg) => logger.http(msg.trim()) } }));
app.use(limiter);
app.use(auditMiddleware);

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Run idempotent startup migrations
const pool = require('./db/pool');
pool.query(`
  ALTER TABLE people ADD COLUMN IF NOT EXISTS notes TEXT;
  ALTER TABLE people ADD COLUMN IF NOT EXISTS planning_year INTEGER;
  UPDATE levels SET level_name = 'Contingent' WHERE short_code = 'Cons' AND level_name = 'Consultant';
`).catch(err => logger.error('Startup migration failed', { error: err.message }));


// Planning cycles migration
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS planning_cycles (
        id         SERIAL PRIMARY KEY,
        name       VARCHAR(255) NOT NULL,
        start_date DATE NOT NULL,
        end_date   DATE NOT NULL,
        status     VARCHAR(50) NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','active','under_review','approved','closed')),
        is_active  BOOLEAN NOT NULL DEFAULT true,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE projects    ADD COLUMN IF NOT EXISTS planning_cycle_id INTEGER REFERENCES planning_cycles(id);
      ALTER TABLE projects    ADD COLUMN IF NOT EXISTS source_project_id INTEGER REFERENCES projects(id);
      ALTER TABLE allocations ADD COLUMN IF NOT EXISTS planning_cycle_id INTEGER REFERENCES planning_cycles(id);
    `);

    // Seed the two initial cycles (idempotent — only inserts if not already present)
    await pool.query(`
      INSERT INTO planning_cycles (name, start_date, end_date, status)
      SELECT '2026', '2026-01-01', '2026-09-30', 'active'
      WHERE NOT EXISTS (SELECT 1 FROM planning_cycles WHERE name = '2026');

      INSERT INTO planning_cycles (name, start_date, end_date, status)
      SELECT '2027', '2026-10-01', '2027-03-31', 'draft'
      WHERE NOT EXISTS (SELECT 1 FROM planning_cycles WHERE name = '2027');
    `);

    // Assign all unassigned projects + allocations to the 2026 cycle
    await pool.query(`
      UPDATE projects SET planning_cycle_id = (
        SELECT id FROM planning_cycles WHERE name = '2026' LIMIT 1
      ) WHERE planning_cycle_id IS NULL;

      UPDATE allocations SET planning_cycle_id = (
        SELECT id FROM planning_cycles WHERE name = '2026' LIMIT 1
      ) WHERE planning_cycle_id IS NULL;
    `);

    // Cycle approvers table for named Global Approval approvers
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cycle_approvers (
        id                SERIAL PRIMARY KEY,
        planning_cycle_id INTEGER NOT NULL REFERENCES planning_cycles(id) ON DELETE CASCADE,
        approver_name     VARCHAR(255) NOT NULL,
        approver_email    VARCHAR(255),
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    logger.info('Planning cycles migration complete');
  } catch (err) {
    logger.error('Planning cycles migration failed', { error: err.message });
  }
})();

// Drop the fixed CHECK constraint on regions.code so free-form codes can be used
(async () => {
  try {
    await pool.query(`ALTER TABLE regions DROP CONSTRAINT IF EXISTS regions_code_check;`);
  } catch (err) {
    logger.error('Regions constraint migration failed', { error: err.message });
  }
})();

// Correct emerging-market flags and add missing countries (Chile, Oman)
(async () => {
  try {
    // Insert Chile and Oman if not already present
    await pool.query(`
      INSERT INTO countries (name, code, region_id, is_emerging_market, sort_order)
      VALUES
        ('Chile', 'CHL', (SELECT id FROM regions WHERE code = 'AMER'), TRUE,  6),
        ('Oman',  'OMN', (SELECT id FROM regions WHERE code = 'MEA'),  TRUE,  6)
      ON CONFLICT (code) DO NOTHING
    `);
    // Set correct EM flags — Taiwan was incorrectly TRUE; all MEA + AMER EM countries were FALSE
    await pool.query(`
      UPDATE countries SET is_emerging_market = TRUE
      WHERE code IN ('IDN','MYS','IND','PHL','THA','COL','CHL','MEX','ZAF','ARE','NGA','SAU','TUR','OMN')
    `);
    await pool.query(`
      UPDATE countries SET is_emerging_market = FALSE WHERE code = 'TWN'
    `);
    logger.info('Emerging-market country flags updated');
  } catch (err) {
    logger.error('EM country migration failed', { error: err.message });
  }
})();

// Project comments table
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS project_comments (
        id         SERIAL       PRIMARY KEY,
        project_id INTEGER      NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        user_name  VARCHAR(255) NOT NULL,
        user_role  VARCHAR(50),
        body       TEXT         NOT NULL,
        created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_project_comments_project_id ON project_comments(project_id)
    `);
    logger.info('Project comments migration complete');
  } catch (err) {
    logger.error('Project comments migration failed', { error: err.message });
  }
})();

// Country allocations table (new simplified model: person → country → FTE)
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS country_allocations (
        id                SERIAL PRIMARY KEY,
        person_id         INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
        country_id        INTEGER NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
        planning_cycle_id INTEGER REFERENCES planning_cycles(id) ON DELETE CASCADE,
        fte_value         DECIMAL(4,2) NOT NULL DEFAULT 0,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ca_person ON country_allocations(person_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ca_country ON country_allocations(country_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ca_cycle ON country_allocations(planning_cycle_id)`);
    logger.info('Country allocations migration complete');
  } catch (err) {
    logger.error('Country allocations migration failed', { error: err.message });
  }
})();

// Person comments table
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS person_comments (
        id         SERIAL       PRIMARY KEY,
        person_id  INTEGER      NOT NULL REFERENCES people(id) ON DELETE CASCADE,
        user_name  VARCHAR(255) NOT NULL,
        user_role  VARCHAR(50),
        body       TEXT         NOT NULL,
        created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_person_comments_pid ON person_comments(person_id)`);
    logger.info('Person comments migration complete');
  } catch (err) {
    logger.error('Person comments migration failed', { error: err.message });
  }
})();

// Disciplines code column
(async () => {
  try {
    await pool.query(`ALTER TABLE disciplines ADD COLUMN IF NOT EXISTS code VARCHAR(20);`);
    await pool.query(`
      UPDATE disciplines SET code = 'COM'   WHERE LOWER(name) = 'commercial'    AND code IS NULL;
      UPDATE disciplines SET code = 'CX'    WHERE LOWER(name) = 'commissioning' AND code IS NULL;
      UPDATE disciplines SET code = 'CON'   WHERE LOWER(name) = 'construction'  AND code IS NULL;
      UPDATE disciplines SET code = 'DES'   WHERE LOWER(name) = 'design'        AND code IS NULL;
      UPDATE disciplines SET code = 'Other' WHERE LOWER(name) = 'other'         AND code IS NULL;
    `);
    logger.info('Disciplines code column migration complete');
  } catch (err) {
    logger.error('Disciplines code migration failed', { error: err.message });
  }
})();

app.use('/api/country-allocations', wrapAsync(countryAllocationsRouter));
app.use('/api/person-comments',     wrapAsync(personCommentsRouter));
app.use('/api/planning-cycles', wrapAsync(planningCyclesRouter));
app.use('/api/projects',        wrapAsync(projectsRouter));

app.use('/api/people',          wrapAsync(peopleRouter));
app.use('/api/allocations',     wrapAsync(allocationsRouter));
app.use('/api/tbh-codes',       wrapAsync(tbhCodesRouter));
app.use('/api/gearing',         wrapAsync(gearingRouter));
app.use('/api/hire-requests',   wrapAsync(hireRequestsRouter));
app.use('/api/change-requests', wrapAsync(changeRequestsRouter));
app.use('/api/dashboard',       wrapAsync(dashboardRouter));
app.use('/api/admin',           wrapAsync(adminRouter));
app.use('/api/comments',        wrapAsync(commentsRouter));
app.use('/api/imports',         wrapAsync(importsRouter));
app.use('/api/headcount',       wrapAsync(headcountRouter));
app.use('/api/smartsheet', wrapAsync(smartsheetRouter));

// Serve React build (production only — public/ is populated by npm run build)
app.use(express.static(path.join(__dirname, 'public')));
const indexHtml = path.join(__dirname, 'public', 'index.html');

/*
 * REVIEW_MODE: set REVIEW_MODE=true in the Railway *review* service environment variables.
 * Leave unset (or false) on production. No frontend rebuild needed.
 * The React login page reads window.__REVIEW_MODE__ to show/hide the gold evaluation badge.
 */
const REVIEW_SCRIPT = process.env.REVIEW_MODE === 'true'
  ? '<script>window.__REVIEW_MODE__=true;</script>'
  : '';

app.get('/*splat', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  const fs = require('fs');
  fs.access(indexHtml, (err) => {
    if (err) return next();
    if (!REVIEW_SCRIPT) return res.sendFile(indexHtml);
    fs.readFile(indexHtml, 'utf8', (readErr, html) => {
      if (readErr) return res.sendFile(indexHtml);
      res.type('html').send(html.replace('</head>', REVIEW_SCRIPT + '</head>'));
    });
  });
});

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
// Await new change_request columns before accepting traffic (prevents race condition)
(async () => {
  const crCols = [
    `ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS new_metro_location     VARCHAR(100)`,
    `ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS approval_type          VARCHAR(100)`,
    `ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS senior_approver        VARCHAR(255)`,
    `ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS senior_approver_status VARCHAR(20) DEFAULT 'N/A'`,
    `ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS xscale_vs_retail       VARCHAR(10)`,
    `ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS requestor_email        VARCHAR(255)`,
    `ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS comments               TEXT`,
    `ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS reviewer_notes         TEXT`,
  ];
  for (const sql of crCols) {
    try { await pool.query(sql); } catch (e) { logger.warn('CR col migration skipped', { sql, err: e.message }); }
  }
  // Smartsheet plan-status table
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cr_smartsheet_status (
        smartsheet_row_id BIGINT PRIMARY KEY,
        plan_status       VARCHAR(50)  NOT NULL DEFAULT 'Open',
        notes             TEXT,
        updated_by_name   VARCHAR(255),
        updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
    logger.info('cr_smartsheet_status table ready');
  } catch (e) { logger.warn('cr_smartsheet_status migration warning', { err: e.message }); }

  logger.info('Change-request schema migration complete');

  // Ensure disciplines exist first (gearing seed JOIN depends on them)
  try {
    await pool.query(`
      INSERT INTO disciplines (name) VALUES
        ('Construction'), ('Design'), ('Commercial'), ('Commissioning'), ('Other')
      ON CONFLICT (name) DO NOTHING
    `);
    const { rows: [{ count: dc }] } = await pool.query('SELECT COUNT(*) FROM disciplines');
    logger.info(`Gearing seed: ${dc} disciplines in DB`);
  } catch (e) { logger.warn('Discipline seed skipped', { err: e.message }); }

  // Ensure gearing_constants table exists and has default rows (idempotent — safe on every start)
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS gearing_constants (
        id            SERIAL       PRIMARY KEY,
        discipline_id INTEGER      NOT NULL REFERENCES disciplines(id),
        project_type  VARCHAR(20)  NOT NULL CHECK (project_type IN ('Retail', 'xScale', 'EM')),
        min_divisor   DECIMAL(4,2) NOT NULL,
        max_divisor   DECIMAL(4,2) NOT NULL,
        updated_by    INTEGER,
        updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        UNIQUE (discipline_id, project_type)
      )
    `);

    const { rows: [{ count: before }] } = await pool.query('SELECT COUNT(*) FROM gearing_constants');
    logger.info(`Gearing seed: ${before} rows before insert`);

    const { rowCount } = await pool.query(`
      INSERT INTO gearing_constants (discipline_id, project_type, min_divisor, max_divisor)
      SELECT d.id, v.project_type, v.min_d::numeric, v.max_d::numeric
      FROM (VALUES
        ('Construction', 'Retail', '2.00', '1.00'),
        ('Construction', 'xScale', '1.00', '0.50'),
        ('Construction', 'EM',     '0.50', '0.25'),
        ('Design',       'Retail', '4.00', '2.00'),
        ('Design',       'xScale', '2.00', '1.00'),
        ('Design',       'EM',     '2.00', '1.00'),
        ('Commercial',   'Retail', '6.00', '3.00'),
        ('Commercial',   'xScale', '2.50', '1.25'),
        ('Commercial',   'EM',     '2.50', '1.25'),
        ('Commissioning','Retail', '4.00', '2.00'),
        ('Commissioning','xScale', '2.00', '1.00')
      ) AS v(discipline_name, project_type, min_d, max_d)
      JOIN disciplines d ON d.name = v.discipline_name
      WHERE NOT EXISTS (
        SELECT 1 FROM gearing_constants gc
        WHERE gc.discipline_id = d.id AND gc.project_type = v.project_type
      )
    `);

    logger.info(`Gearing constants ready: ${rowCount} rows inserted`);
  } catch (e) { logger.warn('Gearing constants seed skipped', { err: e.message }); }

  app.listen(PORT, () => logger.info(`Server running on port ${PORT}`));
})();

module.exports = app;
