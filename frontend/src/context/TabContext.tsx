import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';

export const ROUTE_LABELS: Record<string, string> = {
  '/dashboard':       'Dashboard',
  '/projects':        'Projects',
  '/allocations':     'Allocations',
  '/summary':         'Summary',
  '/people':          'People',
  '/headcount':       'Headcount',
  '/requests':        'Hire Requests',
  '/change-requests': 'Change Requests',
  '/recruitment':     'Talent Acquisition',
  '/admin':           'Admin',
  '/import':          'Import Data',
};

export interface AppTab {
  id: string;
  route: string;
  label: string;
  isDirty: boolean;
}

interface TabContextValue {
  tabs: AppTab[];
  activeTabId: string;
  activeRoute: string;
  openTab: (route: string, forceNew?: boolean) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateTabDirty: (id: string, dirty: boolean) => void;
}

const TabContext = createContext<TabContextValue | null>(null);

let _counter = 1;

export function TabProvider({ children, initialRoute }: { children: React.ReactNode; initialRoute: string }) {
  const startRoute = ROUTE_LABELS[initialRoute] ? initialRoute : '/dashboard';
  const startLabel = ROUTE_LABELS[startRoute];
  const startId    = 'tab_0';

  const [tabs, setTabs]               = useState<AppTab[]>([{ id: startId, route: startRoute, label: startLabel, isDirty: false }]);
  const [activeTabId, setActiveTabId] = useState<string>(startId);
  const tabsRef                       = useRef(tabs);
  tabsRef.current                     = tabs; // always reflects latest value on every render

  const activeRoute = tabs.find(t => t.id === activeTabId)?.route ?? startRoute;

  const openTab = useCallback((route: string, forceNew = false) => {
    const baseLabel = ROUTE_LABELS[route] || route;
    const current   = tabsRef.current;

    if (!forceNew) {
      const existing = current.find(t => t.route === route);
      if (existing) {
        // Switch to existing tab immediately — separate setter call, no nesting
        setActiveTabId(existing.id);
        return;
      }
    }

    // Create a new tab and make it active
    const sameCount = current.filter(t => t.route === route).length;
    const label     = sameCount > 0 ? `${baseLabel} (${sameCount + 1})` : baseLabel;
    const id        = `tab_${++_counter}`;
    setActiveTabId(id);
    setTabs(prev => [...prev, { id, route, label, isDirty: false }]);
  }, []);

  const closeTab = useCallback((id: string) => {
    const current = tabsRef.current;
    if (current.length <= 1) return;
    const tab = current.find(t => t.id === id);
    if (!tab) return;
    if (tab.isDirty) {
      if (!window.confirm(`Close "${tab.label}"?\nYou have unsaved changes that will be lost.`)) return;
    }
    const idx  = current.findIndex(t => t.id === id);
    const next = current.filter(t => t.id !== id);
    setTabs(next);
    setActiveTabId(curr => {
      if (curr !== id) return curr;
      return next[Math.min(idx, next.length - 1)]?.id ?? next[0].id;
    });
  }, []);

  const updateTabDirty = useCallback((id: string, dirty: boolean) => {
    setTabs(prev => {
      const tab = prev.find(t => t.id === id);
      if (!tab || tab.isDirty === dirty) return prev; // bail — nothing changed
      return prev.map(t => t.id === id ? { ...t, isDirty: dirty } : t);
    });
  }, []);

  return (
    <TabContext.Provider value={{ tabs, activeTabId, activeRoute, openTab, closeTab, setActiveTab: setActiveTabId, updateTabDirty }}>
      {children}
    </TabContext.Provider>
  );
}

export function useTabContext() {
  const ctx = useContext(TabContext);
  if (!ctx) throw new Error('useTabContext must be used within TabProvider');
  return ctx;
}

export function useTabDirty(tabId: string | undefined, isDirty: boolean) {
  // updateTabDirty is stable (useCallback with no deps) — safe to omit ctx from deps
  const update = useContext(TabContext)?.updateTabDirty;
  useEffect(() => {
    if (update && tabId !== undefined) {
      update(tabId, isDirty);
    }
  }, [update, tabId, isDirty]); // no cleanup — tab removal handles its own state
}
