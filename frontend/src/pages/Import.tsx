import React, { useEffect, useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import {
  refDataApi, importsApi,
  type Region, type Country, type Discipline, type Level, type ContractType,
} from '../services/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'people' | 'projects' | 'tbhcodes';

interface RefMaps {
  regions: Region[];
  countries: Country[];
  disciplines: Discipline[];
  levels: Level[];
  contractTypes: ContractType[];
  regionByCode: Record<string, number>;
  regionByName: Record<string, number>;
  countryByCode: Record<string, number>;
  countryByName: Record<string, number>;
  levelByCode: Record<string, number>;
  contractByCode: Record<string, number>;
  disciplineByName: Record<string, number>;
}

interface ParsedRow { [key: string]: any }
interface ParseResult { rows: ParsedRow[]; warnings: string[] }

// ─── Constants ────────────────────────────────────────────────────────────────

const REGIONAL_SHEETS: Record<string, { regionCode: string; year: number }> = {
  'APAC 26':        { regionCode: 'APAC',        year: 2026 },
  'APAC 27':        { regionCode: 'APAC',        year: 2027 },
  'AMER 26':        { regionCode: 'AMER',        year: 2026 },
  'AMER 27':        { regionCode: 'AMER',        year: 2027 },
  'AMER Matrix 26': { regionCode: 'AMER_MATRIX', year: 2026 },
  'AMER Matrix 27': { regionCode: 'AMER_MATRIX', year: 2027 },
  'EMEA-N 26':      { regionCode: 'EMEA_N',      year: 2026 },
  'EMEA-N 27':      { regionCode: 'EMEA_N',      year: 2027 },
  'EMEA-C 26':      { regionCode: 'EMEA_C',      year: 2026 },
  'EMEA-C 27':      { regionCode: 'EMEA_C',      year: 2027 },
  'EMEA-S 26':      { regionCode: 'EMEA_S',      year: 2026 },
  'EMEA-S 27':      { regionCode: 'EMEA_S',      year: 2027 },
  'MEA 26':         { regionCode: 'MEA',         year: 2026 },
  'MEA 27':         { regionCode: 'MEA',         year: 2027 },
  'Global 26':      { regionCode: 'GLOBAL',      year: 2026 },
  'Global 27':      { regionCode: 'GLOBAL',      year: 2027 },
};

const REGION_TEXT_MAP: Record<string, string> = {
  'americas':     'AMER',
  'amer':         'AMER',
  'asia pacific': 'APAC',
  'apac':         'APAC',
  'emea':         'EMEA_N',
  'mea':          'MEA',
  'global':       'GLOBAL',
};

const STOP_KEYWORDS = ['value', 'total projects', 'adj total', 'adj xscale', 'metros', 'people allocations'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cell(row: any[], col: number): string {
  return String(row[col] ?? '').trim();
}

function inferDiscipline(jobProfile: string, costCenter: string): string {
  const text = (jobProfile + ' ' + costCenter).toLowerCase();
  if (text.includes('commission')) return 'Commissioning';
  if (text.includes('commercial')) return 'Commercial';
  if (text.includes('design')) return 'Design';
  if (text.includes('construction')) return 'Construction';
  return 'Other';
}

function inferContractType(levelCode: string): string {
  const c = levelCode.toUpperCase();
  if (c === 'VP') return 'VP';
  if (c === 'S DR' || c === 'DR') return 'Dr';
  return 'FTE';
}

function cleanType(raw: string): string {
  const t = raw.trim().toLowerCase();
  if (t === 'xscale') return 'xScale';
  if (t === 'matrix') return 'Matrix';
  return 'Retail';
}

// ─── Parsers ──────────────────────────────────────────────────────────────────

function parsePeople(wb: XLSX.WorkBook, maps: RefMaps): ParseResult {
  const rows: ParsedRow[] = [];
  const warnings: string[] = [];

  // FTE sheet — header row 5 (index 4), data from row 6 (index 5)
  const fteWs = wb.Sheets['FTE'];
  if (fteWs) {
    const data: any[][] = XLSX.utils.sheet_to_json(fteWs, { header: 1, defval: '' });
    for (let i = 5; i < data.length; i++) {
      const r = data[i];
      const name = cell(r, 1); // col B: HUB Summary Name
      if (!name || name.startsWith('Report')) continue;
      const regionText  = cell(r, 6).toLowerCase();  // col G
      const jobProfile  = cell(r, 10);               // col K
      const levelCode   = cell(r, 13);               // col N: HS Level Code
      const costCenter  = cell(r, 8);                // col I

      const regionCode   = REGION_TEXT_MAP[regionText] ?? null;
      const regionId     = regionCode ? maps.regionByCode[regionCode] ?? null : null;
      const levelId      = levelCode ? maps.levelByCode[levelCode] ?? null : null;
      const contractCode = inferContractType(levelCode);
      const contractId   = maps.contractByCode[contractCode] ?? null;
      const discipline   = inferDiscipline(jobProfile, costCenter);
      const disciplineId = maps.disciplineByName[discipline] ?? null;

      if (!levelId && levelCode) warnings.push(`FTE: unknown level code "${levelCode}" for ${name}`);

      rows.push({
        _source: 'FTE',
        name,
        contract_type_id: contractId,
        level_id: levelId,
        discipline_id: disciplineId,
        contracted_fte: 1.0,
        region_ids: regionId ? [regionId] : [],
        country_ids: [],
        _preview: { name, type: contractCode, level: levelCode, discipline, region: regionCode ?? regionText },
      });
    }
  }

  // CON sheet — header row 5 (index 4), data from row 6 (index 5)
  const conWs = wb.Sheets['CON'];
  if (conWs) {
    const data: any[][] = XLSX.utils.sheet_to_json(conWs, { header: 1, defval: '' });
    for (let i = 5; i < data.length; i++) {
      const r = data[i];
      const name = cell(r, 2); // col C: HUB Summary Name
      if (!name || name.startsWith('Report')) continue;
      const regionText = cell(r, 15).toLowerCase(); // col P: Region
      const regionCode = REGION_TEXT_MAP[regionText] ?? null;
      const regionId   = regionCode ? maps.regionByCode[regionCode] ?? null : null;
      const contractId = maps.contractByCode['CON'] ?? null;
      const levelId    = maps.levelByCode['Cons'] ?? null;
      const disciplineId = maps.disciplineByName['Other'] ?? null;

      rows.push({
        _source: 'CON',
        name,
        contract_type_id: contractId,
        level_id: levelId,
        discipline_id: disciplineId,
        contracted_fte: 1.0,
        region_ids: regionId ? [regionId] : [],
        country_ids: [],
        _preview: { name, type: 'CON', level: 'Cons', discipline: 'Other', region: regionCode ?? regionText },
      });
    }
  }

  if (!fteWs && !conWs) warnings.push('Neither FTE nor CON sheet found in this file.');
  return { rows, warnings };
}

function parseProjects(wb: XLSX.WorkBook, maps: RefMaps): ParseResult {
  const rows: ParsedRow[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  for (const [sheetName, { regionCode, year }] of Object.entries(REGIONAL_SHEETS)) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;

    const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (data.length < 3) continue;

    const regionId = maps.regionByCode[regionCode] ?? null;

    // Row index 2 = row 3 = header row — find country column groups
    const headerRow = data[2] ?? [];
    const countryGroups: { code: string; col: number }[] = [];
    const knownSuffixes = [' Type', ' Weight', ' Metro', ' Phase', ' FTE', ' Level', ' TBH'];

    for (let c = 2; c < headerRow.length; c++) {
      const h = String(headerRow[c] ?? '').trim();
      if (!h || h === 'Notes' || h === 'Column1') continue;
      const isSuffix = knownSuffixes.some(s => h.endsWith(s));
      if (!isSuffix && h.length >= 2 && h.length <= 15) {
        countryGroups.push({ code: h, col: c });
      }
    }

    // Data rows start at index 4 (row 5)
    for (let i = 4; i < data.length; i++) {
      const r = data[i];
      const statusCell = cell(r, 0);
      if (!statusCell) continue;
      if (STOP_KEYWORDS.some(k => statusCell.toLowerCase().includes(k))) break;

      const status = ['Approved', 'Seeded', 'Proposed'].includes(statusCell) ? statusCell : null;
      if (!status) continue;

      for (const { code, col } of countryGroups) {
        const projName = cell(r, col);
        if (!projName || projName === '#N/A') continue;

        const typeRaw  = cell(r, col + 1);
        const weightRaw = cell(r, col + 2);
        const metro    = cell(r, col + 3);
        const phase    = cell(r, col + 4);

        const type   = cleanType(typeRaw);
        const weight = parseFloat(weightRaw) || 1.0;

        const countryId = maps.countryByCode[code.toUpperCase()] ?? null;
        if (!countryId) warnings.push(`Unknown country code "${code}" in ${sheetName}`);

        const key = `${projName}|${year}|${regionCode}|${code}`;
        if (seen.has(key)) continue;
        seen.add(key);

        rows.push({
          name: projName,
          type,
          status,
          weight,
          region_code: regionCode,
          country_code: code,
          metro: metro || null,
          phase_code: phase || null,
          year,
          _preview: { name: projName, status, type, weight, country: code, metro, year },
        });
      }
    }
  }

  if (rows.length === 0) warnings.push('No regional sheets found (APAC 26, AMER 26, etc.) — check you uploaded the correct file.');
  return { rows, warnings };
}

function parseTbhCodes(wb: XLSX.WorkBook, maps: RefMaps): ParseResult {
  const rows: ParsedRow[] = [];
  const warnings: string[] = [];

  const ws = wb.Sheets['TBH_Data'];
  if (!ws) {
    warnings.push('TBH_Data sheet not found in this file.');
    return { rows, warnings };
  }

  // Header is row 2 (index 1), data from row 3 (index 2)
  const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  for (let i = 2; i < data.length; i++) {
    const r = data[i];
    const tbhId = cell(r, 0);
    if (!tbhId || tbhId.match(/^\d+$/)) continue; // skip numbered rows or empties

    const regionText = cell(r, 4).toLowerCase();
    const regionCode = REGION_TEXT_MAP[regionText] ?? null;
    const regionId   = regionCode ? maps.regionByCode[regionCode] ?? null : null;

    const projTypeRaw = cell(r, 5);
    const projType    = ['Retail', 'xScale', 'Matrix'].includes(projTypeRaw) ? projTypeRaw : null;

    rows.push({
      tbh_id:              tbhId,
      old_tbh:             cell(r, 1) || null,
      funding_year:        parseInt(cell(r, 2)) || null,
      hire_type:           cell(r, 3) || null,
      region_id:           regionId,
      project_type:        projType,
      legal_entity:        cell(r, 6) || null,
      location_code:       cell(r, 7) || null,
      cost_centre:         cell(r, 8) || null,
      job_profile:         cell(r, 9) || null,
      replaced_emp_name:   cell(r, 10) || null,
      manager_name:        cell(r, 11) || null,
      target_hire_date:    cell(r, 12) || null,
      jr_id:               cell(r, 13) || null,
      req_status:          cell(r, 14) || null,
      ta_contact:          cell(r, 15) || null,
      candidate_name:      cell(r, 16) || null,
      estimated_hire_date: cell(r, 17) || null,
      ta_status_comments:      cell(r, 18) || null,
      tbh_description:         cell(r, 19) || null,
      fp_and_a_notes:          cell(r, 20) || null,
      confirmed_start_date:    cell(r, 21) || null,
      hire_source:             cell(r, 22) || null,
      hire_source_details:     cell(r, 23) || null,
      fp_and_a_approver_notes: cell(r, 24) || null,
      _preview: { tbh_id: tbhId, hire_type: cell(r, 3), region: regionCode ?? cell(r, 4), status: cell(r, 14), hire_source: cell(r, 22) || null },
    });
  }

  return { rows, warnings };
}

// ─── Preview columns per tab ──────────────────────────────────────────────────

const PREVIEW_COLS: Record<Tab, { key: string; label: string }[]> = {
  people: [
    { key: 'name',       label: 'Name' },
    { key: 'type',       label: 'Contract' },
    { key: 'level',      label: 'Level' },
    { key: 'discipline', label: 'Discipline' },
    { key: 'region',     label: 'Region' },
  ],
  projects: [
    { key: 'name',    label: 'Project' },
    { key: 'status',  label: 'Status' },
    { key: 'type',    label: 'Type' },
    { key: 'weight',  label: 'Weight' },
    { key: 'country', label: 'Country' },
    { key: 'metro',   label: 'Metro' },
    { key: 'year',    label: 'Year' },
  ],
  tbhcodes: [
    { key: 'tbh_id',      label: 'TBH ID' },
    { key: 'hire_type',   label: 'Hire Type' },
    { key: 'region',      label: 'Region' },
    { key: 'status',      label: 'Status' },
    { key: 'hire_source', label: 'Hire Source' },
  ],
};

// ─── Template download ────────────────────────────────────────────────────────

const TEMPLATES: Record<Tab, { filename: string; headers: string[]; sample: (string | number)[] }> = {
  people: {
    filename: 'people_import_template.xlsx',
    headers: [
      'Name', 'Contract Type', 'Level Code', 'Discipline', 'Region Code', 'Country Code',
      'Contracted FTE', 'Workday JR ID', 'Job Title', 'Hiring Manager', 'System Profile',
    ],
    sample: ['Jane Smith', 'FTE', 'M', 'Design', 'APAC', 'AU', 1.0, '', 'Senior Engineer', 'John Manager', ''],
  },
  projects: {
    filename: 'projects_import_template.xlsx',
    headers: ['Project Name', 'Status', 'Type', 'Weight', 'Power (kW)', 'Region Code', 'Country Code', 'Metro', 'Phase Code', 'Year'],
    sample:  ['SYD Campus 1', 'Approved', 'Retail', 1.0, '', 'APAC', 'AU', 'Sydney', 'CD', 2026],
  },
  tbhcodes: {
    filename: 'tbh_codes_import_template.xlsx',
    headers: [
      'TBH ID', 'Old TBH', 'Funding Year', 'Hire Type', 'Region Code', 'Project Type',
      'Legal Entity', 'Location Code', 'Cost Centre', 'Job Profile', 'Replaced Employee',
      'Manager Name', 'Target Hire Date', 'JR ID', 'Req Status', 'TA Contact',
      'Candidate Name', 'Est Hire Date', 'TA Comments', 'TBH Description', 'FP&A Notes',
      'Confirmed Start Date', 'Hire Source', 'Hire Source Details', 'FP&A Approver Notes',
    ],
    sample: [
      'TBH-001', '', 2026, 'New HC', 'APAC', 'Retail',
      'Equinix Asia Pacific', 'SYD', 'CC-100', 'Senior Manager', '',
      'John Doe', '2026-07-01', '', 'Open', 'ta@equinix.com',
      '', '', '', 'Design Manager role for Sydney', '',
      '', 'External', '', '',
    ],
  },
};

const HINT_ROWS: Record<Tab, string[]> = {
  people: [
    '↑ Replace sample row above with your data',
    'Contract Type: FTE | CON | VP | Dr | A FTE | R FTE',
    'Level Code: VP | S Dr | Dr | S M | M | St | Sc | Ex | Sp | In | En | Ca | Te | Cons',
    'Discipline: Construction | Design | Commercial | Commissioning | Other',
    'Region Code: APAC | AMER | AMER_MATRIX | EMEA_N | EMEA_C | EMEA_S | MEA | GLOBAL',
    'Country Code: 2-letter ISO code e.g. AU, SG, US, GB (optional)',
    'System Profile: Senior PMO | PMO | Workforce Planning | Finance | Regional PMO (leave blank for standard access)',
  ],
  projects: [
    '↑ Replace sample row above with your data',
    'Status: Approved | Seeded | Proposed',
    'Type: Retail | xScale | Matrix',
    'Power (kW): numeric value in kilowatts e.g. 2500 (optional)',
    'Region Code: APAC | AMER | AMER_MATRIX | EMEA_N | EMEA_C | EMEA_S | MEA | GLOBAL',
    'Country Code: 2-letter ISO code e.g. AU, SG, US, GB',
  ],
  tbhcodes: [
    '↑ Replace sample row above with your data',
    'Hire Type: New HC | Backfill | Conversion',
    'Region Code: APAC | AMER | EMEA_N | EMEA_C | EMEA_S | MEA | GLOBAL',
    'Project Type: Retail | xScale | Matrix',
    'Req Status: Open | Approved | On Hold | Filled | Cancelled',
    'Hire Source: External | Internal',
    'Dates: YYYY-MM-DD format e.g. 2026-07-01',
  ],
};

function downloadTemplate(tab: Tab) {
  const { filename, headers, sample } = TEMPLATES[tab];
  const hints = HINT_ROWS[tab];

  const aoa: any[][] = [headers, sample, [], ...hints.map(h => [h])];
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Style header row width hints
  ws['!cols'] = headers.map(() => ({ wch: 20 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Import Data');
  XLSX.writeFile(wb, filename);
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Import() {
  const [activeTab, setActiveTab]   = useState<Tab>('people');
  const [maps, setMaps]             = useState<RefMaps | null>(null);
  const [parsed, setParsed]         = useState<ParseResult | null>(null);
  const [importing, setImporting]   = useState(false);
  const [result, setResult]         = useState<{ imported: number } | null>(null);
  const [dragging, setDragging]     = useState(false);

  useEffect(() => {
    Promise.all([
      refDataApi.regions(),
      refDataApi.countries(),
      refDataApi.disciplines(),
      refDataApi.levels(),
      refDataApi.contractTypes(),
    ]).then(([regions, countries, disciplines, levels, contractTypes]) => {
      setMaps({
        regions, countries, disciplines, levels, contractTypes,
        regionByCode:    Object.fromEntries(regions.map(r => [r.code.toUpperCase(), r.id])),
        regionByName:    Object.fromEntries(regions.map(r => [r.name.toLowerCase(), r.id])),
        countryByCode:   Object.fromEntries(countries.map(c => [c.code.toUpperCase(), c.id])),
        countryByName:   Object.fromEntries(countries.map(c => [c.name.toLowerCase(), c.id])),
        levelByCode:     Object.fromEntries(levels.map(l => [l.short_code, l.id])),
        contractByCode:  Object.fromEntries(contractTypes.map(c => [c.code, c.id])),
        disciplineByName: Object.fromEntries(disciplines.map(d => [d.name, d.id])),
      });
    }).catch(() => toast.error('Failed to load reference data'));
  }, []);

  useEffect(() => { setParsed(null); setResult(null); }, [activeTab]);

  const processFile = useCallback((file: File) => {
    if (!maps) { toast.error('Reference data still loading, please wait'); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'array' });
        let result: ParseResult;
        if (activeTab === 'people')   result = parsePeople(wb, maps);
        else if (activeTab === 'projects') result = parseProjects(wb, maps);
        else result = parseTbhCodes(wb, maps);
        setParsed(result);
        setResult(null);
        if (result.warnings.length) result.warnings.forEach(w => toast(w, { icon: '⚠' }));
        toast.success(`Parsed ${result.rows.length} rows — review and click Import`);
      } catch (err: any) {
        toast.error(`Failed to parse file: ${err.message}`);
      }
    };
    reader.readAsArrayBuffer(file);
  }, [maps, activeTab]);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  }

  async function handleImport() {
    if (!parsed?.rows.length) return;
    setImporting(true);
    try {
      const records = parsed.rows.map(({ _source, _preview, ...rest }) => rest);
      let data: any;
      if (activeTab === 'people')   data = await importsApi.people(records);
      else if (activeTab === 'projects') data = await importsApi.projects(records);
      else data = await importsApi.tbhCodes(records);
      setResult({ imported: data.imported ?? data.records?.length ?? records.length });
      toast.success(`Successfully imported ${data.imported ?? records.length} records`);
      setParsed(null);
    } catch (err: any) {
      toast.error(`Import failed: ${err.message}`);
    } finally {
      setImporting(false);
    }
  }

  const TAB_LABELS: Record<Tab, string> = { people: 'People', projects: 'Projects', tbhcodes: 'TBH Codes' };
  const TAB_DESC: Record<Tab, string> = {
    people:   'Reads FTE and CON sheets — extracts name, contract type, level, discipline, region, job title, hiring manager and system profile for each person',
    projects: 'Reads regional sheets (APAC 26/27, AMER 26/27, etc.) — extracts project codes, type, weight, power (kW), metro and status',
    tbhcodes: 'Reads TBH_Data sheet — extracts all TBH code fields including hire type, region, job profile, hire source, confirmed start date and status',
  };

  const previewCols = PREVIEW_COLS[activeTab];
  const previewRows = parsed?.rows.slice(0, 50) ?? [];

  return (
    <div style={{ color: '#111111', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ background: '#FFFFFF', borderBottom: '3px solid #E91C24', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', lineHeight: 1 }}>Data Import</div>
        <button
          onClick={() => downloadTemplate(activeTab)}
          title="Download a blank Excel template for this tab"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', background: 'transparent',
            border: '1px solid #E0E3E8', color: '#5A657B',
            borderRadius: 6, fontSize: 12, cursor: 'pointer',
            whiteSpace: 'nowrap', flexShrink: 0,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
          </svg>
          Download Template
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, background: '#FFFFFF', borderBottom: '1px solid #E5E5E5', flexShrink: 0 }}>
        {(Object.keys(TAB_LABELS) as Tab[]).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            padding: '12px 24px', background: 'transparent', border: 'none',
            borderBottom: activeTab === tab ? '2px solid #E91C24' : '2px solid transparent',
            color: activeTab === tab ? '#111111' : '#999999',
            fontSize: 14, fontWeight: activeTab === tab ? 600 : 400,
            cursor: 'pointer',
          }}>
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>

        {/* Tab description */}
        <div style={{ marginBottom: 20, padding: '10px 14px', background: '#F5F6FA', borderLeft: '3px solid #D5D5D5', borderRadius: 4, fontSize: 13, color: '#666666' }}>
          {TAB_DESC[activeTab]}
        </div>

        {/* Upload area */}
        {!parsed && !result && (
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            style={{
              border: `2px dashed ${dragging ? '#E91C24' : '#D5D5D5'}`,
              borderRadius: 10, padding: '48px 32px', textAlign: 'center',
              background: dragging ? '#FFF5F5' : '#FAFAFA',
              cursor: 'pointer', transition: 'all 0.15s',
              maxWidth: 600, margin: '0 auto',
            }}
          >
            <div style={{ fontSize: 40, marginBottom: 16 }}>📂</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: '#111111' }}>
              Drop your Excel file here
            </div>
            <div style={{ fontSize: 13, color: '#555', marginBottom: 24 }}>
              GDC HUB Summaries .xlsx file
            </div>
            <label style={{
              padding: '10px 24px', background: '#E91C24', color: '#FFF',
              borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}>
              Browse File
              <input type="file" accept=".xlsx,.xls" onChange={handleFileInput} style={{ display: 'none' }} />
            </label>
          </div>
        )}

        {/* Preview table */}
        {parsed && parsed.rows.length > 0 && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{parsed.rows.length} rows parsed</span>
                {parsed.rows.length > 50 && (
                  <span style={{ fontSize: 12, color: '#666', marginLeft: 8 }}>
                    (showing first 50)
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => { setParsed(null); setResult(null); }} style={{
                  padding: '8px 16px', background: 'transparent', border: '1px solid #D5D5D5',
                  color: '#666666', borderRadius: 6, fontSize: 13, cursor: 'pointer',
                }}>
                  Clear
                </button>
                <button onClick={handleImport} disabled={importing} style={{
                  padding: '8px 24px', background: '#E91C24', border: 'none',
                  color: '#FFF', borderRadius: 6, fontSize: 13, fontWeight: 600,
                  cursor: importing ? 'default' : 'pointer', opacity: importing ? 0.7 : 1,
                }}>
                  {importing ? 'Importing…' : `Import ${parsed.rows.length} Records`}
                </button>
              </div>
            </div>

            <div style={{ overflowX: 'auto', borderRadius: 6, border: '1px solid #E5E5E5' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#F8F9FA' }}>
                    <th style={{ padding: '8px 12px', color: '#666666', fontSize: 11, textAlign: 'left', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>#</th>
                    {activeTab === 'people' && (
                      <th style={{ padding: '8px 12px', color: '#666666', fontSize: 11, textAlign: 'left', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Source</th>
                    )}
                    {previewCols.map(col => (
                      <th key={col.key} style={{ padding: '8px 12px', color: '#666666', fontSize: 11, textAlign: 'left', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, i) => (
                    <tr key={i} style={{ borderTop: '1px solid #F0F0F0', background: i % 2 === 0 ? 'transparent' : '#FAFAFA' }}>
                      <td style={{ padding: '7px 12px', color: '#666666', fontSize: 11 }}>{i + 1}</td>
                      {activeTab === 'people' && (
                        <td style={{ padding: '7px 12px' }}>
                          <span style={{
                            fontSize: 10, padding: '2px 6px', borderRadius: 3,
                            background: row._source === 'FTE' ? '#EBF0FF' : '#E8F5EE',
                            color: row._source === 'FTE' ? '#2244BB' : '#33A85C',
                            border: `1px solid ${row._source === 'FTE' ? '#BDD0FF' : '#A8D8BF'}`,
                          }}>
                            {row._source}
                          </span>
                        </td>
                      )}
                      {previewCols.map(col => (
                        <td key={col.key} style={{ padding: '7px 12px', color: '#333333', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {String(row._preview?.[col.key] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty parse result */}
        {parsed && parsed.rows.length === 0 && (
          <div style={{ textAlign: 'center', padding: 48, color: '#555' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⚠</div>
            <div style={{ fontSize: 15 }}>No rows could be parsed from this file.</div>
            <div style={{ fontSize: 13, marginTop: 8 }}>Make sure you uploaded the GDC HUB Summaries file.</div>
            <button onClick={() => setParsed(null)} style={{
              marginTop: 20, padding: '8px 20px', background: 'transparent',
              border: '1px solid #D5D5D5', color: '#666666', borderRadius: 6, cursor: 'pointer', fontSize: 13,
            }}>Try Again</button>
          </div>
        )}

        {/* Result */}
        {result && (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>✅</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#33CC77', marginBottom: 8 }}>
              {result.imported} records imported successfully
            </div>
            <button onClick={() => setResult(null)} style={{
              marginTop: 20, padding: '10px 28px', background: '#E91C24', border: 'none',
              color: '#FFF', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 14,
            }}>
              Import More
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
