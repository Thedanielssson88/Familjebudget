
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
    Activity
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
    const detectedSubs = useSubscriptionDetection(transactions);
    
    const [showDuplicatesModal, setShowDuplicatesModal] = useState(false);
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

    // --- 2. SAFE TO SPEND & FORECAST (ALIGNED WITH STATS VIEW) ---
    const budgetData = useMemo(() => {
        let totalLimit = 0;
        let totalSpent = 0;
        let projectedTotal = 0;
        let disposableTotal = 0;
        const groupBreakdown: any[] = [];

        // Map buckets to groups for exclusion logic
        const bucketIdToGroupId = new Map<string, string>();
        budgetGroups.forEach(bg => {
            const bgBuckets = buckets.filter(b => b.budgetGroupId === bg.id || bg.linkedBucketIds?.includes(b.id));
            bgBuckets.forEach(b => bucketIdToGroupId.set(b.id, bg.id));
        });

        const fixedKeywords = ['boende', 'hyra', 'avgift', 'lån', 'räkning', 'försäkring', 'abonnemang', 'bostad', 'el', 'bredband', 'fast', 'transport', 'bil', 'csn'];

        budgetGroups.forEach(group => {
            // A. CALCULATE EFFECTIVE BUDGET (Matches StatsView logic)
            const { data: explicitData } = getEffectiveBudgetGroupData(group, selectedMonth, budgetTemplates, monthConfigs);
            const manualLimit = explicitData && !explicitData.isExplicitlyDeleted ? explicitData.limit : 0;

            const groupSubs = subCategories.filter(s => s.budgetGroupId === group.id);
            const assignedSubIds = new Set(groupSubs.map(s => s.id));
            const subBudgetSum = groupSubs.reduce((sum, sub) => sum + getEffectiveSubCategoryBudget(sub, selectedMonth, budgetTemplates, monthConfigs), 0);

            const groupBuckets = buckets.filter(b => {
                const gid = bucketIdToGroupId.get(b.id);
                if (gid) return gid === group.id;
                return group.isCatchAll;
            });
            const linkedBucketIds = new Set(groupBuckets.map(b => b.id));
            
            const bucketBudgetSum = groupBuckets.reduce((sum, b) => {
                let cost = 0;
                if (b.type === 'FIXED') {
                    const { data } = getEffectiveBucketData(b, selectedMonth, budgetTemplates, monthConfigs);
                    cost = data ? data.amount : 0;
                } else if (b.type === 'DAILY') {
                    const { data } = getEffectiveBucketData(b, selectedMonth, budgetTemplates, monthConfigs);
                    if (data) {
                        const days = eachDayOfInterval({ start, end });
                        const count = days.filter(d => data.activeDays.includes(getDay(d))).length;
                        cost = count * data.dailyAmount;
                    }
                } else if (b.type === 'GOAL') {
                    // --- UPDATED GOAL LOGIC FOR DASHBOARD ---
                    let goalBudget = 0;

                    // 1. Check for SAVING Phase (Funding)
                    if (b.paymentSource === 'INCOME' && b.startSavingDate && b.targetDate) {
                        const current = parseISO(`${selectedMonth}-01`);
                        const startSave = parseISO(`${b.startSavingDate}-01`);
                        const target = parseISO(`${b.targetDate}-01`);
                        if (isValid(current) && isValid(startSave) && isValid(target)) {
                            if (!isBefore(current, startSave) && isBefore(current, target)) {
                                goalBudget += calculateGoalBucketCost(b, selectedMonth);
                            }
                        }
                    }

                    // 2. Check for SPENDING Phase (Consumption)
                    let isSpending = false;
                    const hasTxs = transactions.some(t => t.bucketId === b.id && t.date >= startStr && t.date <= endStr && !t.isHidden);
                    if (hasTxs) isSpending = true;
                    
                    if (!isSpending) {
                        const current = parseISO(`${selectedMonth}-01`);
                        if (b.targetDate && isValid(parseISO(`${b.targetDate}-01`)) && isSameMonth(current, parseISO(`${b.targetDate}-01`))) isSpending = true;
                        if (b.eventStartDate && b.eventEndDate) {
                            const evtStart = parseISO(b.eventStartDate);
                            const evtEnd = parseISO(b.eventEndDate);
                            if (isValid(evtStart) && isValid(evtEnd) && !isAfter(start, evtEnd) && !isBefore(end, evtStart)) isSpending = true;
                        }
                    }

                    if (isSpending) {
                        const { start: budgetStart } = getBudgetInterval(selectedMonth, settings.payday);
                        const currentStartStr = format(budgetStart, 'yyyy-MM-dd');
                        const pastSpent = transactions
                            .filter(t => 
                                !t.isHidden &&
                                t.bucketId === b.id && 
                                t.date < currentStartStr && 
                                (t.type === 'EXPENSE' || (!t.type && t.amount < 0))
                            )
                            .reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);
                        
                        goalBudget += Math.max(0, b.targetAmount - pastSpent);
                    }
                    cost = goalBudget;
                }
                return sum + (cost > 0 || (b.type !== 'GOAL' && isBucketActiveInMonth(b, selectedMonth)) ? cost : 0);
            }, 0);

            const limit = Math.max(manualLimit, subBudgetSum + bucketBudgetSum);

            const groupTxs = transactions.filter(t => {
                if (t.isHidden) return false;
                if (t.date < startStr || t.date > endStr) return false;
                if (t.type === 'TRANSFER' || t.type === 'INCOME') return false; 
                if (t.amount >= 0) return false; 
                
                if (t.bucketId) {
                    if (linkedBucketIds.has(t.bucketId)) return true;
                    if (group.isCatchAll) return !bucketIdToGroupId.has(t.bucketId);
                    return false;
                }
                if (t.categorySubId && assignedSubIds.has(t.categorySubId)) return true;
                if (group.isCatchAll) {
                    if (!t.categorySubId) return true;
                    const sub = subCategories.find(s => s.id === t.categorySubId);
                    return !sub || !sub.budgetGroupId;
                }
                return false;
            });

            const spent = groupTxs.reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);
            
            totalLimit += limit;
            totalSpent += spent;

            let isFixedGroup = group.forecastType ? group.forecastType === 'FIXED' : false;
            if (!group.forecastType) {
                const name = group.name.toLowerCase();
                if (fixedKeywords.some(kw => name.includes(kw))) isFixedGroup = true;
            }

            let groupDisposable = 0;
            if (isFixedGroup) {
                const effectiveConsumed = Math.max(limit, spent);
                groupDisposable = limit - effectiveConsumed;
                disposableTotal += groupDisposable;
                projectedTotal += Math.max(spent, limit);
            } else {
                groupDisposable = limit - spent;
                disposableTotal += groupDisposable;
                const dailyAverage = daysPassed > 0 ? spent / daysPassed : 0;
                projectedTotal += spent + (dailyAverage * futureDays);
            }

            groupBreakdown.push({
                id: group.id,
                name: group.name,
                icon: group.icon,
                limit,
                spent,
                isFixed: isFixedGroup,
                disposable: groupDisposable
            });
        });

        const safeToSpend = daysRemaining > 0 ? Math.max(0, disposableTotal / daysRemaining) : 0;
        const projectedDiff = projectedTotal - totalLimit;

        return { totalLimit, totalSpent, remaining: disposableTotal, safeToSpend, projectedTotal, projectedDiff, groupBreakdown };
    }, [budgetGroups, transactions, startStr, endStr, buckets, subCategories, reimbursementMap, daysPassed, daysRemaining, futureDays, selectedMonth, settings.payday, budgetTemplates, monthConfigs, start, end]);

    // --- 3. ALERTS & INSIGHTS ---
    const unverifiedCount = transactions.filter(t => !t.isVerified && !t.isHidden).length;
    const unlinkedTransfersCount = transactions.filter(t => !t.isHidden && t.type === 'TRANSFER' && (!t.bucketId || t.bucketId === 'INTERNAL') && !t.linkedTransactionId && t.date >= startStr && t.date <= endStr).length;
    const totalIncome = getTotalFamilyIncome(users, selectedMonth);
    const incomeAlert = totalIncome === 0 && daysPassed > 2;

    const analysisData = useMemo(() => {
        const currentTxs = transactions.filter(t => !t.isHidden && t.date >= startStr && t.date <= endStr);
        const expenseTxs = currentTxs.filter(t => t.type === 'EXPENSE' || (!t.type && t.amount < 0));
        const duplicateCandidates = [];
        const seenTx = new Set<string>();
        expenseTxs.forEach(t => {
            const key = `${t.date}-${Math.abs(t.amount)}-${t.description.trim()}`;
            if (seenTx.has(key)) duplicateCandidates.push(t);
            seenTx.add(key);
        });

        const cleanName = (desc: string) => {
            let name = desc.trim();
            const parts = name.split(' ');
            name = parts.length > 1 ? `${parts[0]} ${parts[1]}` : parts[0];
            return name.replace(/AB|SE|Kortköp|Reserverat/gi, '').trim();
        };

        const merchantMap = new Map<string, number>();
        const smallTxMap = new Map<string, { total: number, count: number }>();

        expenseTxs.forEach(t => {
            const eff = Math.abs(getEffectiveAmount(t, reimbursementMap));
            if (eff === 0) return;
            const name = cleanName(t.description);
            merchantMap.set(name, (merchantMap.get(name) || 0) + eff);
            if (eff < 200) {
                const current = smallTxMap.get(name) || { total: 0, count: 0 };
                smallTxMap.set(name, { total: current.total + eff, count: current.count + 1 });
            }
        });

        const topMerchants = Array.from(merchantMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, amount], i) => ({ rank: i+1, name, amount }));
        const topSmallSpends = Array.from(smallTxMap.entries()).sort((a, b) => b[1].total - a[1].total).slice(0, 5).map(([name, data], i) => ({ rank: i+1, name, amount: data.total, count: data.count }));

        return { duplicateCandidates, topMerchants, topSmallSpends };
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
                            <span className="text-slate-400 font-medium flex items-center gap-1">Driftbudget (Utrymme) <Info size={10}/></span>
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

            {(unverifiedCount > 0 || unlinkedTransfersCount > 0 || analysisData.duplicateCandidates.length > 0 || incomeAlert) && (
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

            <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                <div className="flex justify-between items-start mb-3">
                    <div>
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Prognos (Månadsslut)</div>
                        <div className={cn("text-xl font-mono font-bold", budgetData.projectedDiff > 0 ? "text-rose-400" : "text-emerald-400")}>{formatMoney(budgetData.projectedTotal)}</div>
                    </div>
                    <div className={cn("text-xs px-2 py-1 rounded font-bold", budgetData.projectedDiff > 0 ? "bg-rose-500/20 text-rose-300" : "bg-emerald-500/20 text-emerald-300")}>{budgetData.projectedDiff > 0 ? '+' : ''}{formatMoney(budgetData.projectedDiff)} vs Budget</div>
                </div>
                <div className="text-xs text-slate-500">Baserat på budgeterade fasta kostnader och rörlig förbrukning.</div>
            </div>

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

            {/* DRILL DOWN MODAL: SAFE TO SPEND CALCULATION */}
            <Modal isOpen={isBudgetDrillDownOpen} onClose={() => setIsBudgetDrillDownOpen(false)} title="Beräkning: Kvar att använda">
                <div className="space-y-6">
                    <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                        <div className="flex justify-between items-end">
                            <div>
                                <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Totalt Utrymme</div>
                                <div className="text-3xl font-bold text-white font-mono">{formatMoney(budgetData.remaining)}</div>
                            </div>
                            <div className="text-right">
                                <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Per dag ({daysRemaining} d)</div>
                                <div className="text-xl font-bold text-emerald-400 font-mono">{formatMoney(Math.round(budgetData.safeToSpend))}</div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">Budgetgrupper</h3>
                        <div className="space-y-3">
                            {budgetData.groupBreakdown.map(group => (
                                <div key={group.id} className="bg-slate-900/50 p-3 rounded-xl border border-slate-800">
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex items-center gap-2">
                                            <span className="text-lg">{group.icon}</span>
                                            <div>
                                                <div className="font-bold text-white text-sm">{group.name}</div>
                                                <div className="text-[9px] uppercase tracking-wider flex items-center gap-1 mt-0.5">
                                                    {group.isFixed ? (
                                                        <span className="text-blue-400 flex items-center gap-0.5"><Calendar size={8}/> Fast</span>
                                                    ) : (
                                                        <span className="text-indigo-400 flex items-center gap-0.5"><Activity size={8}/> Rörlig</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className={cn("font-mono font-bold text-sm", group.disposable < 0 ? "text-rose-400" : "text-slate-200")}>
                                                {group.disposable > 0 ? '+' : ''}{formatMoney(group.disposable)}
                                            </div>
                                            <div className="text-[9px] text-slate-500">Bidrag till utrymme</div>
                                        </div>
                                    </div>
                                    
                                    <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                                        <span>Utfall: {formatMoney(group.spent)}</span>
                                        <span>Budget: {formatMoney(group.limit)}</span>
                                    </div>
                                    <BudgetProgressBar spent={group.spent} total={group.limit} compact />
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/50 text-xs text-slate-400 space-y-2">
                        <div className="flex items-start gap-2">
                            <Activity size={14} className="text-indigo-400 shrink-0 mt-0.5" />
                            <p><span className="text-white font-bold">Rörliga grupper:</span> Beräknas som <span className="text-slate-200 italic">Budget - Utfall</span>. Hela det kvarvarande beloppet räknas som tillgängligt att spendera.</p>
                        </div>
                        <div className="flex items-start gap-2">
                            <Calendar size={14} className="text-blue-400 shrink-0 mt-0.5" />
                            <p><span className="text-white font-bold">Fasta grupper:</span> Beräknas som <span className="text-slate-200 italic">Budget - max(Budget, Utfall)</span>. Pengarna anses reserverade. Endast om du går över budget minskar det ditt utrymme.</p>
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
