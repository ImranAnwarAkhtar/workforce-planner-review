const pool = require('./pool');

async function buildSnapshotData(cycleId) {
  const { rows: cycleRows } = await pool.query(
    'SELECT start_date FROM planning_cycles WHERE id = $1', [cycleId]
  );
  const startDate = cycleRows[0]?.start_date;

  const [checklistResult, signoffsResult, approversResult, headcountResult] = await Promise.all([
    pool.query(
      `SELECT stage_key, item_key, label, is_checked, checked_at
       FROM cycle_checklist_items WHERE planning_cycle_id = $1 ORDER BY stage_key, id`,
      [cycleId]
    ),
    pool.query(
      `SELECT r.name AS region_name, r.code,
              crs.signed_off_at
       FROM regions r
       LEFT JOIN cycle_region_signoffs crs
         ON crs.region_id = r.id AND crs.planning_cycle_id = $1
       ORDER BY r.sort_order`,
      [cycleId]
    ),
    pool.query(
      `SELECT role_title, approver_name, is_approved, approved_at
       FROM cycle_approvers WHERE planning_cycle_id = $1
       ORDER BY sort_order, created_at`,
      [cycleId]
    ),
    pool.query(
      `SELECT d.name AS discipline, COUNT(DISTINCT a.person_id) AS headcount
       FROM allocations a
       JOIN people p ON a.person_id = p.id
       LEFT JOIN disciplines d ON p.discipline_id = d.id
       WHERE a.planning_cycle_id = $1
       GROUP BY d.name ORDER BY d.name`,
      [cycleId]
    ),
  ]);

  let pipeline = null;
  if (startDate) {
    const { rows: pm } = await pool.query(
      `SELECT
         COUNT(*)                                   AS total,
         COUNT(*) FILTER (WHERE updated_at >= $1)   AS updated,
         COUNT(*) FILTER (WHERE type = 'Retail')    AS retail,
         COUNT(*) FILTER (WHERE type = 'xScale')    AS xscale,
         COUNT(*) FILTER (WHERE type = 'EM')        AS em,
         ROUND(AVG(weight)::numeric, 2)             AS avg_weight
       FROM projects`,
      [startDate]
    );
    const r = pm[0];
    pipeline = {
      total:    Number(r.total),
      updated:  Number(r.updated),
      by_type:  { Retail: Number(r.retail), xScale: Number(r.xscale), EM: Number(r.em) },
      avg_weight: Number(r.avg_weight),
    };
  }

  return {
    pipeline,
    checklist:               checklistResult.rows,
    region_signoffs:         signoffsResult.rows,
    approvers:               approversResult.rows,
    headcount_by_discipline: headcountResult.rows.map(r => ({ discipline: r.discipline, headcount: Number(r.headcount) })),
  };
}

async function saveSnapshot(cycleId, stageKey, userId, triggerType) {
  const data = await buildSnapshotData(cycleId);
  await pool.query(
    `INSERT INTO cycle_stage_snapshots
       (planning_cycle_id, stage_key, snapped_at, snapped_by, trigger_type, data)
     VALUES ($1, $2, NOW(), $3, $4, $5)
     ON CONFLICT (planning_cycle_id, stage_key)
       DO UPDATE SET snapped_at = NOW(), snapped_by = $3, trigger_type = $4, data = $5`,
    [cycleId, stageKey, userId ?? null, triggerType ?? 'manual', JSON.stringify(data)]
  );
}

module.exports = { buildSnapshotData, saveSnapshot };
