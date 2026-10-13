import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { type AbsoluteTimeRange } from '@grafana/data';
import { useSelector } from 'app/types/store';

import { isSplit } from '../state/selectors';

import { defaultIncidentRange } from './incidentRange';

export interface IncidentWorkspaceState {
  active: boolean;
  range: AbsoluteTimeRange | null;
  enter: (viewRange: AbsoluteTimeRange) => void;
  exit: () => void;
  setRange: (range: AbsoluteTimeRange) => void;
}

const noopWorkspace: IncidentWorkspaceState = {
  active: false,
  range: null,
  enter: () => {},
  exit: () => {},
  setRange: () => {},
};

const IncidentWorkspaceContext = createContext<IncidentWorkspaceState>(noopWorkspace);

export function useIncidentWorkspace() {
  return useContext(IncidentWorkspaceContext);
}

export function IncidentWorkspaceProvider({ children }: { children: ReactNode }) {
  const hasSplit = useSelector(isSplit);
  const [active, setActive] = useState(false);
  const [range, setRange] = useState<AbsoluteTimeRange | null>(null);

  useEffect(() => {
    if (!hasSplit && active) {
      setActive(false);
      setRange(null);
    }
  }, [active, hasSplit]);

  const enter = useCallback((viewRange: AbsoluteTimeRange) => {
    setRange(defaultIncidentRange(viewRange));
    setActive(true);
  }, []);

  const exit = useCallback(() => {
    setActive(false);
    setRange(null);
  }, []);

  const value = useMemo(
    () => ({
      active,
      range,
      enter,
      exit,
      setRange,
    }),
    [active, enter, exit, range]
  );

  return <IncidentWorkspaceContext.Provider value={value}>{children}</IncidentWorkspaceContext.Provider>;
}
