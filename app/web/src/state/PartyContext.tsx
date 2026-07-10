import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';

type Ctx = { current: string; setCurrent: (p: string) => void; personas: Record<string, string> };

const C = createContext<Ctx | null>(null);

export function PartyProvider({ personas, children }: { personas: Record<string, string>; children: ReactNode }) {
  const [current, setCurrent] = useState(personas.gp);
  return <C.Provider value={{ current, setCurrent, personas }}>{children}</C.Provider>;
}

export const useParty = () => {
  const c = useContext(C);
  if (!c) throw new Error('no PartyProvider');
  return c;
};
