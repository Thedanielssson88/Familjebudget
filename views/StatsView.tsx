

import React, { useMemo, useState } from 'react';
import { useApp } from '../store';
import { formatMoney, getEffectiveBudgetGroupData, getBudgetInterval, calculateFixedBucketCost, calculateDailyBucketCost, calculateGoalBucketCost, getEffectiveBucketData } from '../utils';
import { 
    PieChart, Pie, Cell, Tooltip, ResponsiveContainer, 
    ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Area, Legend
} from 'recharts';
import { ChevronRight, ChevronDown, Edit2, Check, AlertTriangle, TrendingUp, TrendingDown, Calendar, BarChart3, PieChart as PieIcon, Filter, Info, Plane } from 'lucide-react';
import { BudgetProgressBar } from '../components/BudgetProgressBar';
import { cn, Button } from '../components/components';
import { BudgetGroup, Bucket } from '../types';
import { format, subMonths, parseISO, differenceInDays, startOfDay, endOfDay, areIntervalsOverlapping, addDays, isValid, startOfMonth, endOfMonth, addMonths } from 'date-fns';
import { sv } from 'date-fns/locale';

// --- SUB-COMPONENT: MONTHLY SNAPSHOT (Enhanced) ---
const MonthlySnapshot = ({ selectedMonth }: { selectedMonth: string }) => {
    const { budgetGroups, subCategories, transactions, buckets, updateBudgetGroup, settings } = useApp();
    
    const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
    const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
    const [tempLimit, setTempLimit] = useState<string>('');
    
    // Filters
    const [timeframe, setTimeframe] = useState<1 | 3 | 6 | 12>(1);
    const [excludeDreams, setExcludeDreams] = useState(false);

    // --- HELPER: Calculate Budget Limit Logic (Same as OperatingBudgetView) ---
    // Recalculates the dynamic budget limit for a specific group in a specific month
    const calculateGroupLimitForMonth = (group: BudgetGroup, monthKey: string) => {
        const explicitData = group.monthlyData?.[monthKey];
        
        // 1. Explicit Manual Override
        if (explicitData && !explicitData.isExplicitlyDeleted) {
            return explicitData.limit;
        }

        // 2. Auto-Calculated from Linked Buckets
        if (group.linkedBucketIds && group.linkedBucketIds.length > 0) {
            const fundingBuckets = buckets.filter(b => group.linkedBucketIds?.includes(b.id));
            const totalFunding = fundingBuckets.reduce((sum, b) => {
                // Handle Goal Event Distribution logic if needed (simplified here for stats: usually just monthly cost)
                // For Operating Budget accuracy, we should probably check event distribution too, but let's stick to base cost for performance in loop
                if (b.type === 'FIXED') return sum + calculateFixedBucketCost(b, monthKey);
                if (b.type === 'DAILY') return sum + calculateDailyBucketCost(b, monthKey, settings.payday);
                if (b.type === 'GOAL') return sum + calculateGoalBucketCost(b, monthKey);
                return sum;
            }, 0);
            return totalFunding;
        }

        // 3. Inherited Manual Limit
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
        // 1. Determine Date Range based on Timeframe & Payday
        // Logic: If timeframe > 1, we look at COMPLETED months previous to selected month.
        // If selected is July, and timeframe is 3, we look at April, May, June.
        
        let targetEndMonth = selectedMonth; 
        
        if (timeframe > 1) {
            targetEndMonth = format(subMonths(parseISO(`${selectedMonth}-01`), 1), 'yyyy-MM');
        }
        
        const endDateObj = getBudgetInterval(targetEndMonth, settings.payday).end;
        
        // Start date is X months back from the END month
        const monthsBack = timeframe - 1;
        const startMonthKey = format(subMonths(parseISO(`${targetEndMonth}-01`), monthsBack), 'yyyy-MM');
        const startDateObj = getBudgetInterval(startMonthKey, settings.payday).start;

        const startStr = format(startDateObj, 'yyyy-MM-dd');
        const endStr = format(endDateObj, 'yyyy-MM-dd');
        
        // Label for UI
        const rangeLabel = timeframe === 1 
            ? format(parseISO(`${selectedMonth}-01`), 'MMMM yyyy', { locale: sv })
            : `${format(startDateObj, 'MMM', { locale: sv })} - ${format(endDateObj, 'MMM yyyy', { locale: sv })}`;

        // 2. Calculate Scaling Factors (Smart Normalization)
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

        // 3. Filter Transactions
        const relevantTx = transactions.filter(t => {
            if (t.date < startStr || t.date > endStr) return false;
            const isExpense = t.type === 'EXPENSE' || (!t.type && t.amount < 0);
            if (!isExpense) return false;

            // Strict Dream Exclusion: Only if toggle is ON
            if (excludeDreams && t.bucketId) {
                const bucket = buckets.find(b => b.id === t.bucketId);
                if (bucket?.type === 'GOAL') return false;
            }

            return true;
        });

        // 4. Aggregate by Group
        const groupStats = budgetGroups.map(group => {
            const assignedSubs = subCategories.filter(s => s.budgetGroupId === group.id);
            const assignedSubIds = new Set(assignedSubs.map(s => s.id));
            
            const groupTxs = relevantTx.filter(t => {
                // If "Include Dreams" is ON (excludeDreams is OFF), we allow dream transactions
                // to fall into their categories.
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
            
            // Sum and Normalize
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
            
            // Breakdown
            const breakdown = assignedSubs.map(sub => {
                let subSpent = 0;
                groupTxs.filter(t => t.categorySubId === sub.id).forEach(t => {
                    const amount = Math.abs(t.amount);
                    const isFixedCat = sub.name.toLowerCase().includes('hyra') || sub.name.toLowerCase().includes('avgift') || sub.name.toLowerCase().includes('försäkring');
                    const factor = (excludeDreams && !isFixedCat) ? scalingFactor : 1;
                    subSpent += amount * factor;
                });
                return { ...sub, spent: subSpent / timeframe };
            }).sort((a,b) => b.spent - a.spent);

            const totalSubSpent = breakdown.reduce((sum, s) => sum + s.spent, 0);
            const unclassifiedSpent = avgSpent - totalSubSpent;

            // AVERAGE BUDGET LIMIT CALCULATION
            // We need to calculate the limit for EACH month in the timeframe and average it.
            let totalLimitOverPeriod = 0;
            
            // Iterate months from startMonthKey to targetEndMonth
            let iterDate = startDateObj; // use the calculated start date object
            // Just iterate month by month
            for (let i = 0; i < timeframe; i++) {
                // Correct iteration:
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
                unclassifiedSpent
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

             {/* NORMALIZATION INFO */}
             {data.isScaled && (
                 <div className="bg-indigo-900/30 border border-indigo-500/30 p-3 rounded-xl flex items-start gap-3">
                     <Info className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                     <div className="text-xs text-indigo-200">
                         <span className="font-bold text-white">Smart Normalisering Aktiv:</span> Datan har justerats eftersom du varit borta på resa 
                         <span className="font-bold text-white"> {data.totalDays - data.homeDays} dagar</span> under perioden. 
                         Dina vardagliga kostnader (Mat, etc) har räknats upp (x{data.scalingFactor.toFixed(2)}) för att visa vad en "normal hemmamånad" skulle kosta.
                     </div>
                 </div>
             )}

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

            {/* TOTAL PROGRESS */}
            <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700">
                <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold text-slate-400 uppercase">Totalt nyttjande</span>
                    <span className="text-xs font-mono text-slate-500">{Math.round((data.totalSpent / (data.totalLimit || 1)) * 100)}%</span>
                </div>
                <BudgetProgressBar spent={data.totalSpent} total={data.totalLimit} />
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
                                        <div key={sub.id} className="p-3 border-b border-slate-700/30 last:border-0 hover:bg-slate-800/30 transition-colors flex justify-between items-center">
                                            <span className="text-sm text-slate-300">{sub.name}</span>
                                            <span className="text-sm font-mono text-white">{formatMoney(sub.spent)}</span>
                                        </div>
                                    ))}
                                    {group.unclassifiedSpent > 0.01 && (
                                        <div className="p-3 border-b border-slate-700/30 flex justify-between items-center bg-slate-800/20">
                                            <span className="text-sm text-slate-400 italic">Ospecificerat / Saknar underkategori</span>
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
        </div>
    );
};

// --- SUB-COMPONENT: TRENDS ANALYSIS (New View) ---
const TrendsAnalysis = () => {
    const { budgetGroups, transactions, subCategories, buckets, settings } = useApp();
    const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('ALL');

    // Generate 12 months of history
    const historyData = useMemo(() => {
        const today = new Date();
        const months = [];

        for (let i = 11; i >= 0; i--) {
            const date = subMonths(today, i);
            const monthKey = format(date, 'yyyy-MM');
            const monthLabel = format(date, 'MMM', { locale: sv });
            
            // Use same interval logic as operating budget for consistency
            const { start, end } = getBudgetInterval(monthKey, settings.payday);
            const startStr = format(start, 'yyyy-MM-dd');
            const endStr = format(end, 'yyyy-MM-dd');

            // Find transactions for this month interval
            const monthTxs = transactions.filter(t => 
                t.date >= startStr && t.date <= endStr &&
                (t.type === 'EXPENSE' || (!t.type && t.amount < 0))
            );

            // Calculate spent vs budget
            let spentOperating = 0;
            let spentDreams = 0;
            let budget = 0;

            if (selectedGroupFilter === 'ALL') {
                monthTxs.forEach(t => {
                    const amount = Math.abs(t.amount);
                    let isDream = false;
                    if (t.bucketId) {
                        const bucket = buckets.find(b => b.id === t.bucketId);
                        if (bucket?.type === 'GOAL') isDream = true;
                    }
                    if (isDream) {
                        spentDreams += amount;
                    } else {
                        spentOperating += amount;
                    }
                });

                budget = budgetGroups.reduce((sum, g) => {
                    const { data } = getEffectiveBudgetGroupData(g, monthKey);
                    return sum + (data?.limit || 0);
                }, 0);
            } else if (selectedGroupFilter === 'OPERATING') {
                // EXCLUDE DREAMS/GOALS
                const filteredTxs = monthTxs.filter(t => {
                    if (t.bucketId) {
                        const bucket = buckets.find(b => b.id === t.bucketId);
                        return bucket?.type !== 'GOAL';
                    }
                    return true;
                });
                spentOperating = filteredTxs.reduce((sum, t) => sum + Math.abs(t.amount), 0);
                budget = budgetGroups.reduce((sum, g) => {
                    const { data } = getEffectiveBudgetGroupData(g, monthKey);
                    return sum + (data?.limit || 0);
                }, 0);
            } else if (selectedGroupFilter === 'DREAMS') {
                // ONLY DREAMS
                const filteredTxs = monthTxs.filter(t => {
                    if (!t.bucketId) return false;
                    const bucket = buckets.find(b => b.id === t.bucketId);
                    return bucket?.type === 'GOAL';
                });
                spentDreams = filteredTxs.reduce((sum, t) => sum + Math.abs(t.amount), 0);
                // Budget for dreams is variable, maybe sum targets? For now show 0 budget or derived.
                budget = 0; 
            } else {
                // Filter for specific group
                const group = budgetGroups.find(g => g.id === selectedGroupFilter);
                if (group) {
                    const { data } = getEffectiveBudgetGroupData(group, monthKey);
                    budget = data?.limit || 0;
                    
                    const assignedSubs = subCategories.filter(s => s.budgetGroupId === group.id);
                    const assignedSubIds = new Set(assignedSubs.map(s => s.id));
                    
                    const groupTxs = monthTxs.filter(t => {
                        // Exclude dreams here too
                        if (t.bucketId) {
                            const b = buckets.find(b => b.id === t.bucketId);
                            if (b?.type === 'GOAL') return false;
                        }

                        if (t.categorySubId && assignedSubIds.has(t.categorySubId)) return true;
                        if (group.isCatchAll && (!t.categorySubId || !subCategories.find(s => s.id === t.categorySubId)?.budgetGroupId)) return true;
                        return false;
                    });
                    spentOperating = groupTxs.reduce((sum, t) => sum + Math.abs(t.amount), 0);
                }
            }

            months.push({
                name: monthLabel,
                key: monthKey,
                Budget: budget,
                UtfallOperating: spentOperating,
                UtfallDreams: spentDreams,
                UtfallTotal: spentOperating + spentDreams,
                Diff: budget - (spentOperating + spentDreams)
            });
        }
        return months;
    }, [transactions, budgetGroups, selectedGroupFilter, subCategories, buckets, settings.payday]);

    // Calculate KPIs
    const stats = useMemo(() => {
        const totalSpent = historyData.reduce((sum, m) => sum + m.UtfallTotal, 0);
        const avgSpent = Math.round(totalSpent / historyData.length);
        const totalBudget = historyData.reduce((sum, m) => sum + m.Budget, 0);
        const health = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;
        
        // Trend (Last 3m vs Previous 3m)
        const recent = historyData.slice(-3).reduce((sum, m) => sum + m.UtfallTotal, 0);
        const previous = historyData.slice(-6, -3).reduce((sum, m) => sum + m.UtfallTotal, 0);
        const trend = previous > 0 ? ((recent - previous) / previous) * 100 : 0;

        return { avgSpent, health, trend };
    }, [historyData]);

    return (
        <div className="space-y-6 animate-in slide-in-from-right">
            
            {/* FILTERING */}
            <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                <button 
                    onClick={() => setSelectedGroupFilter('ALL')}
                    className={cn("px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all", selectedGroupFilter === 'ALL' ? "bg-white text-slate-900 shadow" : "bg-slate-800 text-slate-400")}
                >
                    Alla Utgifter (Total)
                </button>
                <button 
                    onClick={() => setSelectedGroupFilter('OPERATING')}
                    className={cn("px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all", selectedGroupFilter === 'OPERATING' ? "bg-emerald-600 text-white shadow" : "bg-slate-800 text-slate-400")}
                >
                    Drift (Exkl. Resor)
                </button>
                <button 
                    onClick={() => setSelectedGroupFilter('DREAMS')}
                    className={cn("px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all", selectedGroupFilter === 'DREAMS' ? "bg-purple-600 text-white shadow" : "bg-slate-800 text-slate-400")}
                >
                    Enbart Resor/Drömmar
                </button>
                <div className="w-px h-6 bg-slate-700 mx-2 self-center"></div>
                {budgetGroups.map(g => (
                    <button 
                        key={g.id}
                        onClick={() => setSelectedGroupFilter(g.id)}
                        className={cn("px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2", selectedGroupFilter === g.id ? "bg-indigo-600 text-white shadow" : "bg-slate-800 text-slate-400")}
                    >
                        <span>{g.icon}</span> {g.name}
                    </button>
                ))}
            </div>

            {/* KPI CARDS */}
            <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-800 p-3 rounded-xl border border-slate-700 shadow-lg">
                    <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Snitt / Mån</div>
                    <div className="text-lg font-mono font-bold text-white">{formatMoney(stats.avgSpent)}</div>
                </div>
                <div className="bg-slate-800 p-3 rounded-xl border border-slate-700 shadow-lg">
                    <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Budgethälsa</div>
                    <div className={cn("text-lg font-mono font-bold", stats.health > 100 ? "text-rose-400" : "text-emerald-400")}>
                        {stats.health}%
                    </div>
                </div>
                <div className="bg-slate-800 p-3 rounded-xl border border-slate-700 shadow-lg">
                    <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Trend (3m)</div>
                    <div className={cn("text-lg font-mono font-bold flex items-center gap-1", stats.trend > 0 ? "text-rose-400" : "text-emerald-400")}>
                        {stats.trend > 0 ? <TrendingUp size={16}/> : <TrendingDown size={16}/>}
                        {Math.abs(Math.round(stats.trend))}%
                    </div>
                </div>
            </div>

            {/* MAIN CHART */}
            <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700 shadow-lg">
                <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-indigo-400" />
                    Utveckling: {selectedGroupFilter === 'ALL' ? 'Total' : (selectedGroupFilter === 'OPERATING' ? 'Driftbudget' : (selectedGroupFilter === 'DREAMS' ? 'Resor' : budgetGroups.find(g => g.id === selectedGroupFilter)?.name))}
                </h3>
                <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={historyData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                            <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                            <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => `${val/1000}k`} />
                            <Tooltip 
                                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px', color: '#fff' }}
                                itemStyle={{ color: '#fff' }}
                                formatter={(value: number) => formatMoney(value)}
                            />
                            
                            {/* Budget Line/Area (Only show if not filtering dreams, as budget is often dynamic there) */}
                            {selectedGroupFilter !== 'DREAMS' && (
                                <Area type="monotone" dataKey="Budget" stroke="#6366f1" fill="url(#colorBudget)" fillOpacity={0.1} strokeWidth={2} />
                            )}
                            
                            {/* Actuals Bar - Stacked for Dreams vs Operating */}
                            <Bar name="Drift" dataKey="UtfallOperating" stackId="a" radius={[0, 0, 0, 0]} barSize={12} fill="#10b981" />
                            <Bar name="Drömmar/Resor" dataKey="UtfallDreams" stackId="a" radius={[4, 4, 0, 0]} barSize={12} fill="#8b5cf6" />
                            
                            <defs>
                                <linearGradient id="colorBudget" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
                
                {/* Legend */}
                <div className="flex justify-center gap-4 mt-4 text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                    {selectedGroupFilter !== 'DREAMS' && <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-indigo-500"></div> Budgettak</div>}
                    <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> Drift</div>
                    <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-purple-500"></div> Drömmar</div>
                </div>
            </div>
        </div>
    );
};

// --- MAIN VIEW ---
export const StatsView: React.FC = () => {
  const { selectedMonth } = useApp();
  const [activeTab, setActiveTab] = useState<'snapshot' | 'trends'>('snapshot');

  return (
    <div className="space-y-6 pb-24 animate-in slide-in-from-right duration-300">
      <header>
          <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-indigo-400">Statistik</h1>
          <p className="text-slate-400">Följ upp din ekonomi och se trender.</p>
      </header>

      {/* TABS */}
      <div className="flex p-1 bg-slate-800 rounded-xl shadow-lg border border-slate-700/50">
          <button 
            onClick={() => setActiveTab('snapshot')}
            className={cn("flex-1 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all", 
                activeTab === 'snapshot' ? "bg-indigo-600 text-white shadow-lg" : "text-slate-400 hover:text-white"
            )}
          >
              <PieIcon size={16} /> Månad
          </button>
          <button 
            onClick={() => setActiveTab('trends')}
            className={cn("flex-1 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all", 
                activeTab === 'trends' ? "bg-purple-600 text-white shadow-lg" : "text-slate-400 hover:text-white"
            )}
          >
              <TrendingUp size={16} /> Trender (12 mån)
          </button>
      </div>

      {/* CONTENT */}
      {activeTab === 'snapshot' ? (
          <MonthlySnapshot selectedMonth={selectedMonth} />
      ) : (
          <TrendsAnalysis />
      )}
    </div>
  );
};