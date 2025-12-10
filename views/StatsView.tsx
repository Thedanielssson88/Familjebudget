import React, { useMemo, useState } from 'react';
import { useApp } from '../store';
import { formatMoney, getEffectiveBudgetGroupData, getBudgetInterval, calculateFixedBucketCost, calculateDailyBucketCost, calculateGoalBucketCost, getEffectiveBucketData, getTotalFamilyIncome, calculateSavedAmount } from '../utils';
import { 
    PieChart, Pie, Cell, Tooltip, ResponsiveContainer, 
    ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Area, Legend,
    Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
    BarChart, Line
} from 'recharts';
import { ChevronRight, ChevronDown, Edit2, Check, AlertTriangle, TrendingUp, TrendingDown, Calendar, BarChart3, PieChart as PieIcon, Filter, Info, Plane, X, Sparkles, Zap, Trophy, ShoppingBag, Layers, Clock, DollarSign, Activity, Target, Coffee, Repeat, ArrowRight, ArrowUpRight, ArrowDownRight, AlertOctagon, Utensils, Search, Percent, ThermometerSnowflake, Rocket, Wallet, PiggyBank, LayoutGrid } from 'lucide-react';
import { BudgetProgressBar } from '../components/BudgetProgressBar';
import { cn, Button, Modal } from '../components/components';
import { BudgetGroup, Bucket, Transaction } from '../types';
import { format, subMonths, parseISO, differenceInDays, startOfDay, endOfDay, areIntervalsOverlapping, addDays, isValid, startOfMonth, endOfMonth, addMonths, getDay, startOfWeek, endOfWeek, subWeeks, getISOWeek, getDate, getDaysInMonth, eachDayOfInterval, subDays, subYears } from 'date-fns';
import { sv } from 'date-fns/locale';

// --- SUB-COMPONENT: BUDGET GROUPS SNAPSHOT (Formerly MonthlySnapshot) ---
const BudgetGroupStats = ({ selectedMonth }: { selectedMonth: string }) => {
    const { budgetGroups, subCategories, transactions, buckets, updateBudgetGroup, settings } = useApp();
    
    const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
    const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
    const [tempLimit, setTempLimit] = useState<string>('');
    
    // Drilldown State
    const [drillDownData, setDrillDownData] = useState<{ title: string, transactions: Transaction[] } | null>(null);
    
    // Filters
    const [timeframe, setTimeframe] = useState<1 | 3 | 6 | 12>(1);
    const [excludeDreams, setExcludeDreams] = useState(false);

    // --- HELPER: Calculate Budget Limit Logic ---
    const calculateGroupLimitForMonth = (group: BudgetGroup, monthKey: string) => {
        const explicitData = group.monthlyData?.[monthKey];
        
        if (explicitData && !explicitData.isExplicitlyDeleted) {
            return explicitData.limit;
        }

        if (group.linkedBucketIds && group.linkedBucketIds.length > 0) {
            const fundingBuckets = buckets.filter(b => group.linkedBucketIds?.includes(b.id));
            const totalFunding = fundingBuckets.reduce((sum, b) => {
                if (b.type === 'FIXED') return sum + calculateFixedBucketCost(b, monthKey);
                if (b.type === 'DAILY') return sum + calculateDailyBucketCost(b, monthKey, settings.payday);
                if (b.type === 'GOAL') return sum + calculateGoalBucketCost(b, monthKey);
                return sum;
            }, 0);
            return totalFunding;
        }

        const { data: inheritedData } = getEffectiveBudgetGroupData(group, monthKey);
        if (inheritedData && !inheritedData.isExplicitlyDeleted) {
            return inheritedData.limit;
        }

        return 0;
    };

    // --- HELPER: Calculate Travel Overlap ---
    const calculateDreamOverlapDays = (startDate: Date, endDate: Date) => {
        const tripDays = new Set<string>();
        const activeDreams = buckets.filter(b => b.type === 'GOAL' && b.eventStartDate && b.eventEndDate);

        activeDreams.forEach(dream => {
            if (!dream.eventStartDate || !dream.eventEndDate) return;
            const dreamStart = parseISO(dream.eventStartDate);
            const dreamEnd = parseISO(dream.eventEndDate);

            if (!isValid(dreamStart) || !isValid(dreamEnd)) return;

            if (areIntervalsOverlapping({ start: startDate, end: endDate }, { start: dreamStart, end: dreamEnd })) {
                let iter = dreamStart < startDate ? startDate : dreamStart;
                const limit = dreamEnd > endDate ? endDate : dreamEnd;
                while (iter <= limit) {
                    tripDays.add(format(iter, 'yyyy-MM-dd'));
                    iter = addDays(iter, 1);
                }
            }
        });
        return tripDays;
    };

    // --- DATA CALCULATION ---
    const data = useMemo(() => {
        let targetEndMonth = selectedMonth; 
        
        if (timeframe > 1) {
            targetEndMonth = format(subMonths(parseISO(`${selectedMonth}-01`), 1), 'yyyy-MM');
        }
        
        const endDateObj = getBudgetInterval(targetEndMonth, settings.payday).end;
        const monthsBack = timeframe - 1;
        const startMonthKey = format(subMonths(parseISO(`${targetEndMonth}-01`), monthsBack), 'yyyy-MM');
        const startDateObj = getBudgetInterval(startMonthKey, settings.payday).start;

        const startStr = format(startDateObj, 'yyyy-MM-dd');
        const endStr = format(endDateObj, 'yyyy-MM-dd');
        
        const rangeLabel = timeframe === 1 
            ? format(parseISO(`${selectedMonth}-01`), 'MMMM yyyy', { locale: sv })
            : `${format(startDateObj, 'MMM', { locale: sv })} - ${format(endDateObj, 'MMM yyyy', { locale: sv })}`;

        let scalingFactor = 1;
        let homeDaysCount = 0;
        let tripDaysCount = 0;
        let totalDays = differenceInDays(endDateObj, startDateObj) + 1;

        if (excludeDreams) {
            const tripDaysSet = calculateDreamOverlapDays(startDateObj, endDateObj);
            tripDaysCount = tripDaysSet.size;
            homeDaysCount = Math.max(1, totalDays - tripDaysCount);
            if (homeDaysCount > 5) {
                scalingFactor = totalDays / homeDaysCount;
            }
        }

        const relevantTx = transactions.filter(t => {
            if (t.date < startStr || t.date > endStr) return false;
            const isExpense = t.type === 'EXPENSE' || (!t.type && t.amount < 0);
            if (!isExpense) return false;

            if (excludeDreams && t.bucketId) {
                const bucket = buckets.find(b => b.id === t.bucketId);
                if (bucket?.type === 'GOAL') return false;
            }

            return true;
        });

        const groupStats = budgetGroups.map(group => {
            const assignedSubs = subCategories.filter(s => s.budgetGroupId === group.id);
            const assignedSubIds = new Set(assignedSubs.map(s => s.id));
            
            const groupTxs = relevantTx.filter(t => {
                if (excludeDreams) {
                     if (t.bucketId) {
                        const b = buckets.find(b => b.id === t.bucketId);
                        if (b?.type === 'GOAL') return false; 
                    }
                }

                if (t.categorySubId && assignedSubIds.has(t.categorySubId)) return true;
                if (group.isCatchAll && (!t.categorySubId || !subCategories.find(s => s.id === t.categorySubId)?.budgetGroupId)) return true;
                return false;
            });
            
            let spent = 0;
            
            if (excludeDreams) {
                groupTxs.forEach(t => {
                    const amount = Math.abs(t.amount);
                    let shouldScale = true;
                    if (t.bucketId) {
                        const b = buckets.find(b => b.id === t.bucketId);
                        if (b?.type === 'FIXED') shouldScale = false;
                    } 
                    if (group.name.toLowerCase().includes('boende') || group.name.toLowerCase().includes('fast')) {
                        shouldScale = false;
                    }
                    spent += shouldScale ? (amount * scalingFactor) : amount;
                });
            } else {
                spent = groupTxs.reduce((sum, t) => sum + Math.abs(t.amount), 0);
            }

            const avgSpent = spent / timeframe;
            
            const breakdown = assignedSubs.map(sub => {
                let subSpent = 0;
                const subTxs = groupTxs.filter(t => t.categorySubId === sub.id);
                
                subTxs.forEach(t => {
                    const amount = Math.abs(t.amount);
                    const isFixedCat = sub.name.toLowerCase().includes('hyra') || sub.name.toLowerCase().includes('avgift') || sub.name.toLowerCase().includes('försäkring');
                    const factor = (excludeDreams && !isFixedCat) ? scalingFactor : 1;
                    subSpent += amount * factor;
                });
                
                return { 
                    ...sub, 
                    spent: subSpent / timeframe,
                    transactions: subTxs.sort((a,b) => b.date.localeCompare(a.date))
                };
            }).sort((a,b) => b.spent - a.spent);

            const totalSubSpent = breakdown.reduce((sum, s) => sum + s.spent, 0);
            const unclassifiedSpent = avgSpent - totalSubSpent;
            
            const unclassifiedTxs = groupTxs.filter(t => !assignedSubIds.has(t.categorySubId || ''));

            let totalLimitOverPeriod = 0;
            for (let i = 0; i < timeframe; i++) {
                const mDate = addMonths(parseISO(`${startMonthKey}-01`), i);
                const mKey = format(mDate, 'yyyy-MM');
                totalLimitOverPeriod += calculateGroupLimitForMonth(group, mKey);
            }
            const avgLimit = totalLimitOverPeriod / timeframe;

            return {
                ...group,
                spent: avgSpent,
                limit: avgLimit,
                remaining: avgLimit - avgSpent,
                breakdown,
                unclassifiedSpent,
                unclassifiedTransactions: unclassifiedTxs.sort((a,b) => b.date.localeCompare(a.date))
            };
        }).sort((a, b) => b.spent - a.spent);

        const totalLimit = groupStats.reduce((sum, g) => sum + g.limit, 0);
        const totalSpent = groupStats.reduce((sum, g) => sum + g.spent, 0);
        const totalRemaining = totalLimit - totalSpent;

        return { 
            groupStats, totalLimit, totalSpent, totalRemaining, 
            isScaled: excludeDreams && scalingFactor > 1.05, 
            homeDays: homeDaysCount,
            totalDays,
            scalingFactor,
            rangeLabel
        };
    }, [budgetGroups, subCategories, transactions, selectedMonth, timeframe, excludeDreams, buckets, settings.payday]);

    const handleStartEdit = (group: BudgetGroup) => {
        setEditingGroupId(group.id);
        const { data } = getEffectiveBudgetGroupData(group, selectedMonth);
        setTempLimit((data ? data.limit : 0).toString());
    };
  
    const handleSaveLimit = async (group: BudgetGroup) => {
        const amount = parseInt(tempLimit) || 0;
        const updatedGroup: BudgetGroup = {
            ...group,
            monthlyData: {
                ...group.monthlyData,
                [selectedMonth]: { limit: amount, isExplicitlyDeleted: false }
            }
        };
        await updateBudgetGroup(updatedGroup);
        setEditingGroupId(null);
    };

    const pieData = data.groupStats.filter(g => g.spent > 0).map(g => ({ name: g.name, value: g.spent }));
    const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6', '#f43f5e', '#8b5cf6'];

    return (
        <div className="space-y-6 animate-in fade-in">
             {/* CONTROLS */}
             <div className="flex flex-col gap-2">
                 <div className="flex flex-wrap gap-2 items-center justify-between bg-slate-900/50 p-3 rounded-xl border border-slate-700">
                     <div className="flex gap-1 bg-slate-800 rounded-lg p-1">
                         {[1, 3, 6, 12].map(m => (
                             <button 
                                key={m}
                                onClick={() => setTimeframe(m as any)}
                                className={cn(
                                    "px-3 py-1.5 text-xs font-bold rounded-md transition-all",
                                    timeframe === m ? "bg-blue-600 text-white shadow" : "text-slate-400 hover:text-white hover:bg-slate-700"
                                )}
                             >
                                 {m === 1 ? 'Denna månad' : `Snitt ${m} mån`}
                             </button>
                         ))}
                     </div>

                     <button 
                        onClick={() => setExcludeDreams(!excludeDreams)}
                        className={cn(
                            "px-3 py-2 text-xs font-bold rounded-lg flex items-center gap-2 border transition-all",
                            excludeDreams ? "bg-purple-500/20 border-purple-500 text-purple-300" : "bg-slate-800 border-slate-700 text-slate-400 hover:text-white"
                        )}
                     >
                         <Plane size={14} />
                         {excludeDreams ? 'Resor Exkluderade' : 'Inkludera Resor'}
                     </button>
                 </div>
                 
                 {/* DATE RANGE INFO */}
                 <div className="text-center text-xs text-slate-400 bg-slate-800/30 rounded-lg py-1 border border-slate-700/50">
                     Beräkningsperiod: <span className="text-white font-medium">{data.rangeLabel}</span>
                 </div>
             </div>

             {/* SUMMARY DASHBOARD */}
            <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700/50 flex flex-col justify-center text-center">
                    <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">Budget</div>
                    <div className="text-lg md:text-xl font-mono text-white font-bold truncate">{formatMoney(data.totalLimit)}</div>
                </div>
                <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700/50 flex flex-col justify-center text-center">
                    <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">{timeframe > 1 ? 'Snitt Utfall' : 'Utfall'}</div>
                    <div className="text-lg md:text-xl font-mono text-white font-bold truncate">{formatMoney(data.totalSpent)}</div>
                </div>
                <div className={cn("p-3 rounded-xl border flex flex-col justify-center text-center", data.totalRemaining >= 0 ? "bg-emerald-950/30 border-emerald-500/30" : "bg-rose-950/30 border-rose-500/30")}>
                    <div className={cn("text-[10px] uppercase font-bold tracking-wider mb-1", data.totalRemaining >= 0 ? "text-emerald-400" : "text-rose-400")}>Resultat</div>
                    <div className={cn("text-lg md:text-xl font-mono font-bold truncate", data.totalRemaining >= 0 ? "text-emerald-300" : "text-rose-300")}>
                        {data.totalRemaining > 0 && "+"}{formatMoney(data.totalRemaining)}
                    </div>
                </div>
            </div>

            {/* PIE CHART */}
            <div className="h-64 relative bg-slate-900/30 rounded-xl border border-slate-700/50 p-2">
                {pieData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={pieData}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={80}
                                paddingAngle={5}
                                dataKey="value"
                            >
                                {pieData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip 
                                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#fff' }}
                                itemStyle={{ color: '#fff' }}
                                formatter={(value: number) => formatMoney(value)}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="flex items-center justify-center h-full text-slate-500 text-sm">Inga utgifter registrerade denna period.</div>
                )}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-center opacity-50">
                        <div className="text-xs text-slate-400 uppercase">{timeframe > 1 ? 'Snitt' : 'Totalt'}</div>
                        <div className="text-xl font-bold text-white">{formatMoney(data.totalSpent)}</div>
                    </div>
                </div>
            </div>

            {/* BUDGET GROUPS LIST */}
            <div className="space-y-4">
                <div className="flex justify-between items-center px-2">
                    <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Budgetgrupper</h2>
                </div>
                
                {data.groupStats.map(group => {
                    const isExpanded = expandedGroup === group.id;
                    const hasOverspend = group.remaining < 0;

                    return (
                        <div key={group.id} className={cn("bg-surface border rounded-xl overflow-hidden transition-all duration-300", group.isCatchAll ? "border-dashed border-slate-600" : "border-slate-700")}>
                            {/* GROUP HEADER */}
                            <div 
                                className="p-4 cursor-pointer hover:bg-slate-800/50 transition-colors"
                                onClick={() => setExpandedGroup(isExpanded ? null : group.id)}
                            >
                                <div className="flex justify-between items-center mb-2">
                                    <div className="flex items-center gap-3">
                                        {isExpanded ? <ChevronDown size={18} className="text-blue-400"/> : <ChevronRight size={18} className="text-slate-500"/>}
                                        <div>
                                            <div className="font-bold text-lg text-white flex items-center gap-2">
                                                <span>{group.icon} {group.name}</span>
                                                {hasOverspend && <AlertTriangle size={14} className="text-rose-500" />}
                                            </div>
                                            {group.isCatchAll && <div className="text-[10px] text-orange-400 uppercase font-bold">Obudgeterat / Övrigt</div>}
                                        </div>
                                    </div>
                                    
                                    <div className="text-right">
                                        {/* INLINE EDITING OF LIMIT (Only available for current month view to avoid confusion) */}
                                        {editingGroupId === group.id && timeframe === 1 ? (
                                            <div onClick={e => e.stopPropagation()} className="flex items-center justify-end gap-1 mb-1">
                                                <input 
                                                    autoFocus
                                                    type="number"
                                                    className="w-20 bg-slate-950 border border-blue-500 rounded px-2 py-1 text-right text-sm text-white outline-none font-mono"
                                                    value={tempLimit}
                                                    onChange={(e) => setTempLimit(e.target.value)}
                                                    onKeyDown={(e) => e.key === 'Enter' && handleSaveLimit(group)}
                                                />
                                                <button onClick={() => handleSaveLimit(group)} className="p-1 bg-blue-600 text-white rounded hover:bg-blue-500"><Check size={14}/></button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-end gap-2 group/edit">
                                                <div className="text-sm font-mono font-bold text-white">
                                                    {formatMoney(group.spent)}
                                                    <span className="text-slate-500 font-normal text-xs mx-1">/</span>
                                                    <span className="text-slate-400 text-xs">{formatMoney(group.limit)}</span>
                                                </div>
                                                {timeframe === 1 && (
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); handleStartEdit(group); }}
                                                        className="p-1 text-slate-600 hover:text-blue-400 opacity-0 group-hover/edit:opacity-100 transition-opacity"
                                                    >
                                                        <Edit2 size={12} />
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <BudgetProgressBar spent={group.spent} total={group.limit} compact />
                            </div>

                            {/* BREAKDOWN (Expanded) */}
                            {isExpanded && (
                                <div className="bg-slate-900/30 border-t border-slate-700/50 animate-in slide-in-from-top-2">
                                    {group.breakdown.map(sub => (
                                        <div 
                                            key={sub.id} 
                                            onClick={() => setDrillDownData({ title: sub.name, transactions: sub.transactions })}
                                            className="p-3 border-b border-slate-700/30 last:border-0 hover:bg-slate-800 transition-colors flex justify-between items-center cursor-pointer group"
                                        >
                                            <span className="text-sm text-slate-300 group-hover:text-blue-300 transition-colors">{sub.name}</span>
                                            <span className="text-sm font-mono text-white">{formatMoney(sub.spent)}</span>
                                        </div>
                                    ))}
                                    {group.unclassifiedSpent > 0.01 && (
                                        <div 
                                            onClick={() => setDrillDownData({ title: "Ospecificerat", transactions: group.unclassifiedTransactions })}
                                            className="p-3 border-b border-slate-700/30 flex justify-between items-center bg-slate-800/20 hover:bg-slate-800/40 cursor-pointer group"
                                        >
                                            <span className="text-sm text-slate-400 italic group-hover:text-slate-200">Ospecificerat / Saknar underkategori</span>
                                            <span className="text-sm font-mono text-slate-400">{formatMoney(group.unclassifiedSpent)}</span>
                                        </div>
                                    )}
                                    {group.breakdown.length === 0 && group.unclassifiedSpent < 0.01 && (
                                        <div className="p-4 text-center text-xs text-slate-500 italic">Inga utgifter här än.</div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* DRILL DOWN MODAL */}
            <Modal isOpen={!!drillDownData} onClose={() => setDrillDownData(null)} title={drillDownData?.title || 'Transaktioner'}>
                <div className="space-y-2">
                    {drillDownData?.transactions && drillDownData.transactions.length > 0 ? (
                        drillDownData.transactions.map(t => (
                            <div key={t.id} className="flex justify-between items-center p-3 bg-slate-900/50 border border-slate-800 rounded-lg">
                                <div className="flex-1 mr-4 overflow-hidden">
                                    <div className="text-white font-medium truncate">{t.description}</div>
                                    <div className="text-xs text-slate-500">{t.date}</div>
                                </div>
                                <div className={cn("font-mono font-bold whitespace-nowrap", t.amount > 0 ? "text-emerald-400" : "text-white")}>
                                    {t.amount > 0 ? '+' : ''}{formatMoney(t.amount)}
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="text-center text-slate-500 py-8 italic">Inga transaktioner hittades för denna period.</div>
                    )}
                </div>
                <div className="mt-4 border-t border-slate-700 pt-4 flex justify-end">
                    <Button variant="secondary" onClick={() => setDrillDownData(null)}>Stäng</Button>
                </div>
            </Modal>
        </div>
    );
};

// --- SUB-COMPONENT: ACCOUNT STATS (New "Konton" View) ---
const AccountStats = () => {
    const { accounts, buckets, transactions, selectedMonth, settings, mainCategories, subCategories, updateTransaction } = useApp();
    const [timeframe, setTimeframe] = useState<1 | 3 | 6 | 9 | 12>(1);
    const [expandedAccount, setExpandedAccount] = useState<string | null>(null);
    const [drillDownData, setDrillDownData] = useState<{ title: string, transactions: Transaction[] } | null>(null);
    const [mappingTx, setMappingTx] = useState<Transaction | null>(null);

    const data = useMemo(() => {
        // Date Logic (Using Budget Interval / Payday)
        let targetEndMonth = selectedMonth; 
        if (timeframe > 1) {
            targetEndMonth = format(subMonths(parseISO(`${selectedMonth}-01`), 1), 'yyyy-MM');
        }
        
        const endDateObj = getBudgetInterval(targetEndMonth, settings.payday).end;
        const monthsBack = timeframe - 1;
        const startMonthKey = format(subMonths(parseISO(`${targetEndMonth}-01`), monthsBack), 'yyyy-MM');
        const startDateObj = getBudgetInterval(startMonthKey, settings.payday).start;

        const startStr = format(startDateObj, 'yyyy-MM-dd');
        const endStr = format(endDateObj, 'yyyy-MM-dd');
        const rangeLabel = timeframe === 1 
            ? format(parseISO(`${selectedMonth}-01`), 'MMMM yyyy', { locale: sv })
            : `${format(startDateObj, 'MMM', { locale: sv })} - ${format(endDateObj, 'MMM yyyy', { locale: sv })}`;

        // Filter Transactions
        const relevantTxs = transactions.filter(t => t.date >= startStr && t.date <= endStr);

        // Process per Account
        return accounts.map(acc => {
            const accBuckets = buckets.filter(b => b.accountId === acc.id);
            const regularBuckets = accBuckets.filter(b => b.type !== 'GOAL');

            // Find Dreams:
            // 1. Owned by this account
            const ownedDreams = accBuckets.filter(b => b.type === 'GOAL');
            // 2. Referenced by transactions on this account (Cross-account spending)
            const referencedDreamIds = new Set<string>();
            relevantTxs.filter(t => t.accountId === acc.id && t.bucketId).forEach(t => {
                const b = buckets.find(bk => bk.id === t.bucketId);
                if (b && b.type === 'GOAL') {
                    referencedDreamIds.add(b.id);
                }
            });
            // Combine unique dreams
            const allRelevantDreamIds = new Set([...ownedDreams.map(d => d.id), ...referencedDreamIds]);
            const dreams = Array.from(allRelevantDreamIds).map(id => buckets.find(b => b.id === id)!).filter(Boolean);

            const getBucketData = (bucketList: Bucket[]) => {
                return bucketList.map(b => {
                    let plannedTotal = 0;
                    
                    // Sum planned amount over the timeframe months using utils
                    // ONLY if the bucket belongs to this account
                    if (b.accountId === acc.id) {
                        for(let i=0; i<timeframe; i++) {
                            const mDate = addMonths(parseISO(`${startMonthKey}-01`), i);
                            const mKey = format(mDate, 'yyyy-MM');
                            if (b.type === 'FIXED') plannedTotal += calculateFixedBucketCost(b, mKey);
                            else if (b.type === 'DAILY') plannedTotal += calculateDailyBucketCost(b, mKey, settings.payday);
                            else if (b.type === 'GOAL') plannedTotal += calculateGoalBucketCost(b, mKey);
                        }
                    }
                    const plannedAvg = plannedTotal / timeframe;

                    // Filter transactions for this bucket AND this account
                    const bucketTxs = relevantTxs.filter(t => t.bucketId === b.id && t.accountId === acc.id);
                    
                    const deposits = bucketTxs.filter(t => t.amount > 0);
                    const withdrawals = bucketTxs.filter(t => t.amount < 0 && t.type !== 'EXPENSE');
                    const expenses = bucketTxs.filter(t => t.type === 'EXPENSE');

                    const depositSum = deposits.reduce((sum, t) => sum + t.amount, 0);
                    const withdrawalSum = withdrawals.reduce((sum, t) => sum + Math.abs(t.amount), 0);
                    const expenseSum = expenses.reduce((sum, t) => sum + Math.abs(t.amount), 0);

                    return { 
                        ...b, 
                        planned: plannedAvg, 
                        deposit: depositSum / timeframe, 
                        withdrawal: withdrawalSum / timeframe,
                        expense: expenseSum / timeframe,
                        // Store raw arrays for drill-down
                        rawDeposits: deposits,
                        rawWithdrawals: withdrawals,
                        rawExpenses: expenses
                    };
                });
            };

            const bucketStats = getBucketData(regularBuckets);
            const dreamStats = getBucketData(dreams);

            // Calculate Unallocated (Transactions on account with NO bucket)
            const unallocatedTxs = relevantTxs.filter(t => 
                t.accountId === acc.id && 
                (!t.bucketId || t.bucketId === 'INTERNAL' || t.bucketId === 'PAYOUT')
            );

            const otherDeposits = unallocatedTxs.filter(t => t.amount > 0);
            const otherWithdrawals = unallocatedTxs.filter(t => t.amount < 0 && t.type !== 'EXPENSE');
            const otherExpenses = unallocatedTxs.filter(t => t.type === 'EXPENSE');

            const otherStats = {
                planned: 0,
                deposit: otherDeposits.reduce((sum, t) => sum + t.amount, 0) / timeframe,
                withdrawal: otherWithdrawals.reduce((sum, t) => sum + Math.abs(t.amount), 0) / timeframe,
                expense: otherExpenses.reduce((sum, t) => sum + Math.abs(t.amount), 0) / timeframe,
                rawDeposits: otherDeposits,
                rawWithdrawals: otherWithdrawals,
                rawExpenses: otherExpenses
            };

            const totalActual = bucketStats.reduce((s, b) => s + b.deposit, 0) + dreamStats.reduce((s, b) => s + b.deposit, 0) + otherStats.deposit;
            const totalOut = bucketStats.reduce((s, b) => s + b.withdrawal + b.expense, 0) + dreamStats.reduce((s, b) => s + b.withdrawal + b.expense, 0) + otherStats.withdrawal + otherStats.expense;
            const netFlow = totalActual - totalOut;

            return {
                ...acc,
                bucketStats,
                dreamStats,
                otherStats,
                netFlow
            };
        });
    }, [accounts, buckets, transactions, selectedMonth, timeframe, settings.payday]);

    const handleDrillDown = (title: string, txs: Transaction[]) => {
        if (txs.length > 0) {
            setDrillDownData({ title, transactions: txs });
        }
    };

    const handleMapToBucket = async (bucketId: string) => {
        if (!mappingTx) return;
        
        await updateTransaction({
            ...mappingTx,
            bucketId: bucketId,
            type: 'TRANSFER'
        });
        
        setMappingTx(null);
        setDrillDownData(null); // Close drilldown to force refresh via re-render of parent stats
    };

    // Filter buckets for the mapping modal (same account only)
    const availableBuckets = mappingTx 
        ? buckets.filter(b => b.accountId === mappingTx.accountId && !b.archivedDate)
        : [];

    return (
        <div className="space-y-6 animate-in fade-in">
            {/* TIMEFRAME SELECTOR */}
            <div className="flex bg-slate-800 p-1 rounded-xl overflow-x-auto no-scrollbar gap-1 border border-slate-700">
                {[1, 3, 6, 9, 12].map(m => (
                    <button 
                        key={m}
                        onClick={() => setTimeframe(m as any)}
                        className={cn(
                            "flex-1 px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all",
                            timeframe === m ? "bg-cyan-600 text-white shadow-lg" : "text-slate-400 hover:text-white hover:bg-slate-700"
                        )}
                    >
                        {m === 1 ? 'Denna månad' : `Snitt ${m} mån`}
                    </button>
                ))}
            </div>

            <div className="space-y-4">
                {data.map(acc => {
                    const isExpanded = expandedAccount === acc.id;
                    return (
                        <div key={acc.id} className="bg-surface border border-slate-700 rounded-xl overflow-hidden shadow-md">
                            {/* ACCOUNT HEADER */}
                            <div 
                                className="p-4 cursor-pointer hover:bg-slate-800/80 transition-colors"
                                onClick={() => setExpandedAccount(isExpanded ? null : acc.id)}
                            >
                                <div className="flex items-center gap-3 mb-2">
                                    {isExpanded ? <ChevronDown className="w-5 h-5 text-cyan-400"/> : <ChevronRight className="w-5 h-5 text-slate-500"/>}
                                    <div className="text-xl">{acc.icon}</div>
                                    <div className="flex-1">
                                        <div className="font-bold text-white text-lg">{acc.name}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xs text-slate-400 uppercase font-bold">Nettoflöde</div>
                                        <div className={cn("font-mono font-bold", acc.netFlow >= 0 ? "text-emerald-400" : "text-rose-400")}>
                                            {formatMoney(acc.netFlow)}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* DETAILED STATS */}
                            {isExpanded && (
                                <div className="bg-slate-900/30 border-t border-slate-700/50 p-2 overflow-x-auto">
                                    
                                    {/* GRID HEADER */}
                                    <div className="grid grid-cols-5 gap-2 text-[9px] uppercase font-bold text-slate-500 tracking-wider border-b border-slate-700 pb-2 mb-2 px-2 min-w-[350px]">
                                        <div className="col-span-1">Post</div>
                                        <div className="text-right text-blue-300">Plan Ins.</div>
                                        <div className="text-right text-emerald-400">Insättning</div>
                                        <div className="text-right text-orange-300">Uttag</div>
                                        <div className="text-right text-rose-400">Utgifter</div>
                                    </div>

                                    {/* REGULAR BUCKETS */}
                                    {acc.bucketStats.length > 0 && (
                                        <div className="space-y-1 mb-4 min-w-[350px]">
                                            <div className="text-[10px] font-bold text-cyan-400 uppercase flex items-center gap-1 px-2 mb-1">
                                                <LayoutGrid size={10} /> Fasta & Rörliga
                                            </div>
                                            {acc.bucketStats.map(b => (
                                                <div key={b.id} className="grid grid-cols-5 gap-2 text-[10px] items-center hover:bg-white/5 p-2 rounded transition-colors">
                                                    <div className="col-span-1 font-medium text-slate-300 truncate" title={b.name}>{b.name}</div>
                                                    <div className="text-right text-blue-200/70 font-mono">{formatMoney(b.planned)}</div>
                                                    <div 
                                                        className={cn("text-right font-mono cursor-pointer hover:bg-emerald-500/20 rounded px-1", b.deposit > 0 ? "text-emerald-400 font-bold" : "text-slate-600")}
                                                        onClick={() => handleDrillDown(`${b.name} - Insättningar`, b.rawDeposits)}
                                                    >
                                                        {formatMoney(b.deposit)}
                                                    </div>
                                                    <div 
                                                        className={cn("text-right font-mono cursor-pointer hover:bg-orange-500/20 rounded px-1", b.withdrawal > 0 ? "text-orange-300" : "text-slate-600")}
                                                        onClick={() => handleDrillDown(`${b.name} - Uttag (Överföringar)`, b.rawWithdrawals)}
                                                    >
                                                        {formatMoney(b.withdrawal)}
                                                    </div>
                                                    <div 
                                                        className={cn("text-right font-mono cursor-pointer hover:bg-rose-500/20 rounded px-1", b.expense > 0 ? "text-rose-400" : "text-slate-600")}
                                                        onClick={() => handleDrillDown(`${b.name} - Utgifter (Konsumtion)`, b.rawExpenses)}
                                                    >
                                                        {formatMoney(b.expense)}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* DREAMS */}
                                    {acc.dreamStats.length > 0 && (
                                        <div className="space-y-1 mb-4 min-w-[350px]">
                                            <div className="text-[10px] font-bold text-purple-400 uppercase flex items-center gap-1 px-2 mb-1">
                                                <Target size={10} /> Drömmar & Mål
                                            </div>
                                            {acc.dreamStats.map(b => (
                                                <div key={b.id} className="grid grid-cols-5 gap-2 text-[10px] items-center hover:bg-white/5 p-2 rounded transition-colors">
                                                    <div className="col-span-1 font-medium text-slate-300 truncate" title={b.name}>{b.name}</div>
                                                    <div className="text-right text-blue-200/70 font-mono">{formatMoney(b.planned)}</div>
                                                    <div 
                                                        className={cn("text-right font-mono cursor-pointer hover:bg-emerald-500/20 rounded px-1", b.deposit > 0 ? "text-emerald-400 font-bold" : "text-slate-600")}
                                                        onClick={() => handleDrillDown(`${b.name} - Insättningar`, b.rawDeposits)}
                                                    >
                                                        {formatMoney(b.deposit)}
                                                    </div>
                                                    <div 
                                                        className={cn("text-right font-mono cursor-pointer hover:bg-orange-500/20 rounded px-1", b.withdrawal > 0 ? "text-orange-300" : "text-slate-600")}
                                                        onClick={() => handleDrillDown(`${b.name} - Uttag`, b.rawWithdrawals)}
                                                    >
                                                        {formatMoney(b.withdrawal)}
                                                    </div>
                                                    <div 
                                                        className={cn("text-right font-mono cursor-pointer hover:bg-rose-500/20 rounded px-1", b.expense > 0 ? "text-rose-400" : "text-slate-600")}
                                                        onClick={() => handleDrillDown(`${b.name} - Utgifter`, b.rawExpenses)}
                                                    >
                                                        {formatMoney(b.expense)}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* UNALLOCATED */}
                                    <div className="space-y-1 pt-2 border-t border-slate-700/30 min-w-[350px]">
                                        <div className="text-[10px] font-bold text-orange-400 uppercase flex items-center gap-1 px-2">
                                            <AlertOctagon size={10} /> Övrigt / Okopplat
                                        </div>
                                        <div className="grid grid-cols-5 gap-2 text-[10px] items-center hover:bg-white/5 p-2 rounded transition-colors">
                                            <div className="col-span-1 font-medium text-slate-300">Övriga Transaktioner</div>
                                            <div className="text-right text-slate-600 font-mono">-</div>
                                            <div 
                                                className={cn("text-right font-mono cursor-pointer hover:bg-emerald-500/20 rounded px-1", acc.otherStats.deposit > 0 ? "text-emerald-400 font-bold" : "text-slate-600")}
                                                onClick={() => handleDrillDown(`Okopplade Insättningar (${acc.name})`, acc.otherStats.rawDeposits)}
                                            >
                                                {formatMoney(acc.otherStats.deposit)}
                                            </div>
                                            <div 
                                                className={cn("text-right font-mono cursor-pointer hover:bg-orange-500/20 rounded px-1", acc.otherStats.withdrawal > 0 ? "text-orange-300" : "text-slate-600")}
                                                onClick={() => handleDrillDown(`Okopplade Uttag (${acc.name})`, acc.otherStats.rawWithdrawals)}
                                            >
                                                {formatMoney(acc.otherStats.withdrawal)}
                                            </div>
                                            <div 
                                                className={cn("text-right font-mono cursor-pointer hover:bg-rose-500/20 rounded px-1", acc.otherStats.expense > 0 ? "text-rose-400" : "text-slate-600")}
                                                onClick={() => handleDrillDown(`Okopplade Utgifter (${acc.name})`, acc.otherStats.rawExpenses)}
                                            >
                                                {formatMoney(acc.otherStats.expense)}
                                            </div>
                                        </div>
                                    </div>

                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* DRILL DOWN MODAL */}
            <Modal isOpen={!!drillDownData} onClose={() => setDrillDownData(null)} title={drillDownData?.title || 'Transaktioner'}>
                <div className="space-y-2">
                    {drillDownData?.transactions && drillDownData.transactions.length > 0 ? (
                        drillDownData.transactions.map(t => (
                            <div 
                                key={t.id} 
                                onClick={() => setMappingTx(t)}
                                className="flex justify-between items-center p-3 bg-slate-900/50 border border-slate-800 rounded-lg cursor-pointer hover:bg-slate-800 hover:border-blue-500/50 transition-all group"
                            >
                                <div className="flex-1 mr-4 overflow-hidden">
                                    <div className="text-white font-medium truncate flex items-center gap-2">
                                        {t.description}
                                        <ChevronRight className="w-3 h-3 text-slate-600 group-hover:text-blue-400 transition-colors" />
                                    </div>
                                    <div className="text-xs text-slate-500">{t.date}</div>
                                </div>
                                <div className={cn("font-mono font-bold whitespace-nowrap", t.amount > 0 ? "text-emerald-400" : "text-white")}>
                                    {t.amount > 0 ? '+' : ''}{formatMoney(t.amount)}
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="text-center text-slate-500 py-8 italic">Inga transaktioner hittades för denna period.</div>
                    )}
                </div>
                <div className="mt-4 border-t border-slate-700 pt-4 flex justify-end">
                    <Button variant="secondary" onClick={() => setDrillDownData(null)}>Stäng</Button>
                </div>
            </Modal>

            {/* MAPPING MODAL */}
            <Modal isOpen={!!mappingTx} onClose={() => setMappingTx(null)} title="Koppla till Budgetpost">
                <div className="space-y-4">
                    <div className="bg-slate-800 p-3 rounded-lg text-sm mb-4 border border-slate-700">
                        <div className="text-slate-400 text-xs uppercase mb-1">Transaktion</div>
                        <div className="font-bold text-white">{mappingTx?.description}</div>
                        <div className="font-mono text-white">{formatMoney(mappingTx?.amount || 0)}</div>
                    </div>

                    <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                        <p className="text-xs text-slate-400 uppercase font-bold tracking-wider px-1">Välj Bucket</p>
                        {availableBuckets.map(b => (
                            <button
                                key={b.id}
                                onClick={() => handleMapToBucket(b.id)}
                                className="w-full text-left p-3 rounded-xl bg-slate-700/50 hover:bg-blue-600 hover:text-white transition-all flex items-center gap-3 group"
                            >
                                <div className="p-2 bg-slate-800 rounded-lg text-slate-400 group-hover:bg-white/20 group-hover:text-white">
                                    <Wallet size={16} />
                                </div>
                                <div className="flex-1">
                                    <div className="font-bold text-sm">{b.name}</div>
                                    <div className="text-xs opacity-70 group-hover:text-blue-100">
                                        {b.type === 'FIXED' ? 'Fast' : (b.type === 'DAILY' ? 'Rörlig' : 'Mål')}
                                    </div>
                                </div>
                                <ArrowRight size={16} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                            </button>
                        ))}
                        {availableBuckets.length === 0 && (
                            <div className="text-center text-slate-500 py-4 italic">Inga budgetposter hittades för detta konto.</div>
                        )}
                    </div>
                </div>
            </Modal>
        </div>
    );
};

// --- SUB-COMPONENT: INSIGHTS & DNA (The New Magic) ---
const InsightsAnalysis = () => {
    const { transactions, buckets, settings, mainCategories, users, selectedMonth, subCategories, budgetGroups } = useApp();
    const [insightTimeframe, setInsightTimeframe] = useState<1 | 3 | 6 | 9 | 12>(1);

    const analysisData = useMemo(() => {
        // 1. Prepare Data Scope (Current Period)
        const currentEndDate = getBudgetInterval(selectedMonth, settings.payday).end;
        
        // Use proper Payday Logic for Start Date as well (Not just Calendar Month)
        // If selected is July (June 25 - July 24), and timeframe is 1, we want Start to be June 25.
        // We find the 'month key' for the start (e.g. 2023-07 minus 0 months) and ask for its interval start.
        const startMonthDate = subMonths(parseISO(`${selectedMonth}-01`), insightTimeframe - 1);
        const startMonthKey = format(startMonthDate, 'yyyy-MM');
        const startDateObj = getBudgetInterval(startMonthKey, settings.payday).start;

        const startStr = format(startDateObj, 'yyyy-MM-dd');
        const endStr = format(currentEndDate, 'yyyy-MM-dd');

        // Relevant Transactions (Strictly Expenses)
        const allTxs = transactions.filter(t => t.date >= startStr && t.date <= endStr);
        const expenseTxs = allTxs.filter(t => t.type === 'EXPENSE' || (!t.type && t.amount < 0));
        
        // Income for context
        const income = getTotalFamilyIncome(users, selectedMonth); 

        // --- HELPER: Clean Merchant Name ---
        const cleanName = (desc: string) => {
            let name = desc.trim();
            const parts = name.split(' ');
            if (parts.length > 1) name = `${parts[0]} ${parts[1]}`;
            else name = parts[0];
            return name.replace(/AB|SE|Kortköp|Reserverat/gi, '').trim();
        };

        // 2. MONEY MAGNETS (Top Spenders by Volume)
        const merchantMap = new Map<string, number>();
        const merchantCountMap = new Map<string, number>();

        expenseTxs.forEach(t => {
            if (t.bucketId && !t.categoryMainId) return; // Skip pure transfers if not categorized
            const name = cleanName(t.description);
            merchantMap.set(name, (merchantMap.get(name) || 0) + Math.abs(t.amount));
            merchantCountMap.set(name, (merchantCountMap.get(name) || 0) + 1);
        });

        const topMerchants = Array.from(merchantMap.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([name, amount], index) => ({ 
                rank: index + 1, 
                name, 
                amount: Math.round(amount / insightTimeframe),
                count: merchantCountMap.get(name) || 0 
            }));

        // 3. FREQUENT SPENDERS (Creatures of Habit) - Top by Count
        const frequentSpenders = Array.from(merchantCountMap.entries())
            .sort((a, b) => b[1] - a[1]) // Sort by count descending
            .slice(0, 10)
            .map(([name, count], index) => ({
                rank: index + 1,
                name,
                count: Math.round(count / insightTimeframe * 10) / 10, // Avg per month
                totalAmount: Math.round((merchantMap.get(name) || 0) / insightTimeframe)
            }));

        // 4. SMALL EXPENSES (The Latte Factor) - Items < 200 SEK
        const smallTxMap = new Map<string, { total: number, count: number }>();
        expenseTxs.filter(t => Math.abs(t.amount) < 200).forEach(t => {
            const name = cleanName(t.description);
            const current = smallTxMap.get(name) || { total: 0, count: 0 };
            smallTxMap.set(name, { total: current.total + Math.abs(t.amount), count: current.count + 1 });
        });

        const topSmallSpends = Array.from(smallTxMap.entries())
            .sort((a, b) => b[1].total - a[1].total) // Sort by total VOLUME of small spends
            .slice(0, 10)
            .map(([name, data], index) => ({
                rank: index + 1, 
                name,
                amount: Math.round(data.total / insightTimeframe), // Monthly avg
                count: Math.round(data.count / insightTimeframe * 10) / 10
            }));

        const totalSmallSpendMonthly = topSmallSpends.reduce((sum, item) => sum + item.amount, 0);

        // 5. TREND BREAKERS (Anomaly Detection)
        // Compare current period vs previous period of same length
        // Must use same Payday logic for historical range
        const prevEndMonthDate = subMonths(parseISO(`${selectedMonth}-01`), insightTimeframe);
        const prevEndMonthKey = format(prevEndMonthDate, 'yyyy-MM');
        const prevEndDateObj = getBudgetInterval(prevEndMonthKey, settings.payday).end;
        
        const prevStartMonthDate = subMonths(prevEndMonthDate, insightTimeframe - 1);
        const prevStartMonthKey = format(prevStartMonthDate, 'yyyy-MM');
        const prevStartDateObj = getBudgetInterval(prevStartMonthKey, settings.payday).start;

        const prevStartStr = format(prevStartDateObj, 'yyyy-MM-dd');
        const prevEndStr = format(prevEndDateObj, 'yyyy-MM-dd');

        const prevTxs = transactions.filter(t => 
            t.date >= prevStartStr && 
            t.date <= prevEndStr && 
            (t.type === 'EXPENSE' || (!t.type && t.amount < 0))
        );

        // Calculate totals per Main Category
        const currCatTotals = new Map<string, number>();
        const prevCatTotals = new Map<string, number>();

        expenseTxs.forEach(t => {
            if (t.categoryMainId) {
                currCatTotals.set(t.categoryMainId, (currCatTotals.get(t.categoryMainId) || 0) + Math.abs(t.amount));
            }
        });
        prevTxs.forEach(t => {
            if (t.categoryMainId) {
                prevCatTotals.set(t.categoryMainId, (prevCatTotals.get(t.categoryMainId) || 0) + Math.abs(t.amount));
            }
        });

        const trendBreakers = mainCategories.map(cat => {
            const curr = (currCatTotals.get(cat.id) || 0) / insightTimeframe;
            const prev = (prevCatTotals.get(cat.id) || 0) / insightTimeframe;
            const diff = curr - prev;
            const percent = prev > 0 ? (diff / prev) * 100 : (curr > 0 ? 100 : 0);
            return { name: cat.name, curr, prev, diff, percent };
        })
        .filter(t => Math.abs(t.diff) > 500) // Filter out insignificant changes (< 500 kr)
        .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)) // Sort by magnitude of change
        .slice(0, 5);

        // 6. Day of Week Rhythm
        const dayCounts = [0,0,0,0,0,0,0];
        const daySums = [0,0,0,0,0,0,0];
        const daysInInterval = eachDayOfInterval({ start: startDateObj, end: currentEndDate });
        daysInInterval.forEach(d => dayCounts[getDay(d)]++);
        expenseTxs.forEach(t => {
            const day = getDay(parseISO(t.date));
            daySums[day] += Math.abs(t.amount);
        });
        const days = ['Sön', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör'];
        const rhythmData = days.map((day, i) => ({ 
            day, 
            amount: dayCounts[i] > 0 ? Math.round(daySums[i] / dayCounts[i]) : 0 
        }));
        const maxDayVal = Math.max(...rhythmData.map(r => r.amount));
        const peakDay = rhythmData.find(r => r.amount === maxDayVal);

        // 7. DNA Radar
        let totalSavings = 0; let totalFun = 0; let totalSecurity = 0; let totalFood = 0; let totalConsumption = 0;
        expenseTxs.forEach(t => {
            const amt = Math.abs(t.amount);
            totalConsumption += amt;
            const cid = t.categoryMainId;
            if (cid === '1' || cid === '3' || cid === '6') totalSecurity += amt; 
            if (cid === '4' || cid === '5' || cid === '202') totalFun += amt; 
            if (cid === '2' && t.categorySubId !== '202') totalFood += amt; 
        });
        const savingTxs = allTxs.filter(t => t.type === 'TRANSFER' && t.bucketId);
        savingTxs.forEach(t => {
            const b = buckets.find(bk => bk.id === t.bucketId);
            if (b && b.isSavings) totalSavings += Math.abs(t.amount);
        });
        totalSavings /= insightTimeframe;
        totalFun /= insightTimeframe;
        totalSecurity /= insightTimeframe;
        totalFood /= insightTimeframe;
        totalConsumption /= insightTimeframe;

        const scoreSavings = Math.min(100, (totalSavings / (income || 1)) * 500); 
        const scoreFun = Math.min(100, (totalFun / (income || 1)) * 500);
        const scoreSecurity = Math.min(100, (totalSecurity / (income || 1)) * 200);
        const scoreFood = Math.min(100, (totalFood / (income || 1)) * 666);
        const scoreSpender = Math.min(100, (totalConsumption / (income || 1)) * 110);

        const radarData = [
            { subject: 'Spararen', A: scoreSavings, fullMark: 100 },
            { subject: 'Livsnjutaren', A: scoreFun, fullMark: 100 },
            { subject: 'Tryggheten', A: scoreSecurity, fullMark: 100 },
            { subject: 'Matvraket', A: scoreFood, fullMark: 100 },
            { subject: 'Slösaren', A: scoreSpender, fullMark: 100 },
        ];

        // 8. Savings Opportunity logic
        const opportunityMap = new Map<string, number>();
        expenseTxs.forEach(t => {
            if (t.categoryMainId === '4' || t.categoryMainId === '5' || t.categoryMainId === '202') { 
                if (t.categorySubId) {
                    const sub = subCategories.find(s => s.id === t.categorySubId);
                    if (sub) opportunityMap.set(sub.name, (opportunityMap.get(sub.name) || 0) + Math.abs(t.amount));
                }
            }
        });
        const topOpportunity = Array.from(opportunityMap.entries()).sort((a,b) => b[1] - a[1])[0];
        
        const weekendSpend = daySums[0] + daySums[5] + daySums[6];
        const weekdaySpend = daySums[1] + daySums[2] + daySums[3] + daySums[4];
        const weekendRatio = (weekendSpend / (weekendSpend + weekdaySpend)) * 100;
        
        const smallTranscations = expenseTxs.filter(t => Math.abs(t.amount) < 200);
        const smallTotal = smallTranscations.reduce((sum, t) => sum + Math.abs(t.amount), 0);
        const smallMonthly = smallTotal / insightTimeframe;

        // --- NEW INSIGHTS CALCULATION ---

        // 9. Mat-kvoten (Food Ratio)
        // Cat 201 = Matvarubutik (Grocery), Cat 202 = Restaurang (Restaurant)
        const grocerySpend = expenseTxs.filter(t => t.categorySubId === '201').reduce((sum, t) => sum + Math.abs(t.amount), 0);
        const restaurantSpend = expenseTxs.filter(t => t.categorySubId === '202').reduce((sum, t) => sum + Math.abs(t.amount), 0);
        const foodRatio = grocerySpend > 0 ? Math.round((restaurantSpend / grocerySpend) * 100) : 0;

        // 10. Inflation Check (Avg Receipt Size)
        // Find most frequent grocery merchant
        const groceryTxs = expenseTxs.filter(t => t.categorySubId === '201');
        const groceryMerchantCounts = new Map<string, number>();
        groceryTxs.forEach(t => {
            const name = cleanName(t.description);
            groceryMerchantCounts.set(name, (groceryMerchantCounts.get(name) || 0) + 1);
        });
        const topGroceryMerchant = Array.from(groceryMerchantCounts.entries()).sort((a,b) => b[1] - a[1])[0];
        let inflationData = null;
        
        if (topGroceryMerchant) {
            const merchantName = topGroceryMerchant[0];
            const currentMerchantTxs = groceryTxs.filter(t => cleanName(t.description) === merchantName);
            const avgCurrent = currentMerchantTxs.length > 0 ? currentMerchantTxs.reduce((sum, t) => sum + Math.abs(t.amount), 0) / currentMerchantTxs.length : 0;
            
            // Previous Period
            const prevMerchantTxs = prevTxs.filter(t => t.categorySubId === '201' && cleanName(t.description) === merchantName);
            const avgPrev = prevMerchantTxs.length > 0 ? prevMerchantTxs.reduce((sum, t) => sum + Math.abs(t.amount), 0) / prevMerchantTxs.length : 0;
            
            if (avgPrev > 0) {
                inflationData = { store: merchantName, current: avgCurrent, prev: avgPrev, diff: avgCurrent - avgPrev };
            }
        }

        // 11. Duplicates
        const duplicateCandidates: Transaction[] = [];
        const seenTx = new Set<string>();
        expenseTxs.forEach(t => {
            const key = `${t.date}-${Math.abs(t.amount)}-${t.description.trim()}`;
            if (seenTx.has(key)) {
                duplicateCandidates.push(t);
            }
            seenTx.add(key);
        });

        // 12. Impulse Radar
        // Big single purchase in 'Shopping' (5) or 'Nöje' (4)
        const impulseTxs = expenseTxs.filter(t => t.categoryMainId === '4' || t.categoryMainId === '5');
        let impulseAlert = null;
        if (impulseTxs.length > 0) {
            const totalImpulse = impulseTxs.reduce((sum, t) => sum + Math.abs(t.amount), 0);
            const avgImpulse = totalImpulse / impulseTxs.length;
            const outlier = impulseTxs.find(t => Math.abs(t.amount) > (avgImpulse * 3) && Math.abs(t.amount) > 1000); // 3x avg AND > 1000kr
            if (outlier) {
                impulseAlert = { item: outlier.description, amount: Math.abs(outlier.amount), avg: avgImpulse };
            }
        }

        // 13. Dream Accelerator
        // If we cut 'Small Spends' by 50%, when do we reach the nearest goal?
        let dreamAccelData = null;
        const potentialSaving = smallMonthly * 0.5;
        const activeGoals = buckets.filter(b => b.type === 'GOAL' && !b.archivedDate && b.targetAmount > 0 && b.targetDate);
        if (activeGoals.length > 0 && potentialSaving > 0) {
            // Find closest goal
            const closestGoal = activeGoals.sort((a,b) => (a.targetDate || '') > (b.targetDate || '') ? 1 : -1)[0];
            const goalSaved = calculateSavedAmount(closestGoal, selectedMonth);
            const goalRemaining = Math.max(0, closestGoal.targetAmount - goalSaved);
            const currentRate = calculateGoalBucketCost(closestGoal, selectedMonth);
            const monthsNormal = currentRate > 0 ? goalRemaining / currentRate : 999;
            const monthsAccelerated = (currentRate + potentialSaving) > 0 ? goalRemaining / (currentRate + potentialSaving) : 999;
            const savedMonths = Math.max(0, Math.round(monthsNormal - monthsAccelerated));
            
            if (savedMonths >= 1) {
                dreamAccelData = { goalName: closestGoal.name, monthsSaved: savedMonths, extra: potentialSaving };
            }
        }

        // 14. Seasonal Shock
        // Compare NEXT month (e.g. Dec) last year vs avg monthly spend last year
        let seasonalWarning = null;
        const nextMonthDate = addMonths(parseISO(`${selectedMonth}-01`), 1);
        const nextMonthKey = format(nextMonthDate, 'MM'); // '12' for Dec
        
        // Find last year's next month transactions (Using Payday Logic)
        const lastYearNextMonth = subYears(nextMonthDate, 1);
        const lastYearNextMonthKey = format(lastYearNextMonth, 'yyyy-MM');
        const { start: lastYearStart, end: lastYearEnd } = getBudgetInterval(lastYearNextMonthKey, settings.payday);
        
        const lastYearStartStr = format(lastYearStart, 'yyyy-MM-dd');
        const lastYearEndStr = format(lastYearEnd, 'yyyy-MM-dd');
        
        const lastYearTxs = transactions.filter(t => t.date >= lastYearStartStr && t.date <= lastYearEndStr && (t.type === 'EXPENSE' || (!t.type && t.amount < 0)));
        const lastYearNextMonthSpend = lastYearTxs.reduce((sum, t) => sum + Math.abs(t.amount), 0);
        
        // Approx monthly average (using current insightTimeframe as proxy for "normal")
        const currentAvgSpend = expenseTxs.reduce((sum, t) => sum + Math.abs(t.amount), 0) / insightTimeframe;
        
        if (lastYearNextMonthSpend > (currentAvgSpend * 1.25)) { // 25% higher
            const diffPercent = Math.round(((lastYearNextMonthSpend - currentAvgSpend) / currentAvgSpend) * 100);
            seasonalWarning = { month: format(nextMonthDate, 'MMMM', {locale: sv}), percent: diffPercent };
        }

        // 15. Lifestyle Creep
        // Fixed costs (Housing + Fixed Buckets) vs Income 
        // Compare Current Month vs Same Month Last Year
        const calculateFixedCosts = (month: string) => {
            const range = getBudgetInterval(month, settings.payday);
            const sStr = format(range.start, 'yyyy-MM-dd');
            const eStr = format(range.end, 'yyyy-MM-dd');
            
            // Housing (Cat 1) Expenses
            const housingCost = transactions
                .filter(t => t.date >= sStr && t.date <= eStr && t.categoryMainId === '1' && (t.type === 'EXPENSE' || t.amount < 0))
                .reduce((sum, t) => sum + Math.abs(t.amount), 0);
            
            // Fixed Buckets (Budgeted)
            const fixedBucketsCost = buckets
                .filter(b => b.type === 'FIXED')
                .reduce((sum, b) => sum + calculateFixedBucketCost(b, month), 0);
                
            return housingCost + fixedBucketsCost;
        };

        const currentFixed = calculateFixedCosts(selectedMonth);
        const lastYearSameMonth = format(subYears(parseISO(`${selectedMonth}-01`), 1), 'yyyy-MM');
        const prevFixed = calculateFixedCosts(lastYearSameMonth);
        
        let lifestyleCreep = null;
        if (prevFixed > 0 && currentFixed > prevFixed) {
            const diffPercent = Math.round(((currentFixed - prevFixed) / prevFixed) * 100);
            if (diffPercent > 5) {
                // Check income change
                const currentIncome = getTotalFamilyIncome(users, selectedMonth);
                const prevIncome = getTotalFamilyIncome(users, lastYearSameMonth);
                const incomeChange = prevIncome > 0 ? Math.round(((currentIncome - prevIncome) / prevIncome) * 100) : 0;
                
                lifestyleCreep = { fixedIncrease: diffPercent, incomeChange };
            }
        }

        return { 
            radarData, topMerchants, rhythmData, peakDay, income, 
            topOpportunity: topOpportunity ? { name: topOpportunity[0], amount: Math.round(topOpportunity[1] / insightTimeframe) } : null,
            weekendRatio,
            smallMonthly,
            topSmallSpends,
            totalSmallSpendMonthly,
            trendBreakers,
            frequentSpenders,
            foodRatio,
            inflationData,
            duplicateCandidates,
            impulseAlert,
            dreamAccelData,
            seasonalWarning,
            lifestyleCreep
        };
    }, [transactions, users, selectedMonth, buckets, settings.payday, mainCategories, subCategories, insightTimeframe, budgetGroups]);

    const { 
        radarData, topMerchants, rhythmData, peakDay, topOpportunity, weekendRatio, 
        smallMonthly, topSmallSpends, totalSmallSpendMonthly, trendBreakers, frequentSpenders,
        foodRatio, inflationData, duplicateCandidates, impulseAlert, dreamAccelData, seasonalWarning, lifestyleCreep
    } = analysisData;

    return (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 fade-in duration-700 pb-10">
            
            {/* TIMEFRAME SELECTOR */}
            <div className="flex bg-slate-800 p-1 rounded-xl overflow-x-auto no-scrollbar gap-1 border border-slate-700">
                {[1, 3, 6, 9, 12].map(m => (
                    <button 
                        key={m}
                        onClick={() => setInsightTimeframe(m as any)}
                        className={cn(
                            "flex-1 px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all",
                            insightTimeframe === m ? "bg-pink-600 text-white shadow-lg" : "text-slate-400 hover:text-white hover:bg-slate-700"
                        )}
                    >
                        {m === 1 ? 'Senaste mån' : `${m} mån snitt`}
                    </button>
                ))}
            </div>

            {/* HERO SECTION: DNA (Mobile Optimized) */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-1 rounded-3xl shadow-2xl border border-slate-700/50 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5 pointer-events-none"></div>
                <div className="p-6 relative z-10 flex flex-col md:flex-row items-center gap-6">
                    <div className="flex-1 text-center md:text-left w-full">
                        <div className="inline-flex items-center gap-2 bg-indigo-500/20 text-indigo-300 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-3">
                            <Sparkles size={12} /> Ekonomiskt DNA
                        </div>
                        <h2 className="text-2xl md:text-3xl font-bold text-white mb-2 leading-tight">Er profil</h2>
                        <p className="text-slate-400 text-xs md:text-sm mb-4">
                            Baserat på era utgifter de senaste {insightTimeframe} månaderna. Är ni sparare eller livsnjutare?
                        </p>
                        
                        <div className="grid grid-cols-2 gap-2 text-left w-full">
                            <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-700/50">
                                <div className="text-[10px] text-slate-500 uppercase font-bold">Dominant Drag</div>
                                <div className="text-emerald-400 font-bold text-sm truncate">
                                    {radarData.reduce((prev, current) => (prev.A > current.A) ? prev : current).subject}
                                </div>
                            </div>
                            <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-700/50">
                                <div className="text-[10px] text-slate-500 uppercase font-bold">Farligaste Dag</div>
                                <div className="text-rose-400 font-bold text-sm">{peakDay?.day || '-'}</div>
                            </div>
                        </div>
                    </div>

                    <div className="w-full h-64 md:w-64 relative shrink-0">
                        <ResponsiveContainer width="100%" height="100%">
                            <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
                                <PolarGrid stroke="#334155" />
                                <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 'bold' }} />
                                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                                <Radar name="DNA" dataKey="A" stroke="#8b5cf6" strokeWidth={3} fill="#8b5cf6" fillOpacity={0.4} />
                            </RadarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* NEW SECTION: FINANCIAL X-RAY */}
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 px-1">
                <Search className="w-4 h-4 text-cyan-400" /> Finansiell Röntgen
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* 1. MAT-KVOTEN */}
                <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700 shadow-lg flex flex-col justify-between">
                    <div className="flex items-start justify-between mb-2">
                        <div>
                            <div className="text-xs text-slate-400 font-bold uppercase mb-1">Mat-kvoten (Ute vs Hemma)</div>
                            <div className={cn("text-white font-bold text-lg", foodRatio > 40 ? "text-rose-400" : "text-emerald-400")}>
                                {foodRatio} kr ute <span className="text-sm font-normal text-slate-400">/ 100 kr hemma</span>
                            </div>
                        </div>
                        <div className="bg-cyan-500/20 p-2 rounded-lg text-cyan-400"><Utensils size={18} /></div>
                    </div>
                    <div className="text-sm text-slate-300">
                        För varje 100-lapp ni handlar mat för, lägger ni {foodRatio} kr på restaurang. 
                        {foodRatio > 35 ? " Det är högt över snittet (ca 25kr)." : " Det är en sund nivå!"}
                    </div>
                </div>

                {/* 2. INFLATIONS-KOLLEN */}
                {inflationData && (
                    <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700 shadow-lg flex flex-col justify-between">
                        <div className="flex items-start justify-between mb-2">
                            <div>
                                <div className="text-xs text-slate-400 font-bold uppercase mb-1">Inflations-kollen</div>
                                <div className="text-white font-bold text-lg">{formatMoney(inflationData.current)} <span className="text-sm font-normal text-slate-400">snittkvitto</span></div>
                            </div>
                            <div className="bg-orange-500/20 p-2 rounded-lg text-orange-400"><TrendingUp size={18} /></div>
                        </div>
                        <div className="text-sm text-slate-300">
                            Ert snittköp på <span className="font-bold text-white">{inflationData.store}</span> har {inflationData.diff > 0 ? "ökat" : "minskat"} med 
                            <span className={cn("font-bold font-mono ml-1", inflationData.diff > 0 ? "text-rose-400" : "text-emerald-400")}>
                                {formatMoney(Math.abs(inflationData.diff))}
                            </span> sen förra perioden.
                        </div>
                    </div>
                )}

                {/* 3. SEASONAL SHOCK */}
                {seasonalWarning && (
                    <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700 shadow-lg flex flex-col justify-between">
                        <div className="flex items-start justify-between mb-2">
                            <div>
                                <div className="text-xs text-slate-400 font-bold uppercase mb-1">Säsongs-chocken</div>
                                <div className="text-rose-400 font-bold text-lg">Se upp för {seasonalWarning.month}!</div>
                            </div>
                            <div className="bg-blue-500/20 p-2 rounded-lg text-blue-400"><ThermometerSnowflake size={18} /></div>
                        </div>
                        <div className="text-sm text-slate-300">
                            Historiskt sett spenderar ni <span className="font-bold text-rose-400">{seasonalWarning.percent}% mer</span> nästa månad än snittet. Har ni buffert redo?
                        </div>
                    </div>
                )}

                {/* 4. DREAM ACCELERATOR */}
                {dreamAccelData && (
                    <div className="bg-gradient-to-br from-purple-900/40 to-slate-800 p-4 rounded-2xl border border-purple-500/30 shadow-lg flex flex-col justify-between">
                        <div className="flex items-start justify-between mb-2">
                            <div>
                                <div className="text-xs text-purple-300 font-bold uppercase mb-1">Dröm-acceleratorn</div>
                                <div className="text-white font-bold text-lg">Nå {dreamAccelData.goalName} snabbare</div>
                            </div>
                            <div className="bg-purple-500/20 p-2 rounded-lg text-purple-400"><Rocket size={18} /></div>
                        </div>
                        <div className="text-sm text-slate-300">
                            Om ni halverar småutgifterna ({formatMoney(dreamAccelData.extra)}/mån) når ni målet <span className="font-bold text-emerald-400">{dreamAccelData.monthsSaved} månader tidigare!</span>
                        </div>
                    </div>
                )}

                {/* 5. LIFESTYLE CREEP */}
                {lifestyleCreep && (
                    <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700 shadow-lg flex flex-col justify-between">
                        <div className="flex items-start justify-between mb-2">
                            <div>
                                <div className="text-xs text-slate-400 font-bold uppercase mb-1">Livskostnads-trenden</div>
                                <div className="text-white font-bold text-lg">Fasta kostnader <span className="text-rose-400">+{lifestyleCreep.fixedIncrease}%</span></div>
                            </div>
                            <div className="bg-red-500/20 p-2 rounded-lg text-red-400"><AlertOctagon size={18} /></div>
                        </div>
                        <div className="text-sm text-slate-300">
                            Era fasta kostnader har ökat mer än inkomsterna ({lifestyleCreep.incomeChange > 0 ? `+${lifestyleCreep.incomeChange}%` : 'oförändrad'}) jämfört med förra året. Se över abonnemangen?
                        </div>
                    </div>
                )}

                {/* 6. IMPULSE RADAR */}
                {impulseAlert && (
                    <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700 shadow-lg flex flex-col justify-between">
                        <div className="flex items-start justify-between mb-2">
                            <div>
                                <div className="text-xs text-slate-400 font-bold uppercase mb-1">Impuls-radarn</div>
                                <div className="text-white font-bold text-lg">{impulseAlert.item}</div>
                            </div>
                            <div className="bg-yellow-500/20 p-2 rounded-lg text-yellow-400"><Zap size={18} /></div>
                        </div>
                        <div className="text-sm text-slate-300">
                            Ovanligt stort köp ({formatMoney(impulseAlert.amount)}). Detta avviker kraftigt från er normala nivå på ca {formatMoney(impulseAlert.avg)}/köp i denna kategori.
                        </div>
                    </div>
                )}

                {/* 7. DUPLICATES */}
                {duplicateCandidates.length > 0 && (
                    <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700 shadow-lg flex flex-col justify-between col-span-1 md:col-span-2">
                        <div className="flex items-start justify-between mb-2">
                            <div>
                                <div className="text-xs text-slate-400 font-bold uppercase mb-1">Dubbel-dragningar?</div>
                                <div className="text-rose-400 font-bold text-sm">Hittade {duplicateCandidates.length} möjliga misstag</div>
                            </div>
                            <div className="bg-rose-500/20 p-2 rounded-lg text-rose-400"><AlertTriangle size={18} /></div>
                        </div>
                        <div className="text-xs text-slate-400 space-y-1">
                            {duplicateCandidates.slice(0, 3).map((t, i) => (
                                <div key={i} className="flex justify-between bg-slate-900/50 p-1.5 rounded">
                                    <span>{t.description}</span>
                                    <span className="font-mono text-white">{formatMoney(t.amount)} ({t.date})</span>
                                </div>
                            ))}
                            {duplicateCandidates.length > 3 && <div>...och {duplicateCandidates.length - 3} till.</div>}
                        </div>
                    </div>
                )}
            </div>

            {/* CLASSIC ANALYSIS SECTION */}
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 px-1 mt-6">
                <Zap className="w-4 h-4 text-yellow-400" /> Klassisk Analys
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* SAVINGS OPPORTUNITY */}
                <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700 shadow-lg flex flex-col justify-between">
                    <div className="flex items-start justify-between mb-2">
                        <div>
                            <div className="text-xs text-slate-400 font-bold uppercase mb-1">Största Boven</div>
                            <div className="text-white font-bold text-lg">{topOpportunity ? topOpportunity.name : 'Ingen data'}</div>
                        </div>
                        <div className="bg-rose-500/20 p-2 rounded-lg text-rose-400"><Target size={18} /></div>
                    </div>
                    <div className="text-sm text-slate-300">
                        Ni snittar <span className="text-rose-400 font-mono font-bold">{topOpportunity ? formatMoney(topOpportunity.amount) : 0}</span> / mån här.
                        <div className="text-xs text-slate-500 mt-1">Minska med 20% = spara {topOpportunity ? formatMoney(Math.round(topOpportunity.amount * 0.2)) : 0}/år!</div>
                    </div>
                </div>

                {/* WEEKEND EFFECT */}
                <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700 shadow-lg flex flex-col justify-between">
                    <div className="flex items-start justify-between mb-2">
                        <div>
                            <div className="text-xs text-slate-400 font-bold uppercase mb-1">Helg-effekten</div>
                            <div className="text-white font-bold text-lg">{Math.round(weekendRatio)}% av köpen</div>
                        </div>
                        <div className="bg-blue-500/20 p-2 rounded-lg text-blue-400"><Activity size={18} /></div>
                    </div>
                    <div className="text-sm text-slate-300">
                        Sker fredag-söndag. {weekendRatio > 60 ? "Ni lever för helgen! Dyrt men kul?" : "Jämn fördelning över veckan."}
                    </div>
                </div>

                {/* TREND BREAKERS */}
                <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700 shadow-lg col-span-1 md:col-span-2">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="bg-orange-500/20 p-2 rounded-lg text-orange-400"><TrendingUp size={18} /></div>
                        <div>
                            <h3 className="text-white font-bold text-sm">Trendbrott (Jämfört med f.g. period)</h3>
                            <p className="text-xs text-slate-400">Var har kostnaderna förändrats mest?</p>
                        </div>
                    </div>
                    <div className="space-y-3">
                        {trendBreakers.map((t, i) => (
                            <div key={i} className="flex items-center justify-between bg-slate-900/50 p-2 rounded-lg text-sm">
                                <span className="text-slate-300 font-medium">{t.name}</span>
                                <div className="flex items-center gap-3">
                                    <div className="text-right">
                                        <div className="text-white font-mono font-bold">{formatMoney(t.curr)}</div>
                                        <div className="text-[10px] text-slate-500">Var: {formatMoney(t.prev)}</div>
                                    </div>
                                    <div className={cn("px-2 py-1 rounded text-xs font-bold w-16 text-center flex items-center justify-center gap-1", t.diff > 0 ? "bg-rose-500/20 text-rose-400" : "bg-emerald-500/20 text-emerald-400")}>
                                        {t.diff > 0 ? <ArrowUpRight size={12}/> : <ArrowDownRight size={12}/>}
                                        {Math.round(Math.abs(t.percent))}%
                                    </div>
                                </div>
                            </div>
                        ))}
                        {trendBreakers.length === 0 && <div className="text-center text-slate-500 text-xs italic">Inga stora förändringar noterade.</div>}
                    </div>
                </div>
            </div>

            {/* SMALL SPENDS (THE LATTE FACTOR) */}
            <div className="bg-slate-800/80 backdrop-blur-md rounded-2xl border border-slate-700 shadow-lg overflow-hidden">
                <div className="p-5 border-b border-slate-700/50 flex items-center gap-3">
                    <div className="p-2 bg-amber-500/20 rounded-lg text-amber-400">
                        <Coffee size={20} />
                    </div>
                    <div>
                        <h3 className="font-bold text-white">Småutgifter ("Lattefaktorn")</h3>
                        <p className="text-xs text-slate-400">Transaktioner under 200 kr som summerar till mest.</p>
                    </div>
                </div>
                <div className="p-4 bg-amber-900/10 border-b border-slate-700/50 flex justify-between items-center">
                    <span className="text-xs text-amber-200 font-bold uppercase tracking-wider">Total småshopping</span>
                    <span className="text-xl font-mono font-bold text-white">{formatMoney(totalSmallSpendMonthly)} <span className="text-xs text-slate-400 font-sans font-normal">/ mån</span></span>
                </div>
                <div className="p-2">
                    {topSmallSpends.map((m, i) => (
                        <div key={i} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-700/30 transition-colors">
                            <div className="text-slate-500 text-xs font-bold w-6">{i + 1}.</div>
                            <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="font-medium text-white truncate pr-2">{m.name}</span>
                                    <div className="text-right">
                                        <span className="font-mono font-bold text-slate-200">{formatMoney(m.amount)}</span>
                                        <div className="text-[10px] text-slate-500">{m.count} st/mån</div>
                                    </div>
                                </div>
                                <div className="w-full bg-slate-700/50 h-1 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full rounded-full bg-amber-500"
                                        style={{ width: `${Math.min(100, (m.amount / (topSmallSpends[0]?.amount || 1)) * 100)}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    ))}
                    {topSmallSpends.length === 0 && <div className="p-6 text-center text-slate-500 italic">Inga småutgifter hittades.</div>}
                </div>
            </div>

            {/* DUAL LISTS: MONEY MAGNETS & CREATURES OF HABIT */}
            <div className="grid md:grid-cols-2 gap-4">
                {/* MONEY MAGNETS (Volume) */}
                <div className="bg-slate-800/80 backdrop-blur-md rounded-2xl border border-slate-700 shadow-lg overflow-hidden">
                    <div className="p-5 border-b border-slate-700/50 flex items-center gap-3">
                        <div className="p-2 bg-blue-500/20 rounded-lg text-blue-400">
                            <Trophy size={20} />
                        </div>
                        <div>
                            <h3 className="font-bold text-white">Pengamagneterna</h3>
                            <p className="text-xs text-slate-400">Störst totalbelopp (Top 10)</p>
                        </div>
                    </div>
                    
                    <div className="p-2">
                        {topMerchants.map((m, i) => (
                            <div key={i} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-700/30 transition-colors">
                                <div className={cn(
                                    "w-6 h-6 flex items-center justify-center rounded-full font-bold text-xs shrink-0",
                                    i === 0 ? "bg-amber-500 text-slate-900" : "bg-slate-700 text-slate-400"
                                )}>
                                    {m.rank}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="font-medium text-white truncate pr-2 text-sm">{m.name}</span>
                                        <span className="font-mono font-bold text-slate-200 text-sm">{formatMoney(m.amount)}</span>
                                    </div>
                                    <div className="w-full bg-slate-700/50 h-1.5 rounded-full overflow-hidden">
                                        <div 
                                            className="h-full rounded-full bg-blue-500"
                                            style={{ width: `${Math.min(100, (m.amount / (topMerchants[0]?.amount || 1)) * 100)}%` }}
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* CREATURES OF HABIT (Frequency) */}
                <div className="bg-slate-800/80 backdrop-blur-md rounded-2xl border border-slate-700 shadow-lg overflow-hidden">
                    <div className="p-5 border-b border-slate-700/50 flex items-center gap-3">
                        <div className="p-2 bg-purple-500/20 rounded-lg text-purple-400">
                            <Repeat size={20} />
                        </div>
                        <div>
                            <h3 className="font-bold text-white">Vanedjuret (Frekvens)</h3>
                            <p className="text-xs text-slate-400">Oftast förekommande (Antal)</p>
                        </div>
                    </div>
                    
                    <div className="p-2">
                        {frequentSpenders.map((m, i) => (
                            <div key={i} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-700/30 transition-colors">
                                <div className={cn(
                                    "w-6 h-6 flex items-center justify-center rounded-full font-bold text-xs shrink-0",
                                    i === 0 ? "bg-purple-500 text-white" : "bg-slate-700 text-slate-400"
                                )}>
                                    {m.rank}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="font-medium text-white truncate pr-2 text-sm">{m.name}</span>
                                        <div className="text-right">
                                            <span className="font-bold text-purple-300 text-sm">{m.count} ggr</span>
                                            <span className="text-[10px] text-slate-500 block">Tot: {formatMoney(m.totalAmount)}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* DAY OF WEEK RHYTHM */}
            <div className="bg-slate-800/80 backdrop-blur-md p-5 rounded-2xl border border-slate-700 shadow-lg">
                <div className="flex items-center gap-2 mb-4">
                    <div className="p-2 bg-blue-500/20 rounded-lg text-blue-400">
                        <Calendar size={20} />
                    </div>
                    <div>
                        <h3 className="font-bold text-white">Spenderytmen</h3>
                        <p className="text-xs text-slate-400">Snittkostnad per veckodag</p>
                    </div>
                </div>

                <div className="h-48 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={rhythmData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                            <XAxis dataKey="day" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                            <Tooltip 
                                cursor={{fill: '#334155', opacity: 0.2}}
                                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px', color: '#fff' }}
                                formatter={(value: number) => formatMoney(value)}
                            />
                            <Bar dataKey="amount" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                                {rhythmData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.day === peakDay?.day ? '#f43f5e' : '#3b82f6'} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                {peakDay && (
                    <div className="text-center text-xs text-slate-400 mt-2">
                        Dyrast dag är <span className="text-rose-400 font-bold">{peakDay.day}</span> (snitt {formatMoney(peakDay.amount)})
                    </div>
                )}
            </div>
        </div>
    );
};

// --- SUB-COMPONENT: TRENDS ANALYSIS ---
const TrendsAnalysis = () => {
    const { transactions, buckets, settings } = useApp(); 
    const [trendMonths, setTrendMonths] = useState<6 | 12>(6);

    const trendData = useMemo(() => {
        const result = [];
        const today = new Date();
        const payday = settings.payday;

        for (let i = trendMonths - 1; i >= 0; i--) {
            const date = subMonths(today, i);
            const monthKey = format(date, 'yyyy-MM');
            const { start, end } = getBudgetInterval(monthKey, payday);
            const startStr = format(start, 'yyyy-MM-dd');
            const endStr = format(end, 'yyyy-MM-dd');

            const monthTxs = transactions.filter(t => 
                t.date >= startStr && 
                t.date <= endStr &&
                (t.type === 'EXPENSE' || (!t.type && t.amount < 0))
            );

            const totalSpent = monthTxs.reduce((sum, t) => sum + Math.abs(t.amount), 0);
            
            let fixed = 0;
            let variable = 0;

            monthTxs.forEach(t => {
                const amt = Math.abs(t.amount);
                if (t.bucketId) {
                    const b = buckets.find(bk => bk.id === t.bucketId);
                    if (b) {
                        if (b.type === 'FIXED') fixed += amt;
                        else variable += amt;
                        return;
                    }
                }
                
                if (t.categoryMainId === '1') fixed += amt; // Boende
                else variable += amt;
            });

            result.push({
                month: format(date, 'MMM', { locale: sv }),
                fullMonth: format(date, 'yyyy-MM'),
                total: Math.round(totalSpent),
                fixed: Math.round(fixed),
                variable: Math.round(variable),
            });
        }
        return result;
    }, [transactions, buckets, settings.payday, trendMonths]);

    return (
        <div className="space-y-6 animate-in fade-in">
            <div className="flex justify-end">
                <div className="flex bg-slate-800 p-1 rounded-lg">
                    <button onClick={() => setTrendMonths(6)} className={cn("px-3 py-1.5 text-xs font-bold rounded transition-all", trendMonths === 6 ? "bg-purple-600 text-white" : "text-slate-400 hover:text-white")}>6 Månader</button>
                    <button onClick={() => setTrendMonths(12)} className={cn("px-3 py-1.5 text-xs font-bold rounded transition-all", trendMonths === 12 ? "bg-purple-600 text-white" : "text-slate-400 hover:text-white")}>1 År</button>
                </div>
            </div>

            <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700 h-80">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={trendData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                        <XAxis dataKey="month" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `${(val/1000).toFixed(0)}k`} />
                        <Tooltip 
                            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px', color: '#fff' }}
                            formatter={(value: number) => formatMoney(value)}
                        />
                        <Legend />
                        <Bar dataKey="fixed" name="Fasta Utgifter" stackId="a" fill="#3b82f6" radius={[0, 0, 4, 4]} />
                        <Bar dataKey="variable" name="Rörliga Utgifter" stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} />
                        <Line type="monotone" dataKey="total" name="Totalt" stroke="#f43f5e" strokeWidth={2} dot={{r: 4, fill: "#f43f5e"}} />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {trendData.slice().reverse().map(d => (
                    <div key={d.fullMonth} className="bg-slate-800 p-3 rounded-xl border border-slate-700">
                        <div className="text-xs text-slate-400 font-bold uppercase mb-1 capitalize">{d.month}</div>
                        <div className="text-lg font-mono font-bold text-white">{formatMoney(d.total)}</div>
                        <div className="text-[10px] text-slate-500 mt-1 flex justify-between">
                            <span>Fast: {formatMoney(d.fixed)}</span>
                            <span>Rörlig: {formatMoney(d.variable)}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

// --- MAIN VIEW ---
export const StatsView: React.FC = () => {
  const { selectedMonth } = useApp();
  const [activeTab, setActiveTab] = useState<'snapshot' | 'accounts' | 'trends' | 'insights'>('snapshot');

  return (
    <div className="space-y-6 pb-24 animate-in slide-in-from-right duration-300">
      <header>
          <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-indigo-400">Statistik</h1>
          <p className="text-slate-400">Följ upp din ekonomi och se trender.</p>
      </header>

      {/* TABS */}
      <div className="flex p-1 bg-slate-800 rounded-xl shadow-lg border border-slate-700/50 overflow-x-auto no-scrollbar">
          <button 
            onClick={() => setActiveTab('snapshot')}
            className={cn("flex-1 py-2 px-3 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all whitespace-nowrap", 
                activeTab === 'snapshot' ? "bg-indigo-600 text-white shadow-lg" : "text-slate-400 hover:text-white"
            )}
          >
              <PieIcon size={16} /> Budgetgrupper
          </button>
          <button 
            onClick={() => setActiveTab('accounts')}
            className={cn("flex-1 py-2 px-3 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all whitespace-nowrap", 
                activeTab === 'accounts' ? "bg-cyan-600 text-white shadow-lg" : "text-slate-400 hover:text-white"
            )}
          >
              <Wallet size={16} /> Konton
          </button>
          <button 
            onClick={() => setActiveTab('trends')}
            className={cn("flex-1 py-2 px-3 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all whitespace-nowrap", 
                activeTab === 'trends' ? "bg-purple-600 text-white shadow-lg" : "text-slate-400 hover:text-white"
            )}
          >
              <TrendingUp size={16} /> Trender
          </button>
          <button 
            onClick={() => setActiveTab('insights')}
            className={cn("flex-1 py-2 px-3 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all whitespace-nowrap", 
                activeTab === 'insights' ? "bg-pink-600 text-white shadow-lg" : "text-slate-400 hover:text-white"
            )}
          >
              <Sparkles size={16} /> Insikter
          </button>
      </div>

      {/* CONTENT */}
      {activeTab === 'snapshot' ? (
          <BudgetGroupStats selectedMonth={selectedMonth} />
      ) : activeTab === 'accounts' ? (
          <AccountStats />
      ) : activeTab === 'trends' ? (
          <TrendsAnalysis />
      ) : (
          <InsightsAnalysis />
      )}
    </div>
  );
};