// Legacy role names — kept for backward compatibility with existing DB records
const ROLES = Object.freeze({
  PMO:               'PMO',
  DEPARTMENT_LEAD:   'Department Lead',
  FUNCTION_LEAD:     'Function Lead',
  WORKFORCE_PLANNING:'Workforce Planning',
  HEAD_OF_COMMERCIAL:'Head of Commercial',
  HEAD_OF_DEPARTMENT:'Head of Department',
  EVP:               'EVP',
  FINANCE:           'Finance',
});

// New profile names (access profiles system)
const PROFILES = Object.freeze({
  SENIOR_PMO:         'Senior PMO',
  PMO_TEAM:           'PMO Team',
  WORKFORCE_PLANNING: 'Workforce Planning',
  ADMINISTRATION:     'Administration',
  SENIOR_TA:          'Senior TA',
  TALENT_ACQUISITION: 'Talent Acquisition',
  FINANCE:            'Finance',
  DEPARTMENT_HEAD:    'Department Head',
  HUB_LEAD:           'Hub Lead',
  EVP:                'EVP',
});

const ALL_PROFILES = Object.values(PROFILES);
const ALL_ROLES = [...Object.values(ROLES), ...ALL_PROFILES]; // backward-compat alias

// Access tiers (the second axis — overrides profile permissions upward)
const ACCESS_TIERS = Object.freeze({
  STANDARD:      'standard',
  APPROVER:      'approver',
  ADMINISTRATOR: 'administrator',
});

// Roles/profiles that can write people, projects, and allocations
const WRITER_ROLES = [
  ROLES.PMO,              PROFILES.SENIOR_PMO,   PROFILES.PMO_TEAM,
  ROLES.WORKFORCE_PLANNING,
  ROLES.DEPARTMENT_LEAD,  PROFILES.DEPARTMENT_HEAD,
  ROLES.FUNCTION_LEAD,    PROFILES.HUB_LEAD,
  ROLES.HEAD_OF_DEPARTMENT,
  PROFILES.ADMINISTRATION,
];

// Roles/profiles that can approve hire requests at later stages
const SENIOR_ROLES = [
  ROLES.PMO,              PROFILES.SENIOR_PMO,
  ROLES.HEAD_OF_COMMERCIAL,
  ROLES.HEAD_OF_DEPARTMENT, PROFILES.DEPARTMENT_HEAD,
  ROLES.EVP,              PROFILES.EVP,
  PROFILES.HUB_LEAD,
];

/**
 * Returns the effective role string for a user.
 * Uses system_profile when set (new system), falls back to role (legacy).
 */
function effectiveRole(user) {
  return user?.system_profile ?? user?.role;
}

/**
 * Returns true if the user has administrator-tier access
 * (bypasses all role checks).
 */
function isAdmin(user) {
  return user?.access_tier === ACCESS_TIERS.ADMINISTRATOR;
}

/**
 * Express middleware: require one of the listed roles (or administrator tier).
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    // Administrator tier bypasses all role restrictions
    if (isAdmin(req.user)) return next();
    const role = effectiveRole(req.user);
    if (!allowedRoles.includes(role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

module.exports = {
  ROLES, PROFILES, ALL_PROFILES, ALL_ROLES, ACCESS_TIERS,
  WRITER_ROLES, SENIOR_ROLES,
  effectiveRole, isAdmin, requireRole,
};
