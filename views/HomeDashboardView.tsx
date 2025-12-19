
import React, { useMemo, useState } from 'react';
import { useApp } from '../store';
import { useBudgetMonth } from '../hooks/useBudgetMonth';
import { useSubscriptionDetection } from '../hooks/useSubscriptionDetection';
import { 
    formatMoney, 
    getEffectiveBudgetGroupData, 
    calculateReimbursementMap, 
    getEffectiveAmount, 
    getTotalFamilyIncome, 
    calculateSavedAmount,
    getEffectiveSubCategoryBudget,
    getEffectiveBucketData,
    calculateGoalBucketCost,
    isBucketActiveInMonth,
    getBudgetInterval
} from '../utils';
import { 
    differenceInDays, 
    startOfDay, 
    isAfter, 
    isBefore,
    parseISO, 
    format,
    differenceInMonths,
    subMonths,
    eachDayOfInterval,
    getDay,
    isValid,
    isSameMonth
} from 'date-fns';
import { cn, Modal, Button } from '../components/components';
import { 
    CheckCircle2, 
    ChevronRight, 
    Clock, 
    CreditCard, 
    Wallet, 
    Rocket, 
    AlertOctagon, 
    Zap,
    Utensils,
    Repeat,
    ShoppingBag,
    Link2,
    Copy,
    TrendingUp,
    Coffee,
    Trophy,
    ArrowUpRight,
    ArrowDownRight,
    Info,
    Calendar,
    Activity,
    PiggyBank,
    TrendingDown,
    BarChart3
} from 'lucide-react';
import { BudgetProgressBar } from '../components/BudgetProgressBar';

export const HomeDashboardView: React.FC<{ onNavigate: (view: any) => void }> = ({ onNavigate }) => {
    const { 
        selectedMonth, 
        transactions, 
        budgetGroups, 
        buckets, 
        users, 
        subCategories, 
        ignoredSubscriptions,
        settings,
        budgetTemplates,
        monthConfigs
    } = useApp();
    
    const { start, end, startStr, endStr, intervalLabel } = useBudgetMonth(selectedMonth);
    const reimbursementMap = useMemo(() => calculateReimbursementMap(transactions), [transactions]);
    
    const [isBudgetDrillDownOpen, setIsBudgetDrillDownOpen] = useState(false);

    // --- 1. TIME CALCULATIONS ---
    const today = startOfDay(new Date());
    const totalDays = differenceInDays(end, start) + 1;
    
    let daysRemaining = 0;
    let daysPassed = 0;

    if (isAfter(today, end)) {
        daysRemaining = 0;
        daysPassed = totalDays;
    } else if (isBefore(today, start)) {
        daysRemaining = totalDays;
        daysPassed = 0;
    } else {
        daysRemaining = differenceInDays(end, today) + 1;
        daysPassed = Math.max(0, differenceInDays(today, start)); 
    }
    
    const futureDays = Math.max(1, daysRemaining); 
    const timeProgress = Math.min(100, (daysPassed / totalDays) * 100);

    // --- 2. SAFE TO SPEND & FORECAST ---
    const budgetData = useMemo(() => {
        let consumptionLimitTotal = 0;
        let consumptionSpentTotal = 0;
        let consumptionProjectedTotal = 0;
        let disposableTotal = 0;
        
        const groupBreakdown: any[] = [];

        // Correct bucket assignment map
        const assignedBucketIds = new Set<string>();
        const groupToBuckets = new Map<string, string[]>();

        budgetGroups.forEach(g => groupToBuckets.set(g.id, []));
        buckets.forEach(b => {
            if (b.budgetGroupId) {
                const list = groupToBuckets.get(b.budgetGroupId);
                if (list) {
                    list.push(b.id);
                    assignedBucketIds.add(b.id);
                }
            }
        });

        budgetGroups.forEach(group => {
            if (group.linkedBucketIds) {
                group.linkedBucketIds.forEach(bid => {
                    if (!assignedBucketIds.has(bid)) {
                        groupToBuckets.get(group.id)?.push(bid);
                        assignedBucketIds.add(bid);
                    }
                });
            }
        });

        const catchAllGroup = budgetGroups.find(g => g.isCatchAll);
        if (catchAllGroup) {
            buckets.forEach(b => {
                if (!assignedBucketIds.has(b.id)) {
                    groupToBuckets.get(catchAllGroup.id)?.push(b.id);
                }
            });
        }

        budgetGroups.forEach(group => {
            const { data: explicitData } = getEffectiveBudgetGroupData(group, selectedMonth, budgetTemplates, monthConfigs);
            const manualLimit = explicitData && !explicitData.isExplicitlyDeleted ? explicitData.limit : 0;
            const groupType = group.forecastType || 'VARIABLE';
            const isGroupSavings = groupType === 'SAVINGS';

            // Split items into Consumption vs Savings
            let groupConsumptionLimit = 0;
            let groupConsumptionSpent = 0;
            let groupAllChildrenBudget = 0;

            const groupSubs = subCategories.filter(s => s.budgetGroupId === group.id);
            
            groupSubs.forEach(sub => {
                const b = getEffectiveSubCategoryBudget(sub, selectedMonth, budgetTemplates, monthConfigs);
                groupAllChildrenBudget += b;
                
                const txs = transactions.filter(t => 
                    !t.isHidden && 
                    t.date >= startStr && t.date <= endStr && 
                    t.categorySubId === sub.id && 
                    !t.bucketId &&
                    (t.type === 'EXPENSE' || (!t.type && t.amount < 0))
                );
                const s = txs.reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);

                if (!isGroupSavings && !sub.isSavings) {
                    groupConsumptionLimit += b;
                    groupConsumptionSpent += s;
                }
            });

            const groupBucketIds = new Set(groupToBuckets.get(group.id) || []);
            buckets.filter(b => groupBucketIds.has(b.id)).forEach(bucket => {
                let currentMonthSavingCost = 0;
                let consumptionLimit = 0;
                let consumptionSpent = transactions
                    .filter(t => !t.isHidden && t.bucketId === bucket.id && t.date >= startStr && t.date <= endStr && (t.type === 'EXPENSE' || (!t.type && t.amount < 0)))
                    .reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);

                if (bucket.type === 'FIXED') {
                    const { data } = getEffectiveBucketData(bucket, selectedMonth, budgetTemplates, monthConfigs);
                    consumptionLimit = data ? data.amount : 0;
                } else if (bucket.type === 'DAILY') {
                    const { data } = getEffectiveBucketData(bucket, selectedMonth, budgetTemplates, monthConfigs);
                    if (data) {
                        const days = eachDayOfInterval({ start, end });
                        const count = days.filter(d => data.activeDays.includes(getDay(d))).length;
                        consumptionLimit = count * data.dailyAmount;
                    }
                } else if (bucket.type === 'GOAL') {
                    // GOAL Part 1: Saving part (Deduction from income)
                    if (bucket.paymentSource === 'INCOME') {
                        currentMonthSavingCost = calculateGoalBucketCost(bucket, selectedMonth);
                    }
                    
                    // GOAL Part 2: Consumption part (Remaining project budget)
                    let isSpendingPhase = false;
                    if (consumptionSpent > 0) {
                        isSpendingPhase = true;
                    } else {
                        const current = parseISO(`${selectedMonth}-01`);
                        if (bucket.targetDate) {
                            const targetDateObj = parseISO(`${bucket.targetDate}-01`);
                            if (isValid(targetDateObj) && isSameMonth(current, targetDateObj)) {
                                isSpendingPhase = true;
                            }
                        }
                        if (bucket.eventStartDate && bucket.eventEndDate) {
                            const evtStart = parseISO(bucket.eventStartDate);
                            const evtEnd = parseISO(bucket.eventEndDate);
                            if (isValid(evtStart) && isValid(evtEnd)) {
                                if (!isAfter(start, evtEnd) && !isBefore(end, evtStart)) {
                                    isSpendingPhase = true;
                                }
                            }
                        }
                    }

                    if (isSpendingPhase) {
                        // Calculate remaining project budget (Total - Past Spending)
                        const budgetStart = start;
                        const currentStartStr = format(budgetStart, 'yyyy-MM-dd');
                        const pastSpent = transactions
                            .filter(t => 
                                !t.isHidden && 
                                t.bucketId === bucket.id && 
                                t.date < currentStartStr && 
                                (t.type === 'EXPENSE' || (!t.type && t.amount < 0))
                            )
                            .reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);
                        
                        let projectBudget = Math.max(0, bucket.targetAmount - pastSpent);
                        
                        // Handle Archived Goals: Cap budget to actual spent if underspent
                        const archivedDateObj = bucket.archivedDate ? parseISO(`${bucket.archivedDate}-01`) : null;
                        const currentMonthObj = parseISO(`${selectedMonth}-01`);
                        const isArchived = archivedDateObj && isValid(archivedDateObj) && (isSameMonth(currentMonthObj, archivedDateObj) || isAfter(currentMonthObj, archivedDateObj));
                        
                        if (isArchived) {
                            consumptionLimit = Math.min(projectBudget, consumptionSpent);
                        } else {
                            consumptionLimit = projectBudget;
                        }
                    }
                }

                // Sum up "total parts" for group buffer detection
                groupAllChildrenBudget += (bucket.type === 'GOAL' ? currentMonthSavingCost : consumptionLimit);

                // Add to consumption totals
                if (!isGroupSavings && (!bucket.isSavings || bucket.type === 'GOAL')) {
                    groupConsumptionLimit += consumptionLimit;
                    groupConsumptionSpent += consumptionSpent;
                }
            });

            // Handle Manual Limit Buffer
            const buffer = Math.max(0, manualLimit - groupAllChildrenBudget);
            if (!isGroupSavings) {
                groupConsumptionLimit += buffer;
            }

            // Also account for extra unclassified spent in catch-all
            if (group.isCatchAll) {
                const extraSpent = transactions.filter(t => 
                    !t.isHidden && t.date >= startStr && t.date <= endStr &&
                    (t.type === 'EXPENSE' || (!t.type && t.amount < 0)) &&
                    !t.bucketId &&
                    (!t.categorySubId || !subCategories.find(s => s.id === t.categorySubId)?.budgetGroupId)
                ).reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);
                groupConsumptionSpent += extraSpent;
            }

            // PROJECTION LOGIC (FOR CONSUMPTION ONLY)
            let groupProjected = 0;
            let groupDisposable = 0;

            if (isGroupSavings) {
                groupProjected = 0;
                groupDisposable = 0;
            } else {
                // FIXED & VARIABLE now allow negative contributions if overspent
                groupDisposable = groupConsumptionLimit - groupConsumptionSpent;
                
                if (groupType === 'FIXED') {
                    groupProjected = Math.max(groupConsumptionLimit, groupConsumptionSpent);
                } else {
                    const dailyAvg = daysPassed > 0 ? groupConsumptionSpent / daysPassed : 0;
                    groupProjected = groupConsumptionSpent + (dailyAvg * futureDays);
                }
            }

            consumptionLimitTotal += groupConsumptionLimit;
            consumptionSpentTotal += groupConsumptionSpent;
            consumptionProjectedTotal += groupProjected;
            disposableTotal += groupDisposable;

            groupBreakdown.push({ 
                id: group.id, 
                name: group.name, 
                icon: group.icon, 
                limit: groupConsumptionLimit, 
                spent: groupConsumptionSpent, 
                type: groupType, 
                disposable: groupDisposable, 
                projected: groupProjected,
                isSavingsGroup: isGroupSavings
            });
        });

        const safeToSpend = daysRemaining > 0 ? disposableTotal / daysRemaining : 0;
        const projectedDiff = consumptionProjectedTotal - consumptionLimitTotal;
        const projectedRoom = consumptionLimitTotal - consumptionProjectedTotal;

        return { 
            totalLimit: consumptionLimitTotal, 
            totalSpent: consumptionSpentTotal, 
            remaining: disposableTotal, 
            safeToSpend, 
            projectedTotal: consumptionProjectedTotal, 
            projectedDiff, 
            projectedRoom, 
            groupBreakdown 
        };
    }, [budgetGroups, transactions, startStr, endStr, buckets, subCategories, reimbursementMap, daysPassed, daysRemaining, futureDays, selectedMonth, settings.payday, budgetTemplates, monthConfigs, start, end]);

    const unverifiedCount = transactions.filter(t => !t.isVerified && !t.isHidden).length;
    const unlinkedTransfersCount = transactions.filter(t => !t.isHidden && t.type === 'TRANSFER' && (!t.bucketId || t.bucketId === 'INTERNAL') && !t.linkedTransactionId && t.date >= startStr && t.date <= endStr).length;
    
    const analysisData = useMemo(() => {
        const currentTxs = transactions.filter(t => !t.isHidden && t.date >= startStr && t.date <= endStr);
        const expenseTxs = currentTxs.filter(t => t.type === 'EXPENSE' || (!t.type && t.amount < 0));
        
        const cleanName = (desc: string) => {
            let name = desc.trim();
            const parts = name.split(' ');
            name = parts.length > 1 ? `${parts[0]} ${parts[1]}` : parts[0];
            return name.replace(/AB|SE|Kortköp|Reserverat/gi, '').trim();
        };

        const smallTxMap = new Map<string, { total: number, count: number }>();
        expenseTxs.forEach(t => {
            const eff = Math.abs(getEffectiveAmount(t, reimbursementMap));
            if (eff === 0 || eff >= 200) return;
            const name = cleanName(t.description);
            const current = smallTxMap.get(name) || { total: 0, count: 0 };
            smallTxMap.set(name, { total: current.total + eff, count: current.count + 1 });
        });

        return { 
            topSmallSpends: Array.from(smallTxMap.entries()).sort((a, b) => b[1].total - a[1].total).slice(0, 5).map(([name, data], i) => ({ rank: i+1, name, amount: data.total, count: data.count }))
        };
    }, [transactions, startStr, endStr, reimbursementMap]);

    const nextDream = useMemo(() => {
        const activeGoals = buckets.filter(b => b.type === 'GOAL' && !b.archivedDate && b.targetAmount > 0);
        if (activeGoals.length === 0) return null;
        const sorted = activeGoals.sort((a, b) => (a.targetDate || '9999') > (b.targetDate || '9999') ? 1 : -1);
        const goal = sorted[0];
        const saved = calculateSavedAmount(goal, selectedMonth);
        return { ...goal, saved, percent: Math.min(100, (saved / goal.targetAmount) * 100), monthsLeft: goal.targetDate ? differenceInMonths(parseISO(`${goal.targetDate}-01`), today) : 0 };
    }, [buckets, selectedMonth, today]);

    const budgetProgress = Math.min(100, (budgetData.totalSpent / Math.max(1, budgetData.totalLimit)) * 100);
    const projectedProgress = Math.min(100, (budgetData.projectedTotal / Math.max(1, budgetData.totalLimit)) * 100);

    return (
        <div className="space-y-6 pb-24 animate-in fade-in duration-500">
            <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3 bg-slate-800/50 p-2 rounded-xl border border-slate-700/50">
                    <div className="p-2 bg-slate-800 rounded-lg">
                        <Clock size={16} className={daysRemaining < 7 ? "text-orange-400" : "text-blue-400"} />
                    </div>
                    <div className="flex-1">
                        <div className="flex justify-between text-xs mb-1.5">
                            <span className="text-slate-400 font-medium">Månadsstatus ({intervalLabel})</span>
                            <span className="text-white font-bold">{daysRemaining} dagar kvar</span>
                        </div>
                        <div className="h-2 w-full bg-slate-700 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full transition-all duration-1000" style={{ width: `${timeProgress}%` }}></div>
                        </div>
                    </div>
                </div>

                <div 
                    onClick={() => setIsBudgetDrillDownOpen(true)}
                    className="flex items-center gap-3 bg-slate-800/50 p-2 rounded-xl border border-slate-700/50 cursor-pointer hover:bg-slate-800 transition-all group"
                >
                    <div className="p-2 bg-slate-800 rounded-lg group-hover:bg-slate-700">
                        <Wallet size={16} className={budgetData.remaining < 0 ? "text-rose-400" : "text-emerald-400"} />
                    </div>
                    <div className="flex-1">
                        <div className="flex justify-between text-xs mb-1.5">
                            <span className="text-slate-400 font-medium flex items-center gap-1">Kvar att använda <Info size={10}/></span>
                            <span className="text-white font-bold">{formatMoney(Math.round(budgetData.safeToSpend))} / dag</span>
                        </div>
                        <div className="h-2 w-full bg-slate-700 rounded-full overflow-hidden relative">
                            <div 
                                className={cn("h-full rounded-full transition-all duration-1000", budgetData.remaining < 0 ? "bg-rose-500" : "bg-emerald-500")} 
                                style={{ width: `${budgetProgress}%` }}
                            ></div>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-1 text-right flex justify-between">
                            <span className="text-[8px] uppercase font-bold opacity-0 group-hover:opacity-100 transition-opacity text-blue-400">Visa detaljer</span>
                            <span>Totalt {formatMoney(budgetData.remaining)} kvar</span>
                        </div>
                    </div>
                </div>
            </div>

            {(unverifiedCount > 0 || unlinkedTransfersCount > 0 || analysisData.topSmallSpends.length > 0) && (
                <div className="space-y-3">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1 flex items-center gap-2"><Zap size={12} className="text-yellow-400" /> Att Hantera</h3>
                    {unverifiedCount > 0 && (
                        <div onClick={() => onNavigate('transactions')} className="bg-slate-800 p-4 rounded-xl border-l-4 border-l-purple-500 border-y border-r border-slate-700 flex justify-between items-center cursor-pointer hover:bg-slate-750 transition-colors">
                            <div className="flex items-center gap-3">
                                <div className="bg-purple-500/20 p-2 rounded-full text-purple-400"><CheckCircle2 size={18} /></div>
                                <div>
                                    <div className="font-bold text-white">Granska Transaktioner</div>
                                    <div className="text-xs text-slate-400">{unverifiedCount} stycken väntar på godkännande.</div>
                                </div>
                            </div>
                            <ChevronRight size={18} className="text-slate-500" />
                        </div>
                    )}
                    {unlinkedTransfersCount > 0 && (
                        <div onClick={() => onNavigate('transactions')} className="bg-slate-800 p-4 rounded-xl border-l-4 border-l-orange-500 border-y border-r border-slate-700 flex justify-between items-center cursor-pointer hover:bg-slate-750">
                            <div className="flex items-center gap-3">
                                <div className="bg-orange-500/20 p-2 rounded-full text-orange-400"><Link2 size={18} /></div>
                                <div>
                                    <div className="font-bold text-white">Okopplade Överföringar</div>
                                    <div className="text-xs text-slate-400">{unlinkedTransfersCount} överföringar saknar budgetpost.</div>
                                </div>
                            </div>
                            <ChevronRight size={18} className="text-slate-500" />
                        </div>
                    )}
                </div>
            )}

            <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 space-y-4">
                <div className="flex justify-between items-start">
                    <div>
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                            <BarChart3 size={12} className="text-blue-400" /> Prognos (Månadsslut)
                        </div>
                        <div className={cn("text-2xl font-mono font-bold", budgetData.projectedDiff > 0 ? "text-rose-400" : "text-emerald-400")}>
                            {formatMoney(budgetData.projectedTotal)}
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Max Budget</div>
                        <div className="text-lg font-mono font-bold text-white">{formatMoney(budgetData.totalLimit)}</div>
                    </div>
                </div>

                <div className="space-y-1.5">
                    <div className="h-2.5 w-full bg-slate-700 rounded-full overflow-hidden relative">
                        <div 
                            className={cn("h-full transition-all duration-1000 rounded-full", budgetData.projectedDiff > 0 ? "bg-rose-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]" : "bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.3)]")} 
                            style={{ width: `${projectedProgress}%` }}
                        />
                        {/* 100% Mark */}
                        <div className="absolute top-0 bottom-0 left-[100%] w-0.5 bg-white/20 z-10" />
                    </div>
                    <div className="flex justify-between items-center text-[10px] font-bold uppercase">
                         <span className={cn(budgetData.projectedRoom >= 0 ? "text-emerald-400" : "text-rose-400")}>
                             {budgetData.projectedRoom >= 0 ? (
                                 <span className="flex items-center gap-1"><TrendingDown size={10}/> Beräknat överskott: {formatMoney(budgetData.projectedRoom)}</span>
                             ) : (
                                 <span className="flex items-center gap-1"><TrendingUp size={10}/> Beräknat underskott: {formatMoney(Math.abs(budgetData.projectedRoom))}</span>
                             )}
                         </span>
                         <span className="text-slate-500">Mål: {formatMoney(budgetData.totalLimit)}</span>
                    </div>
                </div>
                
                <p className="text-[10px] text-slate-500 leading-relaxed italic">
                    Beräknas genom att lägga samman fasta kostnader med den förväntade linjära förbrukningen i rörliga kategorier. Sparande (individuella poster eller hela grupper) är exkluderat, men budget för Dreams (förbrukning) är inkluderat.
                </p>
            </div>

            {analysisData.topSmallSpends.length > 0 && (
                <div>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2"><Zap size={12} /> Snabba Insikter</h3>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-slate-800 p-3 rounded-xl border border-slate-700 col-span-2">
                            <div className="text-[10px] text-slate-500 uppercase font-bold mb-2 flex items-center gap-1"><Coffee size={10} /> Småutgifter &lt; 200kr</div>
                            <div className="space-y-1.5">
                                {analysisData.topSmallSpends.map((item, i) => (
                                    <div key={i} className="flex justify-between items-center text-xs border-b border-slate-700/50 pb-1 last:border-0 last:pb-0">
                                        <div className="flex items-center gap-2 overflow-hidden"><span className="text-slate-600 font-bold w-3">{item.rank}.</span><span className="text-slate-300 truncate">{item.name}</span></div>
                                        <span className="text-white font-mono">{formatMoney(item.amount)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {nextDream && (
                <div onClick={() => onNavigate('dreams')} className="relative cursor-pointer group rounded-2xl overflow-hidden shadow-lg border border-slate-700">
                    {nextDream.backgroundImage && (
                        <div className="absolute inset-0 z-0">
                            <img src={nextDream.backgroundImage} className="w-full h-full object-cover opacity-40 group-hover:opacity-50 transition-opacity" alt="dream bg" />
                            <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/60 to-transparent" />
                        </div>
                    )}
                    <div className="relative z-10 p-5">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <div className="flex items-center gap-2 text-purple-300 text-xs font-bold uppercase tracking-wider mb-1"><Rocket size={12} /> Nästa Mål</div>
                                <h3 className="text-2xl font-bold text-white leading-none">{nextDream.name}</h3>
                            </div>
                            <div className="text-right"><span className="text-2xl font-bold text-white">{Math.round(nextDream.percent)}%</span></div>
                        </div>
                        <div className="flex justify-between items-end">
                            <div className="text-xs text-slate-300">{nextDream.monthsLeft <= 0 ? "Dags att köpa!" : `${nextDream.monthsLeft} månader kvar`}</div>
                            <div className="text-xs font-mono text-purple-200">{formatMoney(nextDream.saved)} / {formatMoney(nextDream.targetAmount)}</div>
                        </div>
                        <div className="mt-2 h-1.5 w-full bg-slate-700/50 rounded-full overflow-hidden">
                            <div className="h-full bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.6)]" style={{ width: `${nextDream.percent}%` }}></div>
                        </div>
                    </div>
                </div>
            )}

            <Modal isOpen={isBudgetDrillDownOpen} onClose={() => setIsBudgetDrillDownOpen(false)} title="Beräkning: Kvar att använda">
                <div className="space-y-6">
                    <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                        <div className="flex justify-between items-end">
                            <div>
                                <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Konsumtionsutrymme</div>
                                <div className="text-3xl font-bold text-white font-mono">{formatMoney(budgetData.remaining)}</div>
                            </div>
                            <div className="text-right">
                                <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Per dag ({daysRemaining} d)</div>
                                <div className="text-xl font-bold text-emerald-400 font-mono">{formatMoney(Math.round(budgetData.safeToSpend))}</div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">Budgetgrupper (Konsumtion)</h3>
                        <div className="space-y-3">
                            {budgetData.groupBreakdown.map(group => (
                                <div key={group.id} className="bg-slate-900/50 p-3 rounded-xl border border-slate-800">
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex items-center gap-2">
                                            <span className="text-lg">{group.icon}</span>
                                            <div>
                                                <div className="font-bold text-white text-sm">{group.name}</div>
                                                <div className="text-[9px] uppercase tracking-wider flex items-center gap-1 mt-0.5">
                                                    {group.isSavingsGroup ? (
                                                        <span className="text-emerald-400 flex items-center gap-0.5"><PiggyBank size={8}/> Sparande</span>
                                                    ) : group.type === 'FIXED' ? (
                                                        <span className="text-blue-400 flex items-center gap-0.5"><Calendar size={8}/> Fast</span>
                                                    ) : (
                                                        <span className="text-indigo-400 flex items-center gap-0.5"><Activity size={8}/> Rörlig</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className={cn("font-mono font-bold text-sm", group.disposable < 0 && !group.isSavingsGroup ? "text-rose-400" : "text-slate-200")}>
                                                {group.disposable > 0 ? '+' : ''}{formatMoney(group.disposable)}
                                            </div>
                                            <div className="text-[9px] text-slate-500">Bidrag till utrymme</div>
                                        </div>
                                    </div>
                                    
                                    {!group.isSavingsGroup ? (
                                        <>
                                            <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                                                <span>Utfall: {formatMoney(group.spent)}</span>
                                                <span>Konsumtionsbudget: {formatMoney(group.limit)}</span>
                                            </div>
                                            <BudgetProgressBar spent={group.spent} total={group.limit} compact />
                                        </>
                                    ) : (
                                        <div className="text-[10px] text-slate-500 italic">Hela gruppen är markerad som sparande och exkluderas.</div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/50 text-xs text-slate-400 space-y-2">
                        <p className="text-white font-bold mb-1">Hur räknar vi?</p>
                        <div className="flex items-start gap-2">
                            <Activity size={14} className="text-indigo-400 shrink-0 mt-0.5" />
                            <p><span className="text-slate-200 font-bold">Rörliga:</span> <span className="italic">Konsumtionsbudget - Utfall</span>. Hela potten räknas som tillgänglig.</p>
                        </div>
                        <div className="flex items-start gap-2">
                            <Calendar size={14} className="text-blue-400 shrink-0 mt-0.5" />
                            <p><span className="text-slate-200 font-bold">Fasta:</span> <span className="italic">Budget - Utfall</span>. Pengarna är reserverade, endast underförbrukning bidrar till utrymmet.</p>
                        </div>
                        <div className="flex items-start gap-2">
                            <PiggyBank size={14} className="text-emerald-400 shrink-0 mt-0.5" />
                            <p><span className="text-slate-200 font-bold">Sparande:</span> Alla poster markerade som sparande bidrar med <span className="text-white font-bold">0 kr</span>. Drömmar (förbrukning) räknas dock som konsumtion.</p>
                        </div>
                    </div>

                    <div className="flex justify-end pt-2">
                        <Button variant="secondary" onClick={() => setIsBudgetDrillDownOpen(false)}>Stäng</Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
