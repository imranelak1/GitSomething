import { createContext, useContext } from 'react';

export const StartupContext = createContext({ active: false, dismiss: () => {} });
export const useStartup = () => useContext(StartupContext);
