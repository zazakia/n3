import { useMemo } from 'react';
import { useAuth } from '../store/AuthContext';

/**
 * Shared Collector theme hook.
 *
 * Instead of duplicating sunlight / normal JSX branches in every screen,
 * call `useCollectorTheme()` once and destructure the tokens you need.
 *
 * Every value is a ready-to-use NativeWind className string (prefixed `cls`)
 * or a hex color string (prefixed `color`).
 */
export function useCollectorTheme() {
    const { sunlightMode } = useAuth();
    const s = sunlightMode;

    return useMemo(() => ({
        sunlightMode: s,

        // ── Gradient Header ──────────────────────────────────────
        /** LinearGradient `colors` prop – null in sunlight mode (use flat bg) */
        headerGradientColors: s ? null : (['#059669', '#064E3B'] as [string, string]),
        /** className for the header wrapper when sunlight (flat) */
        headerFlatCls: 'bg-white border-b-4 border-black',
        headerTextCls: s ? 'text-black' : 'text-white',
        headerSubtextCls: s ? 'text-black' : 'text-teal-100',
        headerLabelCls: s
            ? 'text-black text-[10px] font-black uppercase tracking-[3px]'
            : 'text-teal-100 text-[10px] font-bold uppercase tracking-[3px]',
        headerTitleCls: s
            ? 'text-black text-2xl font-black mt-0.5'
            : 'text-white text-2xl font-black mt-0.5',

        // ── Back Button ──────────────────────────────────────────
        backBtnCls: s
            ? 'bg-black w-11 h-11 rounded-2xl items-center justify-center mr-4 border-2 border-black'
            : 'bg-white/10 w-11 h-11 rounded-2xl items-center justify-center mr-4',
        backBtnIconColor: '#FFF',

        // ── Screen background ────────────────────────────────────
        screenBgCls: s ? 'bg-white' : 'bg-[#F8FAFC]',

        // ── Cards ────────────────────────────────────────────────
        cardCls: s
            ? 'bg-white border-4 border-black'
            : 'bg-white shadow-sm border border-gray-100',
        cardRoundedCls: s
            ? 'bg-white border-4 border-black rounded-[32px]'
            : 'bg-white shadow-sm border border-gray-50 rounded-[32px]',
        cardText: s ? 'text-black' : 'text-gray-900',
        cardSubtext: s ? 'text-black' : 'text-gray-700',
        cardMutedText: s ? 'text-black' : 'text-slate-600',

        // ── Primary action button ────────────────────────────────
        primaryBtnCls: s
            ? 'bg-black border-2 border-black'
            : 'bg-teal-600 shadow-lg shadow-teal-600/30',
        primaryBtnDisabledCls: s
            ? 'bg-gray-200 border-gray-200'
            : 'bg-teal-300 border-teal-300',
        primaryBtnText: 'text-white font-black uppercase tracking-[2px] text-xs',

        // ── Secondary / ghost button ─────────────────────────────
        secondaryBtnCls: s
            ? 'bg-white border-4 border-black'
            : 'bg-gray-100 border border-gray-200',
        secondaryBtnIconColor: s ? '#000' : '#4B5563',

        // ── Accent colours (hex) ─────────────────────────────────
        colorAccent: s ? '#000000' : '#059669',
        colorAccentLight: s ? '#000000' : '#10B981',
        colorAccentBg: s ? 'bg-black' : 'bg-teal-500',
        colorAccentBgLight: s ? 'bg-gray-100' : 'bg-teal-50',
        colorTint: s ? '#000' : '#0D9488',

        // ── Overdue / danger ─────────────────────────────────────
        overdueBadgeCls: s ? 'bg-black' : 'bg-red-100',
        overdueBadgeTextCls: s ? 'text-white' : 'text-red-600',
        overdueCardCls: s
            ? 'bg-white border-4 border-black'
            : 'border-red-100 bg-red-50/30 shadow-sm',
        overdueAvatarCls: s ? 'bg-black border-black' : 'bg-red-500 border-red-500',

        // ── Pill / tag badges ────────────────────────────────────
        pillCls: s
            ? 'bg-black px-3 py-1 rounded-full'
            : 'bg-teal-50 px-3 py-1 rounded-full border border-teal-100',
        pillTextCls: s
            ? 'text-white text-[10px] font-black uppercase tracking-wider'
            : 'text-teal-700 text-[10px] font-black uppercase tracking-wider',

        // ── Avatar ───────────────────────────────────────────────
        avatarCls: s
            ? 'bg-black border-black'
            : 'bg-emerald-50 border-emerald-100/50',
        avatarTextCls: s ? 'text-white' : 'text-emerald-700',

        // ── Inputs ───────────────────────────────────────────────
        inputWrapperCls: s
            ? 'bg-white border-4 border-black'
            : 'bg-gray-50 border border-gray-100',
        inputTextCls: s ? 'text-black' : 'text-gray-900',
        inputPlaceholderColor: s ? '#4B5563' : '#9CA3AF',

        // ── Search bar ───────────────────────────────────────────
        searchBarCls: s
            ? 'bg-white border-4 border-black px-5 py-4 rounded-[24px] flex-row items-center'
            : 'bg-white shadow-xl shadow-emerald-900/5 border border-emerald-50 px-5 py-4 rounded-[24px] flex-row items-center',
        searchIconColor: s ? '#000' : '#059669',

        // ── Dividers / borders ───────────────────────────────────
        dividerCls: s ? 'border-black' : 'border-gray-100',

        // ── Status bar ───────────────────────────────────────────
        statusBarStyle: (s ? 'dark-content' : 'light-content') as 'dark-content' | 'light-content',

        // ── Refresh control ──────────────────────────────────────
        refreshTintColor: s ? '#000' : '#0D9488',

        // ── Empty state ──────────────────────────────────────────
        emptyStateBgCls: s
            ? 'bg-white border-4 border-black'
            : 'bg-white border border-gray-100 shadow-sm',
        emptyStateIconColor: s ? '#000' : '#D1D5DB',
    }), [s]);
}
