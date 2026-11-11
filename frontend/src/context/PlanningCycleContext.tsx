import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { planningCyclesApi, type PlanningCycle } from '../services/api';

interface PlanningCycleContextValue {
  cycles: PlanningCycle[];
  loadingCycles: boolean;
  reloadCycles: () => void;
  selectedCycleId: number | null;
  setSelectedCycleId: (id: number | null) => void;
  selectedCycle: PlanningCycle | null;
  selectedRegionId: number | null;
  setSelectedRegionId: (id: number | null) => void;
}

const PlanningCycleContext = createContext<PlanningCycleContextValue | null>(null);

const LS_CYCLE  = 'wfp_selected_cycle_id';
const LS_REGION = 'wfp_selected_region_id';

export function PlanningCycleProvider({ children }: { children: ReactNode }) {
  const [cycles, setCycles] = useState<PlanningCycle[]>([]);
  const [loadingCycles, setLoadingCycles] = useState(true);

  const [selectedCycleId, _setSelectedCycleId] = useState<number | null>(() => {
    const stored = localStorage.getItem(LS_CYCLE);
    return stored ? parseInt(stored, 10) : null;
  });

  const [selectedRegionId, _setSelectedRegionId] = useState<number | null>(() => {
    const stored = localStorage.getItem(LS_REGION);
    return stored ? parseInt(stored, 10) : null;
  });

  const setSelectedCycleId = (id: number | null) => {
    _setSelectedCycleId(id);
    if (id === null) localStorage.removeItem(LS_CYCLE);
    else localStorage.setItem(LS_CYCLE, String(id));
  };

  const setSelectedRegionId = (id: number | null) => {
    _setSelectedRegionId(id);
    if (id === null) localStorage.removeItem(LS_REGION);
    else localStorage.setItem(LS_REGION, String(id));
  };

  const loadCycles = useCallback(async () => {
    setLoadingCycles(true);
    try {
      const data = await planningCyclesApi.list();
      setCycles(data);
      // Auto-select the active cycle if nothing is stored yet
      if (!localStorage.getItem(LS_CYCLE)) {
        const active = data.find(c => ['pipeline_planning', 'resource_planning'].includes(c.status) && c.is_active)
          ?? data.find(c => c.is_active);
        if (active) setSelectedCycleId(active.id);
      }
    } catch {
      // non-fatal
    } finally {
      setLoadingCycles(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadCycles(); }, [loadCycles]);

  const selectedCycle = cycles.find(c => c.id === selectedCycleId) ?? null;

  return (
    <PlanningCycleContext.Provider value={{
      cycles, loadingCycles, reloadCycles: loadCycles,
      selectedCycleId, setSelectedCycleId, selectedCycle,
      selectedRegionId, setSelectedRegionId,
    }}>
      {children}
    </PlanningCycleContext.Provider>
  );
}

export function usePlanningCycle() {
  const ctx = useContext(PlanningCycleContext);
  if (!ctx) throw new Error('usePlanningCycle must be used within PlanningCycleProvider');
  return ctx;
}
