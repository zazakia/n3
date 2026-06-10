import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type AccountingBasis = 'accrual' | 'cash';

interface AppState {
    isGlobalSyncing: boolean;
    selectedTheme: 'light' | 'dark';
    /** Accounting basis used across all financial report screens. Accrual is the default
     *  and is required for MFI regulatory reporting (OSS/FSS). Cash basis provides a
     *  management-level cash-flow snapshot view. */
    accountingBasis: AccountingBasis;
    setGlobalSyncing: (syncing: boolean) => void;
    setTheme: (theme: 'light' | 'dark') => void;
    setAccountingBasis: (basis: AccountingBasis) => void;
}

export const useAppStore = create<AppState>()(
    persist(
        (set) => ({
            isGlobalSyncing: false,
            selectedTheme: 'light',
            accountingBasis: 'accrual',

            setGlobalSyncing: (syncing) => set({ isGlobalSyncing: syncing }),
            setTheme: (theme) => set({ selectedTheme: theme }),
            setAccountingBasis: (basis) => set({ accountingBasis: basis }),
        }),
        {
            name: 'infinity-app-store',
            storage: createJSONStorage(() => AsyncStorage),
            // Only persist user preferences, not transient sync state
            partialize: (state) => ({
                selectedTheme: state.selectedTheme,
                accountingBasis: state.accountingBasis,
            }),
        }
    )
);
