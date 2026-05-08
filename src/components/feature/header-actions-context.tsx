"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

type Ctx = {
  actions: ReactNode;
  setActions: (node: ReactNode) => void;
};

const HeaderActionsContext = createContext<Ctx | null>(null);

export function HeaderActionsProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<ReactNode>(null);
  return (
    <HeaderActionsContext.Provider value={{ actions, setActions }}>
      {children}
    </HeaderActionsContext.Provider>
  );
}

/** Read the currently registered header actions. Used by the header itself. */
export function useHeaderActions(): ReactNode {
  const ctx = useContext(HeaderActionsContext);
  return ctx?.actions ?? null;
}

/**
 * Pages render this to declare their right-aligned header buttons.
 * Re-registers on every commit; clears on unmount.
 */
export function HeaderActions({ children }: { children: ReactNode }) {
  const ctx = useContext(HeaderActionsContext);
  useEffect(() => {
    ctx?.setActions(children);
    return () => ctx?.setActions(null);
  }, [ctx, children]);
  return null;
}
