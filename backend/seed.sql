-- =============================================================================
-- Equinix GDC Workforce Planning Application
-- Seed Data
-- =============================================================================

-- =============================================================================
-- REGIONS
-- =============================================================================

INSERT INTO regions (name, code, sort_order) VALUES
    ('AMER',                   'AMER',        1),
    ('AMER Matrix',            'AMER_MATRIX', 2),
    ('APAC',                   'APAC',        3),
    ('EMEA North',             'EMEA_N',      4),
    ('EMEA South',             'EMEA_S',      5),
    ('EMEA Central',           'EMEA_C',      6),
    ('Middle East and Africa', 'MEA',         7),
    ('Global',                 'GLOBAL',      8);

-- =============================================================================
-- COUNTRIES
-- =============================================================================

INSERT INTO countries (name, code, region_id, is_emerging_market, sort_order) VALUES
    -- APAC
    ('Japan',        'JPN', (SELECT id FROM regions WHERE code = 'APAC'), FALSE,  1),
    ('Australia',    'AUS', (SELECT id FROM regions WHERE code = 'APAC'), FALSE,  2),
    ('Singapore',    'SGP', (SELECT id FROM regions WHERE code = 'APAC'), FALSE,  3),
    ('Indonesia',    'IDN', (SELECT id FROM regions WHERE code = 'APAC'), TRUE,   4),
    ('Malaysia',     'MYS', (SELECT id FROM regions WHERE code = 'APAC'), TRUE,   5),
    ('China',        'CHN', (SELECT id FROM regions WHERE code = 'APAC'), FALSE,  6),
    ('Hong Kong',    'HKG', (SELECT id FROM regions WHERE code = 'APAC'), FALSE,  7),
    ('South Korea',  'KOR', (SELECT id FROM regions WHERE code = 'APAC'), FALSE,  8),
    ('India',        'IND', (SELECT id FROM regions WHERE code = 'APAC'), TRUE,   9),
    ('Philippines',  'PHL', (SELECT id FROM regions WHERE code = 'APAC'), TRUE,  10),
    ('Thailand',     'THA', (SELECT id FROM regions WHERE code = 'APAC'), TRUE,  11),
    ('Taiwan',       'TWN', (SELECT id FROM regions WHERE code = 'APAC'), FALSE, 12),
    -- AMER
    ('United States', 'USA', (SELECT id FROM regions WHERE code = 'AMER'), FALSE, 1),
    ('Canada',        'CAN', (SELECT id FROM regions WHERE code = 'AMER'), FALSE, 2),
    ('Brazil',        'BRA', (SELECT id FROM regions WHERE code = 'AMER'), FALSE, 3),
    ('Mexico',        'MEX', (SELECT id FROM regions WHERE code = 'AMER'), TRUE,  4),
    ('Colombia',      'COL', (SELECT id FROM regions WHERE code = 'AMER'), TRUE,  5),
    ('Chile',         'CHL', (SELECT id FROM regions WHERE code = 'AMER'), TRUE,  6),
    -- AMER Matrix sites
    ('Hampton',  'HAM', (SELECT id FROM regions WHERE code = 'AMER_MATRIX'), FALSE, 1),
    ('Minooka',  'MIN', (SELECT id FROM regions WHERE code = 'AMER_MATRIX'), FALSE, 2),
    ('Venus',    'VEN', (SELECT id FROM regions WHERE code = 'AMER_MATRIX'), FALSE, 3),
    ('EW',       'EWR', (SELECT id FROM regions WHERE code = 'AMER_MATRIX'), FALSE, 4),
    -- EMEA North
    ('United Kingdom', 'GBR', (SELECT id FROM regions WHERE code = 'EMEA_N'), FALSE, 1),
    ('France',         'FRA', (SELECT id FROM regions WHERE code = 'EMEA_N'), FALSE, 2),
    ('Netherlands',    'NLD', (SELECT id FROM regions WHERE code = 'EMEA_N'), FALSE, 3),
    ('Ireland',        'IRL', (SELECT id FROM regions WHERE code = 'EMEA_N'), FALSE, 4),
    ('Finland',        'FIN', (SELECT id FROM regions WHERE code = 'EMEA_N'), FALSE, 5),
    ('Sweden',         'SWE', (SELECT id FROM regions WHERE code = 'EMEA_N'), FALSE, 6),
    ('Denmark',        'DNK', (SELECT id FROM regions WHERE code = 'EMEA_N'), FALSE, 7),
    ('Norway',         'NOR', (SELECT id FROM regions WHERE code = 'EMEA_N'), FALSE, 8),
    -- EMEA South
    ('Italy',    'ITA', (SELECT id FROM regions WHERE code = 'EMEA_S'), FALSE, 1),
    ('Spain',    'ESP', (SELECT id FROM regions WHERE code = 'EMEA_S'), FALSE, 2),
    ('Portugal', 'PRT', (SELECT id FROM regions WHERE code = 'EMEA_S'), FALSE, 3),
    -- EMEA Central
    ('Germany',     'DEU', (SELECT id FROM regions WHERE code = 'EMEA_C'), FALSE, 1),
    ('Poland',      'POL', (SELECT id FROM regions WHERE code = 'EMEA_C'), FALSE, 2),
    ('Switzerland', 'CHE', (SELECT id FROM regions WHERE code = 'EMEA_C'), FALSE, 3),
    ('Austria',     'AUT', (SELECT id FROM regions WHERE code = 'EMEA_C'), FALSE, 4),
    -- MEA
    ('South Africa', 'ZAF', (SELECT id FROM regions WHERE code = 'MEA'), TRUE, 1),
    ('UAE',          'ARE', (SELECT id FROM regions WHERE code = 'MEA'), TRUE, 2),
    ('Nigeria',      'NGA', (SELECT id FROM regions WHERE code = 'MEA'), TRUE, 3),
    ('Saudi Arabia', 'SAU', (SELECT id FROM regions WHERE code = 'MEA'), TRUE, 4),
    ('Turkey',       'TUR', (SELECT id FROM regions WHERE code = 'MEA'), TRUE, 5),
    ('Oman',         'OMN', (SELECT id FROM regions WHERE code = 'MEA'), TRUE, 6),
    -- Global
    ('Global', 'GLB', (SELECT id FROM regions WHERE code = 'GLOBAL'), FALSE, 1);

-- =============================================================================
-- DISCIPLINES
-- =============================================================================

INSERT INTO disciplines (name) VALUES
    ('Construction'),
    ('Design'),
    ('Commercial'),
    ('Commissioning'),
    ('Other');

-- =============================================================================
-- LEVELS
-- =============================================================================

INSERT INTO levels (level_number, level_name, short_code) VALUES
    (31,   'Vice President',  'VP'),
    (26,   'Sr Director',     'S Dr'),
    (25,   'Director',        'Dr'),
    (24,   'Sr Manager',      'S M'),
    (23,   'Manager',         'M'),
    (16,   'Strategist',      'St'),
    (15,   'Scholar',         'Sc'),
    (14,   'Expert',          'Ex'),
    (13,   'Specialist',      'Sp'),
    (12,   'Intermediate',    'In'),
    (11,   'Entry',           'En'),
    (3,    'Career',          'Ca'),
    (0,    'Temp',            'Te'),
    (NULL, 'Contingent',      'Cons'),
    (NULL, 'Administration',  'Ad');

-- =============================================================================
-- CONTRACT TYPES
-- =============================================================================

INSERT INTO contract_types (code, description, category, colour_hex) VALUES
    ('VP',        'Exist VP',                 'existing',  '2D2D2D'),
    ('Dr',        'Exist Director',           'existing',  '2D2D2D'),
    ('FTE',       'Exist FTE',                'existing',  '2D2D2D'),
    ('CON',       'Exist Contingent',         'existing',  'F9A825'),
    ('A FTE',     'Approved TBH FTE',         'approved',  'E31837'),
    ('A CON',     'Approved TBH Contingent',  'approved',  'F9A825'),
    ('A CON>FTE', 'Convert to FTE Approved',  'approved',  '00BCD4'),
    ('R FTE',     'Requested TBH FTE',        'requested', 'E91E8C'),
    ('R CON',     'Requested TBH Contingent', 'requested', 'E91E8C'),
    ('R CON>FTE', 'Convert to FTE Requested', 'requested', '00BCD4');

-- =============================================================================
-- GEARING CONSTANTS
-- (Other discipline intentionally has no gearing rows)
-- =============================================================================

INSERT INTO gearing_constants (discipline_id, project_type, min_divisor, max_divisor) VALUES
    -- Construction
    ((SELECT id FROM disciplines WHERE name = 'Construction'), 'Retail', 2.00, 1.00),
    ((SELECT id FROM disciplines WHERE name = 'Construction'), 'xScale', 1.00, 0.50),
    ((SELECT id FROM disciplines WHERE name = 'Construction'), 'EM',     0.50, 0.25),
    -- Design
    ((SELECT id FROM disciplines WHERE name = 'Design'), 'Retail', 4.00, 2.00),
    ((SELECT id FROM disciplines WHERE name = 'Design'), 'xScale', 2.00, 1.00),
    ((SELECT id FROM disciplines WHERE name = 'Design'), 'EM',     2.00, 1.00),
    -- Commercial
    ((SELECT id FROM disciplines WHERE name = 'Commercial'), 'Retail', 6.00, 3.00),
    ((SELECT id FROM disciplines WHERE name = 'Commercial'), 'xScale', 2.50, 1.25),
    ((SELECT id FROM disciplines WHERE name = 'Commercial'), 'EM',     2.50, 1.25),
    -- Commissioning
    ((SELECT id FROM disciplines WHERE name = 'Commissioning'), 'Retail', 4.00, 2.00),
    ((SELECT id FROM disciplines WHERE name = 'Commissioning'), 'xScale', 2.00, 1.00);

-- =============================================================================
-- COLOUR THRESHOLDS
-- NULL min/max indicates an open-ended bound
-- =============================================================================

INSERT INTO colour_thresholds (name, min_fte, max_fte, colour_hex, sort_order) VALUES
    ('Under Capacity',    NULL, 1.00, 'FFF176', 1),
    ('On Target',         1.00, 1.20, 'A8D5A2', 2),
    ('Slightly Over',     1.20, 1.50, 'FFD180', 3),
    ('Over Capacity',     1.50, 1.80, 'FFB74D', 4),
    ('High Overload',     1.80, 2.00, 'EF9A9A', 5),
    ('Critical Overload', 2.00, NULL, 'C62828', 6);

-- =============================================================================
-- PLANNING YEARS
-- =============================================================================

INSERT INTO planning_years (year, is_active) VALUES
    (2026, TRUE),
    (2027, TRUE),
    (2028, TRUE);

-- =============================================================================
-- FINANCE SETTINGS
-- =============================================================================

INSERT INTO finance_settings (notification_emails) VALUES ('');

-- =============================================================================
-- CHANGE REQUEST RULES
-- =============================================================================

INSERT INTO change_request_rules (change_type, auto_approve) VALUES
    ('Move Region/Country',      FALSE),
    ('Change Manager',           TRUE),
    ('Change Level or Role',     FALSE),
    ('Borrow or Repurpose HC',   FALSE),
    ('Cancel TBH',               FALSE),
    ('Convert Retail to xScale', FALSE),
    ('Convert xScale to Retail', FALSE);

-- =============================================================================
-- HIERARCHY CONFIG
-- =============================================================================

INSERT INTO hierarchy_config (view_name, level_order) VALUES
    ('view1', '["Region", "Country", "Project", "Discipline", "Person"]'),
    ('view2', '["Discipline", "Person", "Project"]');
