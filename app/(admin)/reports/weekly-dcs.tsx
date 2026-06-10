import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { Q } from '@nozbe/watermelondb';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { database } from '../../../src/database';
import Borrower from '../../../src/database/models/Borrower';
import Collector from '../../../src/database/models/Collector';
import CollectionGroup from '../../../src/database/models/CollectionGroup';
import Loan from '../../../src/database/models/Loan';
import Payment from '../../../src/database/models/Payment';
import PaymentSchedule from '../../../src/database/models/PaymentSchedule';
import SavingsTransaction from '../../../src/database/models/SavingsTransaction';
import { SearchBar } from '../../../src/components/SearchBar';
import { formatPHP } from '../../../src/utils/currency';
import { formatDate } from '../../../src/utils/dates';

type DcsRow = {
    id: string;
    borrowerId: string;
    borrowerName: string;
    address: string;
    phone: string;
    collectorId: string;
    collectorName: string;
    groupName: string;
    meetingDay: string;
    cbu: number;
    loanBalance: number;
    principalDue: number;
    depositDue: number;
    totalDue: number;
};

type GroupSection = {
    key: string;
    title: string;
    meetingDay: string;
    rows: DcsRow[];
    totalCbu: number;
    totalBalance: number;
    totalPrincipal: number;
    totalDeposit: number;
    totalDue: number;
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function getWeekRange(offset = 0) {
    const now = new Date();
    now.setDate(now.getDate() + offset * 7);
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return { start: monday, end: sunday };
}

function normalizeName(value: string) {
    return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function money(value: number) {
    return value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function csvCell(value: string | number) {
    return `"${String(value).replace(/"/g, '""')}"`;
}

function resolveGroupName(borrower: Borrower) {
    return borrower.group?.trim() || borrower.area?.trim() || 'Ungrouped';
}

function getDateMs(value: number | Date | null | undefined) {
    if (!value) return 0;
    return typeof value === 'number' ? value : value.getTime();
}

export default function WeeklyDcsReport() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [weekOffset, setWeekOffset] = useState(0);
    const [weekRange, setWeekRange] = useState(getWeekRange(0));
    const [collectors, setCollectors] = useState<Collector[]>([]);
    const [selectedCollectorId, setSelectedCollectorId] = useState('all');
    const [selectedGroup, setSelectedGroup] = useState('all');
    const [rows, setRows] = useState<DcsRow[]>([]);
    const [groupDays, setGroupDays] = useState<Map<string, string>>(new Map());
    const [searchQuery, setSearchQuery] = useState('');

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const range = getWeekRange(weekOffset);
            setWeekRange(range);

            const [rawCollectors, rawGroups, activeWeeklyLoans] = await Promise.all([
                database.collections.get<Collector>('collectors').query(Q.where('is_active', Q.notEq(false))).fetch(),
                database.collections.get<CollectionGroup>('collection_groups').query(Q.where('is_active', Q.notEq(false))).fetch(),
                database.collections.get<Loan>('loans').query(
                    Q.where('status', 'active'),
                    Q.where('frequency', 'weekly')
                ).fetch(),
            ]);


            const dayMap = new Map<string, string>();
            rawGroups
                .filter(group => !group.deletedAt)
                .forEach(group => dayMap.set(normalizeName(group.name), DAY_NAMES[group.collectionDay] || ''));
            setGroupDays(dayMap);

            if (activeWeeklyLoans.length === 0) {
                setRows([]);
                setCollectors([]);
                return;
            }

            const borrowerIds = Array.from(new Set(activeWeeklyLoans.map(loan => loan.borrowerId).filter(Boolean)));
            const loanIds = activeWeeklyLoans.map(loan => loan.id);
            const [borrowers, schedules, payments, savings] = await Promise.all([
                database.collections.get<Borrower>('borrowers').query(Q.where('id', Q.oneOf(borrowerIds))).fetch(),
                database.collections.get<PaymentSchedule>('payment_schedules').query(
                    Q.where('loan_id', Q.oneOf(loanIds)),
                    Q.where('due_date', Q.between(range.start.getTime(), range.end.getTime()))
                ).fetch(),
                database.collections.get<Payment>('payments').query(
                    Q.where('deleted_at', Q.eq(null)),
                    Q.where('loan_id', Q.oneOf(loanIds))
                ).fetch(),
                database.collections.get<SavingsTransaction>('savings_transactions').query(
                    Q.where('deleted_at', Q.eq(null)),
                    Q.where('borrower_id', Q.oneOf(borrowerIds))
                ).fetch(),
            ]);

            const borrowerMap = new Map(borrowers.map(borrower => [borrower.id, borrower]));
            const collectorMap = new Map(rawCollectors.map(collector => [collector.id, collector]));

            const schedulesByLoan = new Map<string, PaymentSchedule[]>();
            for (const schedule of schedules) {
                schedulesByLoan.set(schedule.loanId, [...(schedulesByLoan.get(schedule.loanId) || []), schedule]);
            }

            const paidByLoan = new Map<string, number>();
            for (const payment of payments) {
                paidByLoan.set(payment.loanId, (paidByLoan.get(payment.loanId) || 0) + (payment.amount || 0));
            }

            const cbuByBorrower = new Map<string, number>();
            for (const tx of savings) {
                const multiplier = tx.type === 'withdraw_cash' || tx.type === 'withdraw_loan' ? -1 : 1;
                cbuByBorrower.set(tx.borrowerId, (cbuByBorrower.get(tx.borrowerId) || 0) + multiplier * (tx.amount || 0));
            }

            const activeCollectorIds = new Set<string>();

            const nextRows = activeWeeklyLoans
                .map<DcsRow | null>((loan) => {
                    const borrower = borrowerMap.get(loan.borrowerId);
                    if (!borrower) return null;

                    const collectorId = loan.collectorId || borrower.collectorId || '';
                    if (collectorId) activeCollectorIds.add(collectorId);

                    const groupName = resolveGroupName(borrower);
                    const loanSchedules = schedulesByLoan.get(loan.id) || [];
                    const principalDue = loanSchedules.length > 0
                        ? loanSchedules.reduce((sum, schedule) => sum + (schedule.principalAmount || schedule.scheduledAmount || 0), 0)
                        : (loan.installmentAmount || 0);
                    const depositDue = loan.depositAmount || 0;
                    const totalDue = principalDue + depositDue;

                    return {
                        id: loan.id,
                        borrowerId: borrower.id,
                        borrowerName: borrower.fullName || 'Unknown Borrower',
                        address: borrower.address || '',
                        phone: borrower.phone || '',
                        collectorId,
                        collectorName: collectorMap.get(collectorId)?.fullName || 'Unassigned',
                        groupName,
                        meetingDay: borrower.meetingDay || dayMap.get(normalizeName(groupName)) || '',
                        cbu: cbuByBorrower.get(borrower.id) || 0,
                        loanBalance: Math.max(0, (loan.totalAmount || 0) - (paidByLoan.get(loan.id) || 0)),
                        principalDue,
                        depositDue,
                        totalDue,
                    };
                })
                .filter((row): row is DcsRow => !!row)
                .sort((a, b) => a.groupName.localeCompare(b.groupName) || a.borrowerName.localeCompare(b.borrowerName));

            setRows(nextRows);

            const activeCollectorsRaw = rawCollectors.filter(c => activeCollectorIds.has(c.id));
            const collectorOptions = Array.from(
                new Map(activeCollectorsRaw.map(collector => [normalizeName(collector.fullName), collector])).values()
            ).sort((a, b) => a.fullName.localeCompare(b.fullName));
            setCollectors(collectorOptions);
        } catch (error) {
            console.error('Failed to load weekly DCS report:', error);
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, [weekOffset]);

    useFocusEffect(useCallback(() => {
        loadData();
    }, [loadData]));

    const groupOptions = useMemo(() => {
        return Array.from(new Set(rows.map(row => row.groupName))).sort((a, b) => a.localeCompare(b));
    }, [rows]);

    const filteredRows = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        return rows.filter(row => {
            const collectorMatches = selectedCollectorId === 'all' || row.collectorId === selectedCollectorId;
            const groupMatches = selectedGroup === 'all' || row.groupName === selectedGroup;
            const queryMatches = !query ||
                row.borrowerName.toLowerCase().includes(query) ||
                row.address.toLowerCase().includes(query) ||
                row.phone.toLowerCase().includes(query) ||
                row.collectorName.toLowerCase().includes(query) ||
                row.groupName.toLowerCase().includes(query);
            return collectorMatches && groupMatches && queryMatches;
        });
    }, [rows, searchQuery, selectedGroup, selectedCollectorId]);

    const sections = useMemo<GroupSection[]>(() => {
        const map = new Map<string, DcsRow[]>();
        for (const row of filteredRows) {
            map.set(row.groupName, [...(map.get(row.groupName) || []), row]);
        }

        return Array.from(map.entries()).map(([groupName, sectionRows]) => ({
            key: groupName,
            title: groupName,
            meetingDay: sectionRows[0]?.meetingDay || groupDays.get(normalizeName(groupName)) || '',
            rows: sectionRows,
            totalCbu: sectionRows.reduce((sum, row) => sum + row.cbu, 0),
            totalBalance: sectionRows.reduce((sum, row) => sum + row.loanBalance, 0),
            totalPrincipal: sectionRows.reduce((sum, row) => sum + row.principalDue, 0),
            totalDeposit: sectionRows.reduce((sum, row) => sum + row.depositDue, 0),
            totalDue: sectionRows.reduce((sum, row) => sum + row.totalDue, 0),
        })).sort((a, b) => a.title.localeCompare(b.title));
    }, [filteredRows, groupDays]);

    const totals = useMemo(() => ({
        cbu: filteredRows.reduce((sum, row) => sum + row.cbu, 0),
        balance: filteredRows.reduce((sum, row) => sum + row.loanBalance, 0),
        principal: filteredRows.reduce((sum, row) => sum + row.principalDue, 0),
        deposit: filteredRows.reduce((sum, row) => sum + row.depositDue, 0),
        due: filteredRows.reduce((sum, row) => sum + row.totalDue, 0),
    }), [filteredRows]);

    const exportCsv = async () => {
        const lines = [
            ['Weekly DCS Area Sheet'].map(csvCell).join(','),
            [`${formatDate(weekRange.start)} - ${formatDate(weekRange.end)}`].map(csvCell).join(','),
            ['Group', 'Meeting Day', 'Name Of Client', 'Address', 'Cell Number', 'Collector', 'CBU', 'Loan Balance', 'PRIN', 'DEPOSIT', 'TOTAL PAYMENTS', 'Signature'].map(csvCell).join(','),
        ];

        for (const section of sections) {
            for (const row of section.rows) {
                lines.push([
                    row.groupName,
                    row.meetingDay,
                    row.borrowerName,
                    row.address,
                    row.phone,
                    row.collectorName,
                    money(row.cbu),
                    money(row.loanBalance),
                    money(row.principalDue),
                    row.depositDue ? money(row.depositDue) : '',
                    money(row.totalDue),
                    '',
                ].map(csvCell).join(','));
            }
            lines.push([
                `${section.title} TOTAL`,
                '',
                '',
                '',
                '',
                '',
                money(section.totalCbu),
                money(section.totalBalance),
                money(section.totalPrincipal),
                money(section.totalDeposit),
                money(section.totalDue),
                '',
            ].map(csvCell).join(','));
        }

        lines.push(['GRAND TOTAL', '', '', '', '', '', money(totals.cbu), money(totals.balance), money(totals.principal), money(totals.deposit), money(totals.due), ''].map(csvCell).join(','));

        const content = `\uFEFF${lines.join('\n')}`;
        const fileName = `Weekly_DCS_${formatDate(weekRange.start).replace(/ /g, '_')}_to_${formatDate(weekRange.end).replace(/ /g, '_')}.csv`;

        if (Platform.OS === 'web') {
            const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', fileName);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            return;
        }

        const fileUri = FileSystem.documentDirectory + fileName;
        await FileSystem.writeAsStringAsync(fileUri, content, { encoding: FileSystem.EncodingType.UTF8 });
        await Sharing.shareAsync(fileUri, {
            mimeType: 'text/csv',
            dialogTitle: 'Export Weekly DCS',
            UTI: 'public.comma-separated-values-text',
        });
    };

    const printReport = async () => {
        const rowsHtml = sections.map(section => `
            <tr class="section"><td colspan="10">${section.title}${section.meetingDay ? ` - ${section.meetingDay}` : ''}</td></tr>
            ${section.rows.map(row => `
                <tr>
                    <td>${row.borrowerName}</td>
                    <td>${row.address}</td>
                    <td>${row.phone}</td>
                    <td>${row.collectorName}</td>
                    <td class="num">${money(row.cbu)}</td>
                    <td class="num">${money(row.loanBalance)}</td>
                    <td class="num">${money(row.principalDue)}</td>
                    <td class="num">${row.depositDue ? money(row.depositDue) : ''}</td>
                    <td class="num">${money(row.totalDue)}</td>
                    <td></td>
                </tr>
            `).join('')}
            <tr class="subtotal">
                <td colspan="4">${section.title} TOTAL (${section.rows.length} clients)</td>
                <td class="num">${money(section.totalCbu)}</td>
                <td class="num">${money(section.totalBalance)}</td>
                <td class="num">${money(section.totalPrincipal)}</td>
                <td class="num">${money(section.totalDeposit)}</td>
                <td class="num">${money(section.totalDue)}</td>
                <td></td>
            </tr>
        `).join('');

        const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; padding: 18mm; font-size: 9pt; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
  h1 { margin: 0; font-size: 16pt; }
  .meta { color: #555; font-size: 9pt; margin-top: 3px; }
  table { border-collapse: collapse; width: 100%; table-layout: fixed; }
  th { background: #FFC000; border: 1px solid #c99700; padding: 6px 5px; text-align: left; font-size: 8pt; }
  td { border: 1px solid #ccc; padding: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .num { text-align: right; }
  .section td { background: #1E293B; color: white; font-weight: 800; padding: 7px 5px; }
  .subtotal td, .grand td { background: #FFF3CD; font-weight: 800; }
  .grand td { border-top: 2px solid #FFC000; }
  @page { margin: 12mm; size: A4 landscape; }
  @media print { body { padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
  <div class="top">
    <div>
      <h1>Weekly DCS Area Sheet</h1>
      <div class="meta">${formatDate(weekRange.start)} - ${formatDate(weekRange.end)}</div>
    </div>
    <div class="meta">${filteredRows.length} clients | ${sections.length} group${sections.length === 1 ? '' : 's'}</div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Name Of Client</th>
        <th>Address</th>
        <th>Cell Number</th>
        <th>Collector</th>
        <th class="num">CBU</th>
        <th class="num">Loan Balance</th>
        <th class="num">PRIN</th>
        <th class="num">DEPOSIT</th>
        <th class="num">TOTAL PAYMENTS</th>
        <th>Signature</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
      <tr class="grand">
        <td colspan="4">GRAND TOTAL</td>
        <td class="num">${money(totals.cbu)}</td>
        <td class="num">${money(totals.balance)}</td>
        <td class="num">${money(totals.principal)}</td>
        <td class="num">${money(totals.deposit)}</td>
        <td class="num">${money(totals.due)}</td>
        <td></td>
      </tr>
    </tbody>
  </table>
</body>
</html>`;

        if (Platform.OS === 'web') {
            const win = window.open('', '_blank');
            if (win) {
                win.document.write(html);
                win.document.close();
                win.focus();
                setTimeout(() => win.print(), 500);
            }
            return;
        }

        const { uri } = await Print.printToFileAsync({ html });
        await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    };

    const collectorLabel = selectedCollectorId === 'all'
        ? 'All Collectors'
        : collectors.find(collector => collector.id === selectedCollectorId)?.fullName || 'Collector';

    return (
        <View className="flex-1 bg-gray-50">
            <View className="bg-white px-4 pt-4 pb-3 border-b border-gray-100">
                <View className="flex-row items-start justify-between mb-4">
                    <View className="flex-1 pr-3">
                        <Text className="text-2xl font-black text-gray-900">Weekly DCS Area Sheet</Text>
                        <Text className="text-[10px] font-black text-gray-700 uppercase tracking-widest mt-1">
                            {formatDate(weekRange.start)} - {formatDate(weekRange.end)}
                        </Text>
                        <Text className="text-xs font-bold text-gray-600 mt-1">{collectorLabel}</Text>
                    </View>
                    <View className="flex-row gap-2">
                        <Pressable
                            testID="export-weekly-dcs"
                            onPress={exportCsv}
                            className="bg-emerald-600 px-3 py-2 rounded-xl flex-row items-center"
                        >
                            <MaterialIcons name="file-download" size={16} color="#FFF" />
                            <Text className="text-white text-xs font-black ml-1">Export</Text>
                        </Pressable>
                        <Pressable
                            testID="print-weekly-dcs"
                            onPress={printReport}
                            className="bg-slate-800 px-3 py-2 rounded-xl flex-row items-center"
                        >
                            <MaterialIcons name="print" size={16} color="#FFF" />
                            <Text className="text-white text-xs font-black ml-1">Print</Text>
                        </Pressable>
                    </View>
                </View>

                <View className="flex-row items-center gap-2 mb-3">
                    <Pressable testID="prev-week" onPress={() => setWeekOffset(value => value - 1)} className="bg-gray-100 p-2 rounded-xl">
                        <MaterialIcons name="chevron-left" size={20} color="#0F172A" />
                    </Pressable>
                    <Pressable onPress={() => setWeekOffset(0)} className="bg-gray-100 flex-1 py-2 rounded-xl items-center">
                        <Text className="text-[10px] font-black text-gray-700 uppercase tracking-wider">Current Week</Text>
                    </Pressable>
                    <Pressable testID="next-week" onPress={() => setWeekOffset(value => value + 1)} className="bg-gray-100 p-2 rounded-xl">
                        <MaterialIcons name="chevron-right" size={20} color="#0F172A" />
                    </Pressable>
                </View>

                <Text className="text-[10px] font-black text-gray-700 uppercase tracking-widest mb-2">Collector</Text>
                <View className="flex-row flex-wrap gap-y-2 mb-3">
                    <FilterPill label="All" selected={selectedCollectorId === 'all'} onPress={() => setSelectedCollectorId('all')} />
                    {collectors.map(collector => (
                        <FilterPill key={collector.id} label={collector.fullName} selected={selectedCollectorId === collector.id} onPress={() => setSelectedCollectorId(collector.id)} />
                    ))}
                </View>

                <Text className="text-[10px] font-black text-gray-700 uppercase tracking-widest mb-2">Group / Area</Text>
                <View className="flex-row flex-wrap gap-y-2 mb-3">
                    <FilterPill label="All Groups" selected={selectedGroup === 'all'} onPress={() => setSelectedGroup('all')} />
                    {groupOptions.map(group => (
                        <FilterPill key={group} label={group} selected={selectedGroup === group} onPress={() => setSelectedGroup(group)} />
                    ))}
                </View>

                <SearchBar value={searchQuery} onChangeText={setSearchQuery} placeholder="Search by client, area, address, phone, or collector..." />

                <View className="flex-row gap-2 mt-4">
                    <SummaryTile label="Clients" value={String(filteredRows.length)} />
                    <SummaryTile label="Groups" value={String(sections.length)} />
                    <SummaryTile label="Due" value={formatPHP(totals.due)} wide />
                </View>
            </View>

            {loading ? (
                <ActivityIndicator testID="loading-indicator" size="large" color="#059669" className="mt-20" />
            ) : (
                <ScrollView className="flex-1" contentContainerStyle={{ padding: 12, paddingBottom: 120 }}>
                    {sections.length === 0 ? (
                        <View className="items-center bg-white rounded-2xl border border-gray-100 py-16 px-6">
                            <MaterialIcons name="event-busy" size={56} color="#CBD5E1" />
                            <Text className="text-gray-900 font-black text-lg mt-4">No weekly DCS rows</Text>
                            <Text className="text-gray-600 text-center mt-2">No active weekly loans match the current filters.</Text>
                        </View>
                    ) : (
                        sections.map(section => (
                            <View key={section.key} className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-4">
                                <View className="bg-slate-800 px-4 py-3 flex-row items-center justify-between">
                                    <View className="flex-1 pr-3">
                                        <Text className="text-white text-base font-black" numberOfLines={1}>{section.title}</Text>
                                        <Text className="text-slate-200 text-[10px] font-bold uppercase tracking-wider">
                                            {section.meetingDay || 'No meeting day'} | {section.rows.length} clients
                                        </Text>
                                    </View>
                                    <Text className="text-amber-300 text-sm font-black">{formatPHP(section.totalDue)}</Text>
                                </View>

                                <ScrollView horizontal showsHorizontalScrollIndicator>
                                    <View>
                                        <View className="flex-row bg-amber-400">
                                            <HeaderCell width={170}>Name Of Client</HeaderCell>
                                            <HeaderCell width={190}>Address</HeaderCell>
                                            <HeaderCell width={110}>Cell Number</HeaderCell>
                                            <HeaderCell width={130}>Collector</HeaderCell>
                                            <HeaderCell width={90} right>CBU</HeaderCell>
                                            <HeaderCell width={110} right>Loan Balance</HeaderCell>
                                            <HeaderCell width={90} right>PRIN</HeaderCell>
                                            <HeaderCell width={90} right>DEPOSIT</HeaderCell>
                                            <HeaderCell width={120} right>Total Payments</HeaderCell>
                                            <HeaderCell width={120}>Signature</HeaderCell>
                                        </View>
                                        {section.rows.map((row, index) => (
                                            <View key={row.id} className={`flex-row ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                                                <Pressable onPress={() => router.push(`/(admin)/borrowers/${row.borrowerId}` as any)}>
                                                    <BodyCell width={170} link>{row.borrowerName}</BodyCell>
                                                </Pressable>
                                                <BodyCell width={190}>{row.address}</BodyCell>
                                                <BodyCell width={110}>{row.phone}</BodyCell>
                                                <BodyCell width={130}>{row.collectorName}</BodyCell>
                                                <BodyCell width={90} right>{money(row.cbu)}</BodyCell>
                                                <BodyCell width={110} right>{money(row.loanBalance)}</BodyCell>
                                                <BodyCell width={90} right>{money(row.principalDue)}</BodyCell>
                                                <BodyCell width={90} right>{row.depositDue ? money(row.depositDue) : ''}</BodyCell>
                                                <BodyCell width={120} right>{money(row.totalDue)}</BodyCell>
                                                <BodyCell width={120}>{''}</BodyCell>
                                            </View>
                                        ))}
                                        <View className="flex-row bg-amber-50 border-t-2 border-amber-400">
                                            <BodyCell width={600} bold>{`${section.title} TOTAL`}</BodyCell>
                                            <BodyCell width={90} right bold>{money(section.totalCbu)}</BodyCell>
                                            <BodyCell width={110} right bold>{money(section.totalBalance)}</BodyCell>
                                            <BodyCell width={90} right bold>{money(section.totalPrincipal)}</BodyCell>
                                            <BodyCell width={90} right bold>{money(section.totalDeposit)}</BodyCell>
                                            <BodyCell width={120} right bold>{money(section.totalDue)}</BodyCell>
                                            <BodyCell width={120}>{''}</BodyCell>
                                        </View>
                                    </View>
                                </ScrollView>
                            </View>
                        ))
                    )}
                    {sections.length > 0 && (
                        <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-4 mt-2">
                            <ScrollView horizontal showsHorizontalScrollIndicator>
                                <View className="flex-row bg-emerald-50 border-t-2 border-emerald-400">
                                    <BodyCell width={600} bold>GRAND TOTAL</BodyCell>
                                    <BodyCell width={90} right bold>{money(totals.cbu)}</BodyCell>
                                    <BodyCell width={110} right bold>{money(totals.balance)}</BodyCell>
                                    <BodyCell width={90} right bold>{money(totals.principal)}</BodyCell>
                                    <BodyCell width={90} right bold>{money(totals.deposit)}</BodyCell>
                                    <BodyCell width={120} right bold>{money(totals.due)}</BodyCell>
                                    <BodyCell width={120}>{''}</BodyCell>
                                </View>
                            </ScrollView>
                        </View>
                    )}
                </ScrollView>
            )}
        </View>
    );
}

function FilterPill({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
    return (
        <Pressable onPress={onPress} className={`px-4 py-2 rounded-full mr-2 ${selected ? 'bg-emerald-600' : 'bg-gray-100'}`}>
            <Text className={`text-xs font-black ${selected ? 'text-white' : 'text-gray-700'}`} numberOfLines={1}>{label}</Text>
        </Pressable>
    );
}

function SummaryTile({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
    return (
        <View className={`${wide ? 'flex-[1.4]' : 'flex-1'} bg-gray-50 border border-gray-100 rounded-xl p-3`}>
            <Text className="text-[9px] font-black text-gray-500 uppercase tracking-widest">{label}</Text>
            <Text className="text-sm font-black text-gray-900 mt-1" numberOfLines={1}>{value}</Text>
        </View>
    );
}

function HeaderCell({ children, width, right = false }: { children: React.ReactNode; width: number; right?: boolean }) {
    return (
        <Text style={{ width }} className={`border-r border-amber-600 px-2 py-2 text-[10px] font-black text-slate-900 uppercase ${right ? 'text-right' : 'text-left'}`}>
            {children}
        </Text>
    );
}

function BodyCell({ children, width, right = false, bold = false, link = false }: { children: React.ReactNode; width: number; right?: boolean; bold?: boolean; link?: boolean }) {
    return (
        <Text
            style={{ width }}
            className={`border-r border-b border-gray-100 px-2 py-2 text-[11px] ${right ? 'text-right' : 'text-left'} ${bold ? 'font-black text-gray-900' : 'font-semibold text-gray-700'} ${link ? 'text-blue-700 underline' : ''}`}
            numberOfLines={1}
        >
            {children}
        </Text>
    );
}
