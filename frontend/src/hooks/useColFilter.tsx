import { useState, useMemo } from 'react';

export interface ColDef<T> {
  key: string;
  label: string;
  get: (item: T) => string;
}

const TH_BTN: React.CSSProperties = {
  marginLeft: 2, padding: '1px 3px', fontSize: 9,
  borderRadius: 3, cursor: 'pointer', lineHeight: 1, flexShrink: 0,
};

export function useColFilter<T>(data: T[], colDefs: ColDef<T>[]) {
  const [sortConfig,   setSortConfig]   = useState<{ col: string; dir: 'asc' | 'desc' } | null>(null);
  const [colFilters,   setColFilters]   = useState<Record<string, string[]>>({});
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [ddSearch,     setDdSearch]     = useState('');
  const [dropdownPos,  setDropdownPos]  = useState({ top: 0, left: 0 });

  const colUniqueValues = useMemo(() => {
    const result: Record<string, string[]> = {};
    for (const col of colDefs) {
      const vals = new Set(data.map(col.get));
      result[col.key] = Array.from(vals).sort((a, b) => {
        if (!a) return 1;
        if (!b) return -1;
        return a.localeCompare(b, undefined, { numeric: true });
      });
    }
    return result;
  }, [data, colDefs]);

  function applyToList(list: T[]): T[] {
    for (const col of colDefs) {
      const vals = colFilters[col.key];
      if (!vals || vals.length === 0) continue;
      list = list.filter(item => vals.includes(col.get(item)));
    }
    if (sortConfig) {
      const col = colDefs.find(c => c.key === sortConfig.col);
      if (col) {
        list = [...list].sort((a, b) => {
          const cmp = col.get(a).localeCompare(col.get(b), undefined, { numeric: true });
          return sortConfig.dir === 'asc' ? cmp : -cmp;
        });
      }
    }
    return list;
  }

  function openColDropdown(col: string, e: React.MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    setDropdownPos({ top: rect.bottom + 4, left: Math.max(0, rect.left) });
    setDdSearch('');
    setOpenDropdown(prev => prev === col ? null : col);
  }

  function toggleColValue(col: string, val: string) {
    setColFilters(prev => {
      const current = prev[col] ?? [];
      const next = current.includes(val) ? current.filter(v => v !== val) : [...current, val];
      return { ...prev, [col]: next };
    });
  }

  function clearColFilter(col: string) {
    setColFilters(prev => { const n = { ...prev }; delete n[col]; return n; });
    setSortConfig(prev => prev?.col === col ? null : prev);
  }

  function selectAllColValues(col: string) {
    setColFilters(prev => ({ ...prev, [col]: [...(colUniqueValues[col] ?? [])] }));
  }

  function clearAllFilters() {
    setColFilters({});
    setSortConfig(null);
  }

  const hasActiveFilter = (col: string) => !!(colFilters[col]?.length);
  const anyColFilter = colDefs.some(c => hasActiveFilter(c.key));

  function renderHeaderContent(col: ColDef<T>) {
    const active = hasActiveFilter(col.key);
    const sorted = sortConfig?.col === col.key;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <span>{col.label}</span>
        {sorted && (
          <span style={{ fontSize: 9, color: '#E91C24' }}>{sortConfig!.dir === 'asc' ? '▲' : '▼'}</span>
        )}
        {active && !sorted && (
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#E91C24', display: 'inline-block', flexShrink: 0 }} />
        )}
        <button
          onClick={e => openColDropdown(col.key, e)}
          title={`Filter ${col.label}`}
          style={{
            ...TH_BTN,
            background: active || sorted ? '#FDECEA' : 'transparent',
            border: `1px solid ${active || sorted ? '#F5C0BB' : '#D5D5D5'}`,
            color: active || sorted ? '#E91C24' : '#888',
          }}
        >▾</button>
      </div>
    );
  }

  function renderDropdown() {
    if (!openDropdown) return null;
    const col = colDefs.find(c => c.key === openDropdown);
    if (!col) return null;
    const allVals  = colUniqueValues[openDropdown] ?? [];
    const selected = colFilters[openDropdown] ?? [];
    const searchLow = ddSearch.toLowerCase();
    const visibleVals = ddSearch
      ? allVals.filter(v => v.toLowerCase().includes(searchLow) || (!v && 'blank'.includes(searchLow)))
      : allVals;
    const allChecked  = allVals.length > 0 && allVals.every(v => selected.includes(v));
    const someChecked = selected.length > 0 && !allChecked;

    return (
      <>
        <div style={{ position: 'fixed', inset: 0, zIndex: 199 }} onClick={() => setOpenDropdown(null)} />
        <div style={{
          position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, zIndex: 200,
          background: '#FFFFFF', border: '1px solid #D5D5D5', borderRadius: 6,
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)', minWidth: 200, maxWidth: 260,
          overflow: 'hidden', fontSize: 12,
        }}>
          {/* Sort */}
          <div style={{ display: 'flex', gap: 1, padding: '6px 8px', borderBottom: '1px solid #EEEEEE', background: '#F8F9FA' }}>
            <button onClick={() => { setSortConfig({ col: openDropdown, dir: 'asc' }); setOpenDropdown(null); }}
              style={{ flex: 1, padding: '4px 6px', fontSize: 11, cursor: 'pointer', background: sortConfig?.col === openDropdown && sortConfig.dir === 'asc' ? '#FDECEA' : '#FFF', border: '1px solid #D5D5D5', borderRadius: 4, color: '#333' }}>▲ A → Z</button>
            <button onClick={() => { setSortConfig({ col: openDropdown, dir: 'desc' }); setOpenDropdown(null); }}
              style={{ flex: 1, padding: '4px 6px', fontSize: 11, cursor: 'pointer', background: sortConfig?.col === openDropdown && sortConfig.dir === 'desc' ? '#FDECEA' : '#FFF', border: '1px solid #D5D5D5', borderRadius: 4, color: '#333' }}>▼ Z → A</button>
            {(sortConfig?.col === openDropdown || hasActiveFilter(openDropdown)) && (
              <button onClick={() => clearColFilter(openDropdown)}
                style={{ padding: '4px 6px', fontSize: 11, cursor: 'pointer', background: '#FFF', border: '1px solid #F5C0BB', borderRadius: 4, color: '#AD050C' }} title="Clear">✕</button>
            )}
          </div>
          {/* Search */}
          <div style={{ padding: '6px 8px', borderBottom: '1px solid #EEEEEE' }}>
            <input autoFocus placeholder={`Search ${col.label}…`} value={ddSearch}
              onChange={e => setDdSearch(e.target.value)} onClick={e => e.stopPropagation()}
              style={{ width: '100%', padding: '5px 8px', fontSize: 12, border: '1px solid #D5D5D5', borderRadius: 4, outline: 'none', boxSizing: 'border-box' as const }} />
          </div>
          {/* Select all */}
          <div style={{ padding: '5px 10px', borderBottom: '1px solid #F0F0F0', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, background: '#FAFAFA' }}
            onClick={e => { e.stopPropagation(); allChecked ? clearColFilter(openDropdown) : selectAllColValues(openDropdown); }}>
            <input type="checkbox" readOnly checked={allChecked}
              ref={el => { if (el) el.indeterminate = someChecked; }}
              style={{ accentColor: '#E91C24', cursor: 'pointer', width: 13, height: 13 }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#444', letterSpacing: '0.04em' }}>
              {allChecked ? 'Deselect All' : 'Select All'}
            </span>
          </div>
          {/* Values */}
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {visibleVals.length === 0 ? (
              <div style={{ padding: '10px', color: '#999', textAlign: 'center', fontSize: 11 }}>No matches</div>
            ) : visibleVals.map(val => (
              <label key={val || '__blank__'} onClick={e => e.stopPropagation()}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 10px', cursor: 'pointer', background: selected.includes(val) ? '#FEF4F4' : 'transparent' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = selected.includes(val) ? '#FEE8E8' : '#F5F5F5'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = selected.includes(val) ? '#FEF4F4' : 'transparent'; }}>
                <input type="checkbox" checked={selected.includes(val)} onChange={() => toggleColValue(openDropdown, val)}
                  style={{ accentColor: '#E91C24', cursor: 'pointer', width: 13, height: 13 }} />
                <span style={{ color: val ? '#111' : '#AAAAAA', fontSize: 12 }}>{val || '(Blank)'}</span>
              </label>
            ))}
          </div>
          {/* Footer */}
          <div style={{ padding: '6px 8px', borderTop: '1px solid #EEEEEE', display: 'flex', justifyContent: 'flex-end', gap: 6, background: '#F8F9FA' }}>
            {selected.length > 0 && <span style={{ fontSize: 11, color: '#666', marginRight: 'auto', alignSelf: 'center' }}>{selected.length} selected</span>}
            <button onClick={() => setOpenDropdown(null)}
              style={{ padding: '4px 12px', background: '#E91C24', color: '#FFF', border: 'none', borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Apply</button>
          </div>
        </div>
      </>
    );
  }

  function renderFilterBar() {
    if (!anyColFilter) return null;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: '#FEF4F4', border: '1px solid #F5C0BB', borderRadius: 6, marginTop: 8, fontSize: 12, flexWrap: 'wrap' as const }}>
        <span style={{ color: '#AD050C', fontWeight: 600, flexShrink: 0 }}>Column filters:</span>
        {colDefs.filter(c => hasActiveFilter(c.key)).map(c => (
          <span key={c.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '1px 7px', background: '#FDECEA', border: '1px solid #F5C0BB', borderRadius: 10, color: '#AD050C', fontWeight: 600 }}>
            {c.label} ({colFilters[c.key]!.length})
            <span style={{ cursor: 'pointer', fontWeight: 700 }} onClick={() => clearColFilter(c.key)}>✕</span>
          </span>
        ))}
        <button onClick={clearAllFilters}
          style={{ marginLeft: 'auto', padding: '3px 10px', background: 'transparent', border: '1px solid #D5D5D5', borderRadius: 4, fontSize: 11, cursor: 'pointer', color: '#666' }}>
          Clear all
        </button>
      </div>
    );
  }

  return {
    sortConfig, colFilters, hasActiveFilter, anyColFilter,
    applyToList, renderHeaderContent, renderDropdown, renderFilterBar,
    clearAllFilters,
  };
}
