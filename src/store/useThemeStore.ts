import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { createJSONStorage, persist } = require('zustand/middleware') as typeof import('zustand/middleware');

export type ThemeColors = {
  primary: string;
  secondary: string;
  isDarkMode?: boolean;
};

export const defaultColors: ThemeColors = {
  primary: '#1A237E', // Default original primary
  secondary: '#FF8C00', // Default original secondary / accent
};

export const THEME_PALETTES = [
  { name: 'Classic Blue (Default)', primary: '#1A237E', secondary: '#FF8C00' },
  { name: 'Ocean', primary: '#0284c7', secondary: '#38bdf8' },
  { name: 'Forest', primary: '#166534', secondary: '#4ade80' },
  { name: 'Crimson', primary: '#be123c', secondary: '#fb7185' },
  { name: 'Amethyst', primary: '#6b21a8', secondary: '#c084fc' },
  { name: 'Midnight', primary: '#0f172a', secondary: '#3b82f6' },
  { name: 'Sunset', primary: '#c2410c', secondary: '#fb923c' },
];

interface ThemeState {
  colors: ThemeColors;
  setColors: (colors: Partial<ThemeColors>) => void;
  resetColors: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      colors: defaultColors,
      setColors: (newColors) =>
        set((state) => ({ colors: { ...state.colors, ...newColors } })),
      resetColors: () => set({ colors: defaultColors }),
    }),
    {
      name: 'theme-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
