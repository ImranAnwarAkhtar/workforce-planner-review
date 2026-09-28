const pool = require('../db/pool');
const { isAdmin, effectiveRole } = require('./rbac');

// Roles/profiles permitted to edit projects/allocations/people in each cycle stage.
// Both legacy role names and new profile names are listed for backward compatibility.
const STAGE_EDIT_ROLES = {
  draft: [
    'PMO', 'Senior PMO',
  ],
  active: [
    'PMO', 'Senior PMO', 'PMO Team',
    'Workforce Planning', 'Administration',
    'Department Lead', 'Department Head',
    'Function Lead',   'Hub Lead',
    'Head of Department',
  ],
  under_review: [
    'PMO', 'Senior PMO', 'PMO Team',
    'Workforce Planning', 'Administration',
    'Department Lead', 'Department Head',
    'Function Lead',   'Hub Lead',
    'Head of Department',
    'Head of Commercial',
  ],
  approved: [],
  closed:   [],
};

const STAGE_LABELS = {
  draft:        'Stage 1: Admin Setup',
  active:       'Stage 2: Planning',
  under_review: 'Stage 3: Regional Review',
  approved:     'Stage 4: Global Approval',
  closed:       'Closed',
};

/**
 * Looks up a cycle's stage and checks whether req.user may edit.
 * Returns true if allowed; sends 403 + returns false if denied.
 * Administrator-tier users always pass.
 */
async function guardCycleEdit(cycleId, req, res) {
  if (!cycleId) return true;
  // Administrator tier bypasses all cycle-stage restrictions
  if (isAdmin(req.user)) return true;
  const { rows } = await pool.query(
    'SELECT status FROM planning_cycles WHERE id = $1',
    [parseInt(cycleId, 10)]
  );
  if (!rows.length) return true;
  const status = rows[0].status;
  const allowed = STAGE_EDIT_ROLES[status] ?? [];
  const role = effectiveRole(req.user);
  if (!allowed.includes(role)) {
    res.status(403).json({
      error: `This planning cycle is in "${STAGE_LABELS[status] ?? status}" — your role (${role ?? 'unknown'}) cannot make changes at this stage.`,
      cycle_status: status,
    });
    return false;
  }
  return true;
}

module.exports = { guardCycleEdit, STAGE_EDIT_ROLES, STAGE_LABELS };
