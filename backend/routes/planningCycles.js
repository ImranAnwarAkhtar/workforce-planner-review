const { Router } = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { requireRole, ROLES } = require('../middleware/rbac');
const { fireEventAlerts } = require('./alerts');

const router = Router();

// Only Workforce Planning (Admin) can write planning cycles
const WP_ONLY = [ROLES.WORKFORCE_PLANNING];

// ── List ──────────────────────────────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, name, start_date, end_date, status, is_active, created_at
     FROM planning_cycles
     ORDER BY start_date ASC`
  );
  res.json({ data: rows });
});

// ── Approvers (must come before /:id to avoid route conflict) ────────────────
router.get('/:id/approvers', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM cycle_approvers WHERE planning_cycle_id = $1 ORDER BY created_at ASC',
    [req.params.id]
  );
  res.json({ data: rows });
});

router.post('/:id/approvers', requireAuth, requireRole(...WP_ONLY), async (req, res) => {
  const { approver_name, approver_email } = req.body;
  if (!approver_name) return res.status(400).json({ error: 'approver_name is required' });
  const { rows } = await pool.query(
    'INSERT INTO cycle_approvers (planning_cycle_id, approver_name, approver_email) VALUES ($1,$2,$3) RETURNING *',
    [req.params.id, approver_name, approver_email ?? null]
  );
  res.status(201).json({ data: rows[0] });
});

router.delete('/:id/approvers/:approverId', requireAuth, requireRole(...WP_ONLY), async (req, res) => {
  const { rows } = await pool.query(
    'DELETE FROM cycle_approvers WHERE id = $1 AND planning_cycle_id = $2 RETURNING id',
    [req.params.approverId, req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Approver not found' });
  res.status(204).end();
});

// ── Get single ────────────────────────────────────────────────────────────────
router.get('/:id', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM planning_cycles WHERE id = $1',
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Planning cycle not found' });
  res.json({ data: rows[0] });
});

// ── Create (optionally copy from another cycle) ───────────────────────────────
router.post('/', requireAuth, requireRole(...WP_ONLY), async (req, res) => {
  const { name, start_date, end_date, copy_from_cycle_id } = req.body;
  if (!name || !start_date || !end_date) {
    return res.status(400).json({ error: 'name, start_date, and end_date are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [cycle] } = await client.query(
      `INSERT INTO planning_cycles (name, start_date, end_date, status, created_by)
       VALUES ($1, $2, $3, 'draft', $4) RETURNING *`,
      [name, start_date, end_date, req.user.id]
    );

    if (copy_from_cycle_id) {
      const { rows: [srcCycle] } = await client.query(
        'SELECT start_date FROM planning_cycles WHERE id = $1',
        [copy_from_cycle_id]
      );
      if (!srcCycle) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Source cycle not found' });
      }

      // Copy projects, shifting source_project_id lineage; planning_cycle_id = new cycle
      const { rows: copiedProjects } = await client.query(
        `INSERT INTO projects
           (name, type, status, weight, region_id, country_id, metro, phase_code, year,
            planning_cycle_id, source_project_id, created_by)
         SELECT
           name, type, status, weight, region_id, country_id, metro, phase_code, year,
           $1, id, $2
         FROM projects
         WHERE planning_cycle_id = $3 AND is_active = true
         RETURNING id, source_project_id`,
        [cycle.id, req.user.id, copy_from_cycle_id]
      );

      // Build a map: old project id → new project id
      const projectIdMap = {};
      for (const { id, source_project_id } of copiedProjects) {
        projectIdMap[source_project_id] = id;
      }

      // Copy allocations, shifting months by the diff between new and source cycle start dates
      // month shift = new_start - src_start (as an interval)
      if (copiedProjects.length > 0) {
        const srcStart  = new Date(srcCycle.start_date);
        const newStart  = new Date(cycle.start_date);
        const dayOffset = Math.round((newStart - srcStart) / (1000 * 60 * 60 * 24));

        for (const [oldProjId, newProjId] of Object.entries(projectIdMap)) {
          await client.query(
            `INSERT INTO allocations
               (person_id, project_id, month, fte_value, is_billable, planning_cycle_id, created_by)
             SELECT
               person_id, $1, (month + ($2 || ' days')::interval)::date,
               fte_value, is_billable, $3, $4
             FROM allocations
             WHERE project_id = $5 AND planning_cycle_id = $6`,
            [newProjId, dayOffset, cycle.id, req.user.id, parseInt(oldProjId), copy_from_cycle_id]
          );
        }
      }
    }

    await client.query('COMMIT');
    await req.auditLog({ actionType: 'CREATE', resourceType: 'planning_cycle', resourceId: cycle.id, newValue: cycle });
    res.status(201).json({ data: cycle });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// ── Update (name, dates, status) ──────────────────────────────────────────────
router.put('/:id', requireAuth, requireRole(...WP_ONLY), async (req, res) => {
  const { name, start_date, end_date, status, is_active } = req.body;
  const sets = [];
  const params = [];
  let i = 1;

  if (name       !== undefined) { sets.push(`name = $${i++}`);       params.push(name); }
  if (start_date !== undefined) { sets.push(`start_date = $${i++}`); params.push(start_date); }
  if (end_date   !== undefined) { sets.push(`end_date = $${i++}`);   params.push(end_date); }
  if (status     !== undefined) { sets.push(`status = $${i++}`);     params.push(status); }
  if (is_active  !== undefined) { sets.push(`is_active = $${i++}`);  params.push(is_active); }

  if (!sets.length) return res.status(400).json({ error: 'No fields to update' });

  params.push(req.params.id);
  const { rows } = await pool.query(
    `UPDATE planning_cycles SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    params
  );
  if (!rows.length) return res.status(404).json({ error: 'Planning cycle not found' });
  await req.auditLog({ actionType: 'UPDATE', resourceType: 'planning_cycle', resourceId: rows[0].id, newValue: rows[0] });
  if (req.body.status !== undefined) {
    fireEventAlerts('cycle_stage_changed', {
      cycle_name: rows[0].name, cycle_id: rows[0].id,
      new_status: rows[0].status, changed_by_name: req.user.name,
    }).catch(() => {});
  }
  res.json({ data: rows[0] });
});

module.exports = router;
