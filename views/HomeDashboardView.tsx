
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
    calculateFixedBucketCost,
    calculateDailyBucketCost,
    calculateGoalBucketCost
} from '../utils';
import { 
    differenceInDays, 
    startOfDay, 
    isAfter, 
    isBefore,
    parseISO, 
    format,
    differenceInMonths,
    subMonths
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
    ArrowDownRight
} from 'lucide-react';

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
        daysPassed = differenceInDays(today, start) + 1; // Count current day as passed for consumption purposes? Usually spending happens during day.
        // Let's say: If it is day 5, we have 5 days passed (including today).
        // If we want "Safe to spend TODAY", we treat today as part of the remaining budget.
        // So daysPassed = days from start to yesterday.
        // Actually, for "Safe to spend / day", we want Remaining / RemainingDays (including today).
        daysPassed = Math.max(0, differenceInDays(today, start)); // Completed days
    }
    
    const futureDays = Math.max(1, daysRemaining); // Avoid division by zero
    const timeProgress = Math.min(100, (daysPassed / totalDays) * 100);

    // --- 2. SAFE TO SPEND & FORECAST ---
    const budgetData = useMemo(() => {
        let totalLimit = 0;
        let totalSpent = 0;
        let totalProjected = 0;
        
        // Track specifically for Safe To Spend logic
        let unpaidFixedCosts = 0;

        // Fallback Keywords if forecastType is missing (Legacy support)
        const variableKeywords = ['mat', 'dryck', 'nöje', 'shopping', 'kläder', 'övrigt', 'rörlig', 'livsmedel'];
        const fixedKeywords = ['boende', 'hyra', 'avgift', 'lån', 'räkning', 'försäkring', 'abonnemang', 'bostad', 'el', 'bredband', 'fast', 'transport', 'bil', 'csn'];

        budgetGroups.forEach(group => {
            // A. CALCULATE LIMIT
            let limit = 0;
            const { data: explicitData } = getEffectiveBudgetGroupData(group, selectedMonth, budgetTemplates, monthConfigs);
            
            if (explicitData && !explicitData.isExplicitlyDeleted) {
                limit = explicitData.limit;
            } else if (group.linkedBucketIds && group.linkedBucketIds.length > 0) {
                // Legacy support for groups defined solely by buckets
                const fundingBuckets = buckets.filter(b => group.linkedBucketIds?.includes(b.id));
                limit = fundingBuckets.reduce((sum, b) => {
                    if (b.type === 'FIXED') return sum + calculateFixedBucketCost(b, selectedMonth);
                    if (b.type === 'DAILY') return sum + calculateDailyBucketCost(b, selectedMonth, settings.payday);
                    if (b.type === 'GOAL') return sum + calculateGoalBucketCost(b, selectedMonth);
                    return sum;
                }, 0);
            }

            // B. CALCULATE SPENT
            const assignedSubs = subCategories.filter(s => s.budgetGroupId === group.id).map(s => s.id);
            
            // Check Explicitly linked buckets (New System) + Legacy Linked Buckets
            const linkedBuckets = buckets.filter(b => {
                const isExplicit = b.budgetGroupId === group.id;
                const isLegacy = !b.budgetGroupId && group.linkedBucketIds?.includes(b.id);
                const isCatchAll = group.isCatchAll && !b.budgetGroupId && !isLegacy;
                return isExplicit || isLegacy || isCatchAll;
            });
            const linkedBucketIds = linkedBuckets.map(b => b.id);

            const groupTxs = transactions.filter(t => {
                if (t.isHidden) return false;
                if (t.date < startStr || t.date > endStr) return false;
                if (t.type === 'TRANSFER' || t.type === 'INCOME') return false; 
                if (t.amount >= 0) return false; 
                
                // Exclude GOAL spending from operating budget calc if desired? 
                // Usually Goals are separate, but if they are linked to a group, they are part of that group's spent.
                
                if (t.bucketId && linkedBucketIds.includes(t.bucketId)) return true;
                if (t.categorySubId && assignedSubs.includes(t.categorySubId)) return true;
                
                if (group.isCatchAll) {
                    // Catch-all: No bucket, no subcategory OR subcategory has no group
                    if (!t.bucketId && (!t.categorySubId || !subCategories.find(s => s.id === t.categorySubId)?.budgetGroupId)) return true;
                }
                return false;
            });

            const spent = groupTxs.reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);
            
            totalLimit += limit;
            totalSpent += spent;

            // C. DETERMINE TYPE
            let isFixedGroup = false;
            if (group.forecastType) {
                isFixedGroup = group.forecastType === 'FIXED';
            } else {
                // Heuristic Fallback
                const name = group.name.toLowerCase();
                if (variableKeywords.some(kw => name.includes(kw))) isFixedGroup = false;
                else if (fixedKeywords.some(kw => name.includes(kw))) isFixedGroup = true;
                else isFixedGroup = false; // Default to variable
            }

            // D. PROJECTION LOGIC
            if (isFixedGroup) {
                // FIXED:
                // Expect FULL limit to be used. If spent > limit, project spent.
                // Logic: A bill is binary. Paid or Not. 
                // If Paid (spent >= limit), cost is spent.
                // If Not Paid (spent < limit), cost is limit (we expect to pay it).
                
                const projectedForGroup = Math.max(spent, limit);
                totalProjected += projectedForGroup;

                // For "Safe To Spend":
                // If this is a FIXED group (bills), any remaining amount (limit - spent) is NOT safe to spend daily.
                // It is reserved for the bill.
                const remainingInGroup = Math.max(0, limit - spent);
                unpaidFixedCosts += remainingInGroup;

            } else {
                // VARIABLE:
                // Linear extrapolation.
                const dailyAverage = daysPassed > 0 ? spent / daysPassed : 0;
                
                // If we are early in the month (daysPassed < 5) and spent is 0, extrapolate might look weird (0).
                // In that case, maybe assume budget? 
                // Let's stick to pure linear but clamp to budget if 0 days passed?
                // Actually, pure linear is standard "Prognos".
                
                const projectedFuture = dailyAverage * futureDays;
                totalProjected += spent + projectedFuture;
            }
        });

        const globalRemaining = totalLimit - totalSpent;
        
        // "Safe To Spend" Logic:
        // We take the Global Remaining, subtract the money reserved for unpaid bills (Fixed groups).
        // Then divide by remaining days.
        const disposableRemaining = globalRemaining - unpaidFixedCosts;
        const safeToSpend = daysRemaining > 0 ? Math.max(0, disposableRemaining / daysRemaining) : 0;
        
        const projectedDiff = totalProjected - totalLimit;

        return { 
            totalLimit, 
            totalSpent, 
            remaining: globalRemaining, 
            safeToSpend, 
            projectedTotal: totalProjected, 
            projectedDiff 
        };
    }, [budgetGroups, transactions, startStr, endStr, buckets, subCategories, reimbursementMap, daysPassed, daysRemaining, futureDays, selectedMonth, settings.payday, budgetTemplates, monthConfigs]);

    // --- 3. ALERTS & ACTION ITEMS ---
    const unverifiedCount = transactions.filter(t => !t.isVerified && !t.isHidden).length;
    
    const unlinkedTransfersCount = transactions.filter(t => 
        !t.isHidden &&
        t.type === 'TRANSFER' && 
        (!t.bucketId || t.bucketId === 'INTERNAL') && 
        !t.linkedTransactionId &&
        t.date >= startStr &&
        t.date <= endStr
    ).length;

    const totalIncome = getTotalFamilyIncome(users, selectedMonth);
    const incomeAlert = totalIncome === 0 && daysPassed > 2;

    const subAlerts = useMemo(() => {
        const alerts: string[] = [];
        const activeSubs = detectedSubs.filter(s => !ignoredSubscriptions.some(i => i.id === s.name));
        activeSubs.forEach(sub => {
            const currentTx = sub.transactions.find(t => t.date >= startStr && t.date <= endStr && !t.isHidden);
            // STRICTLY Filter out Transfers/Payouts for alerts
            if (currentTx && currentTx.type !== 'TRANSFER' && currentTx.type !== 'INCOME') {
                const amount = Math.abs(currentTx.amount);
                if (amount > sub.avgAmount * 1.15) {
                    alerts.push(`${sub.name} är dyrare än vanligt (${formatMoney(amount)} vs snitt ${formatMoney(sub.avgAmount)})`);
                }
            }
        });
        return alerts;
    }, [detectedSubs, startStr, endStr, ignoredSubscriptions]);

    // --- 4. ADVANCED INSIGHTS CALCULATIONS ---
    const analysisData = useMemo(() => {
        const currentTxs = transactions.filter(t => 
            !t.isHidden &&
            t.date >= startStr && 
            t.date <= endStr
        );
        const expenseTxs = currentTxs.filter(t => t.type === 'EXPENSE' || (!t.type && t.amount < 0));

        // A. Duplicates
        const duplicateCandidates = [];
        const seenTx = new Set<string>();
        expenseTxs.forEach(t => {
            const key = `${t.date}-${Math.abs(t.amount)}-${t.description.trim()}`;
            if (seenTx.has(key)) {
                duplicateCandidates.push(t);
            }
            seenTx.add(key);
        });

        // Helper to clean names
        const cleanName = (desc: string) => {
            let name = desc.trim();
            const parts = name.split(' ');
            if (parts.length > 1) name = `${parts[0]} ${parts[1]}`;
            else name = parts[0];
            return name.replace(/AB|SE|Kortköp|Reserverat/gi, '').trim();
        };

        // B. Top Lists
        const merchantMap = new Map<string, number>();
        const merchantCountMap = new Map<string, number>();
        const smallTxMap = new Map<string, { total: number, count: number }>();

        expenseTxs.forEach(t => {
            const eff = Math.abs(getEffectiveAmount(t, reimbursementMap));
            if (eff === 0) return;
            
            const name = cleanName(t.description);
            merchantMap.set(name, (merchantMap.get(name) || 0) + eff);
            merchantCountMap.set(name, (merchantCountMap.get(name) || 0) + 1);

            if (eff < 200) {
                const current = smallTxMap.get(name) || { total: 0, count: 0 };
                smallTxMap.set(name, { total: current.total + eff, count: current.count + 1 });
            }
        });

        const topMerchants = Array.from(merchantMap.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, amount], i) => ({ rank: i+1, name, amount }));

        const frequentSpenders = Array.from(merchantCountMap.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, count], i) => ({ rank: i+1, name, count }));

        const topSmallSpends = Array.from(smallTxMap.entries())
            .sort((a, b) => b[1].total - a[1].total)
            .slice(0, 5)
            .map(([name, data], i) => ({ rank: i+1, name, amount: data.total, count: data.count }));

        // C. Inflation Check
        let inflationData = null;
        const groceryTxs = expenseTxs.filter(t => t.categorySubId === '201');
        const groceryCounts = new Map<string, number>();
        groceryTxs.forEach(t => {
            const n = cleanName(t.description);
            groceryCounts.set(n, (groceryCounts.get(n) || 0) + 1);
        });
        const topGrocery = Array.from(groceryCounts.entries()).sort((a,b) => b[1] - a[1])[0];
        
        if (topGrocery) {
            const merchantName = topGrocery[0];
            const currentStoreTxs = groceryTxs.filter(t => cleanName(t.description) === merchantName);
            const avgCurrent = currentStoreTxs.length > 0 
                ? currentStoreTxs.reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0) / currentStoreTxs.length 
                : 0;

            const prevStart = subMonths(start, 1);
            const prevEnd = subMonths(end, 1);
            const prevTxs = transactions.filter(t => 
                !t.isHidden &&
                t.date >= format(prevStart, 'yyyy-MM-dd') && 
                t.date <= format(prevEnd, 'yyyy-MM-dd') &&
                t.categorySubId === '201' &&
                cleanName(t.description) === merchantName
            );
            const avgPrev = prevTxs.length > 0 
                ? prevTxs.reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0) / prevTxs.length 
                : 0;

            if (avgPrev > 0) {
                inflationData = { store: merchantName, current: avgCurrent, prev: avgPrev, diff: avgCurrent - avgPrev };
            }
        }

        // D. Food Ratio
        const groceries = groceryTxs.reduce((s, t) => s + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);
        const restaurants = expenseTxs.filter(t => t.categorySubId === '202').reduce((s, t) => s + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);
        const foodRatio = groceries > 0 ? Math.round((restaurants / groceries) * 100) : 0;

        return { 
            duplicateCandidates, 
            topMerchants, 
            frequentSpenders, 
            topSmallSpends, 
            inflationData, 
            foodRatio 
        };

    }, [transactions, startStr, endStr, reimbursementMap, start, end]);

    // --- 5. MOTIVATION (Next Dream) ---
    const nextDream = useMemo(() => {
        const activeGoals = buckets.filter(b => b.type === 'GOAL' && !b.archivedDate && b.targetAmount > 0);
        if (activeGoals.length === 0) return null;

        const sorted = activeGoals.sort((a, b) => (a.targetDate || '9999') > (b.targetDate || '9999') ? 1 : -1);
        const goal = sorted[0];
        
        const saved = calculateSavedAmount(goal, selectedMonth);
        const percent = Math.min(100, (saved / goal.targetAmount) * 100);
        const monthsLeft = goal.targetDate ? differenceInMonths(parseISO(`${goal.targetDate}-01`), today) : 0;

        return { ...goal, saved, percent, monthsLeft };
    }, [buckets, selectedMonth, today]);

    const handleNavigateUnlinked = () => {
        const params = {
            viewMode: 'history',
            typeFilter: 'TRANSFER',
            transferScope: 'UNLINKED',
            dateFrom: startStr,
            dateTo: endStr
        };
        sessionStorage.setItem('nav_params_transactions', JSON.stringify(params));
        onNavigate('transactions');
    };

    return (
        <div className="space-y-6 pb-24 animate-in fade-in duration-500">
            
            {/* HEADER: TIME & SAFE TO SPEND */}
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

                <div className="bg-gradient-to-br from-indigo-600 to-blue-700 rounded-2xl p-6 text-white shadow-xl shadow-blue-900/20 relative overflow-hidden">
                    <div className="relative z-10">
                        <div className="text-blue-100 text-sm font-bold uppercase tracking-wider mb-1 flex items-center gap-2">
                            <Wallet size={16} /> Kvar att använda
                        </div>
                        <div className="flex items-baseline gap-2">
                            <h1 className="text-5xl font-bold font-mono tracking-tighter">
                                {formatMoney(Math.round(budgetData.safeToSpend))}
                            </h1>
                            <span className="text-lg font-medium text-blue-200">/ dag</span>
                        </div>
                        <p className="text-blue-200 text-xs mt-2 opacity-80">
                            Totalt {formatMoney(budgetData.remaining)} kvar av driftbudgeten.
                        </p>
                    </div>
                    <div className="absolute -right-6 -bottom-12 opacity-10">
                        <CreditCard size={160} />
                    </div>
                </div>
            </div>

            {/* ACTION CENTER */}
            {(unverifiedCount > 0 || unlinkedTransfersCount > 0 || analysisData.duplicateCandidates.length > 0 || incomeAlert || subAlerts.length > 0) && (
                <div className="space-y-3">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1 flex items-center gap-2">
                        <Zap size={12} className="text-yellow-400" /> Att Hantera
                    </h3>
                    
                    {analysisData.duplicateCandidates.length > 0 && (
                        <div 
                            onClick={() => setShowDuplicatesModal(true)}
                            className="bg-rose-950/20 p-4 rounded-xl border border-rose-500/30 flex items-center justify-between cursor-pointer hover:bg-rose-900/30 transition-colors animate-pulse"
                        >
                            <div className="flex items-center gap-3">
                                <div className="bg-rose-500/20 p-2 rounded-full text-rose-400"><Copy size={18} /></div>
                                <div>
                                    <div className="font-bold text-rose-300">Dubbla betalningar?</div>
                                    <div className="text-xs text-rose-400/70">{analysisData.duplicateCandidates.length} transaktioner ser identiska ut.</div>
                                </div>
                            </div>
                            <ChevronRight size={18} className="text-rose-500/50" />
                        </div>
                    )}

                    {unverifiedCount > 0 && (
                        <div 
                            onClick={() => onNavigate('transactions')}
                            className="bg-slate-800 p-4 rounded-xl border-l-4 border-l-purple-500 border-y border-r border-slate-700 flex justify-between items-center cursor-pointer hover:bg-slate-750 transition-colors"
                        >
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
                        <div 
                            onClick={handleNavigateUnlinked} 
                            className="bg-slate-800 p-4 rounded-xl border-l-4 border-l-orange-500 border-y border-r border-slate-700 flex justify-between items-center cursor-pointer hover:bg-slate-750"
                        >
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

                    {incomeAlert && (
                        <div className="bg-rose-950/30 p-4 rounded-xl border border-rose-500/30 flex items-center gap-3">
                            <AlertOctagon className="text-rose-500 shrink-0" size={24} />
                            <div>
                                <div className="font-bold text-rose-200">Ingen inkomst registrerad</div>
                                <div className="text-xs text-rose-300/70">Perioden har börjat men ingen lön syns.</div>
                            </div>
                        </div>
                    )}

                    {subAlerts.map((alert, i) => (
                        <div key={i} className="bg-indigo-900/30 p-3 rounded-xl border border-indigo-500/30 flex items-start gap-3">
                            <Repeat className="text-indigo-400 shrink-0 mt-0.5" size={16} />
                            <div className="text-sm text-indigo-200">{alert}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* FORECAST & BUDGET HEALTH */}
            <div className="grid grid-cols-1 gap-4">
                <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                    <div className="flex justify-between items-start mb-3">
                        <div>
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Prognos (Månadsslut)</div>
                            <div className={cn("text-xl font-mono font-bold", budgetData.projectedDiff > 0 ? "text-rose-400" : "text-emerald-400")}>
                                {formatMoney(budgetData.projectedTotal)}
                            </div>
                        </div>
                        <div className={cn("text-xs px-2 py-1 rounded font-bold", budgetData.projectedDiff > 0 ? "bg-rose-500/20 text-rose-300" : "bg-emerald-500/20 text-emerald-300")}>
                            {budgetData.projectedDiff > 0 ? '+' : ''}{formatMoney(budgetData.projectedDiff)} vs Budget
                        </div>
                    </div>
                    <div className="text-xs text-slate-500">
                        Baserat på om budgetgruppen är inställd på Fast eller Rörlig prognos.
                    </div>
                </div>
            </div>

            {/* EXTENDED INSIGHTS GRID */}
            <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Zap size={12} /> Snabba Insikter
                </h3>
                <div className="grid grid-cols-2 gap-3">
                    
                    {/* Card 1: Food Ratio */}
                    <div className="bg-slate-800 p-3 rounded-xl border border-slate-700 flex flex-col justify-between">
                        <div className="text-[10px] text-slate-500 uppercase font-bold mb-1 flex items-center gap-1">
                            <Utensils size={10} /> Matkvot
                        </div>
                        <div className={cn("text-lg font-bold", analysisData.foodRatio > 35 ? "text-rose-400" : "text-emerald-400")}>
                            {analysisData.foodRatio}%
                        </div>
                        <div className="text-[10px] text-slate-400">Restaurang vs Matbutik</div>
                    </div>

                    {/* Card 2: Inflation Check */}
                    {analysisData.inflationData ? (
                        <div className="bg-slate-800 p-3 rounded-xl border border-slate-700 flex flex-col justify-between">
                            <div className="text-[10px] text-slate-500 uppercase font-bold mb-1 flex items-center gap-1">
                                <TrendingUp size={10} /> Inflationskoll
                            </div>
                            <div className="flex items-baseline gap-1">
                                <span className={cn("text-sm font-bold", analysisData.inflationData.diff > 0 ? "text-rose-400" : "text-emerald-400")}>
                                    {analysisData.inflationData.diff > 0 ? "+" : ""}{Math.round(analysisData.inflationData.diff)}kr
                                </span>
                                <span className="text-[10px] text-slate-500">/ köp</span>
                            </div>
                            <div className="text-[10px] text-slate-400 truncate">{analysisData.inflationData.store}</div>
                        </div>
                    ) : (
                        <div className="bg-slate-800 p-3 rounded-xl border border-slate-700 flex flex-col justify-center items-center text-center opacity-50">
                            <TrendingUp size={16} className="mb-1 text-slate-500"/>
                            <div className="text-[10px] text-slate-500">Ingen inflationsdata</div>
                        </div>
                    )}

                    {/* Card 3: Small Expenses (Top 5) */}
                    <div className="bg-slate-800 p-3 rounded-xl border border-slate-700 col-span-2">
                        <div className="text-[10px] text-slate-500 uppercase font-bold mb-2 flex items-center gap-1">
                            <Coffee size={10} /> Småutgifter ("Lattefaktorn") &lt; 200kr
                        </div>
                        <div className="space-y-1.5">
                            {analysisData.topSmallSpends.map((item, i) => (
                                <div key={i} className="flex justify-between items-center text-xs border-b border-slate-700/50 pb-1 last:border-0 last:pb-0">
                                    <div className="flex items-center gap-2 overflow-hidden">
                                        <span className="text-slate-600 font-bold w-3">{item.rank}.</span>
                                        <span className="text-slate-300 truncate">{item.name}</span>
                                    </div>
                                    <span className="text-white font-mono">{formatMoney(item.amount)}</span>
                                </div>
                            ))}
                            {analysisData.topSmallSpends.length === 0 && <div className="text-xs text-slate-500 italic text-center">Inga småutgifter.</div>}
                        </div>
                    </div>

                    {/* Card 4: Money Magnets (Top 5 Total) */}
                    <div className="bg-slate-800 p-3 rounded-xl border border-slate-700 col-span-2">
                        <div className="text-[10px] text-slate-500 uppercase font-bold mb-2 flex items-center gap-1">
                            <Trophy size={10} /> Pengamagneterna (Störst totalbelopp)
                        </div>
                        <div className="space-y-1.5">
                            {analysisData.topMerchants.map((item, i) => (
                                <div key={i} className="flex justify-between items-center text-xs border-b border-slate-700/50 pb-1 last:border-0 last:pb-0">
                                    <div className="flex items-center gap-2 overflow-hidden">
                                        <span className={cn("font-bold w-3", i === 0 ? "text-amber-400" : "text-slate-600")}>{item.rank}.</span>
                                        <span className="text-slate-300 truncate">{item.name}</span>
                                    </div>
                                    <span className="text-white font-mono">{formatMoney(item.amount)}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Card 5: Creature of Habit (Top 5 Count) */}
                    <div className="bg-slate-800 p-3 rounded-xl border border-slate-700 col-span-2">
                        <div className="text-[10px] text-slate-500 uppercase font-bold mb-2 flex items-center gap-1">
                            <Repeat size={10} /> Vanedjuret (Flest köp)
                        </div>
                        <div className="space-y-1.5">
                            {analysisData.frequentSpenders.map((item, i) => (
                                <div key={i} className="flex justify-between items-center text-xs border-b border-slate-700/50 pb-1 last:border-0 last:pb-0">
                                    <div className="flex items-center gap-2 overflow-hidden">
                                        <span className="text-slate-600 font-bold w-3">{item.rank}.</span>
                                        <span className="text-slate-300 truncate">{item.name}</span>
                                    </div>
                                    <span className="text-purple-300 font-bold">{item.count} st</span>
                                </div>
                            ))}
                        </div>
                    </div>

                </div>
            </div>

            {/* MOTIVATION (NEXT DREAM) - Moved to bottom */}
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
                                <div className="flex items-center gap-2 text-purple-300 text-xs font-bold uppercase tracking-wider mb-1">
                                    <Rocket size={12} /> Nästa Mål
                                </div>
                                <h3 className="text-2xl font-bold text-white leading-none">{nextDream.name}</h3>
                            </div>
                            <div className="text-right">
                                <span className="text-2xl font-bold text-white">{Math.round(nextDream.percent)}%</span>
                            </div>
                        </div>
                        <div className="flex justify-between items-end">
                            <div className="text-xs text-slate-300">
                                {nextDream.monthsLeft <= 0 ? "Dags att köpa!" : `${nextDream.monthsLeft} månader kvar`}
                            </div>
                            <div className="text-xs font-mono text-purple-200">
                                {formatMoney(nextDream.saved)} / {formatMoney(nextDream.targetAmount)}
                            </div>
                        </div>
                        <div className="mt-2 h-1.5 w-full bg-slate-700/50 rounded-full overflow-hidden">
                            <div className="h-full bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.6)]" style={{ width: `${nextDream.percent}%` }}></div>
                        </div>
                    </div>
                </div>
            )}

            <div className="pt-4 border-t border-slate-800 text-center">
                <button onClick={() => onNavigate('dashboard')} className="text-xs text-blue-400 font-bold uppercase tracking-wider hover:text-blue-300 transition-colors">
                    Visa Fullständig Översikt →
                </button>
            </div>

            {/* DUPLICATE TRANSACTIONS MODAL */}
            <Modal isOpen={showDuplicatesModal} onClose={() => setShowDuplicatesModal(false)} title="Möjliga Dubbletter">
                <div className="space-y-4">
                    <p className="text-sm text-slate-300">
                        Följande transaktioner har samma datum, belopp och beskrivning. Kontrollera om de är dubbeldragningar.
                    </p>
                    <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                        {analysisData.duplicateCandidates.map((t, idx) => (
                            <div key={idx} className="bg-slate-800 p-3 rounded-lg border border-slate-700 flex justify-between items-center">
                                <div>
                                    <div className="font-bold text-white text-sm">{t.description}</div>
                                    <div className="text-xs text-slate-500">{t.date}</div>
                                </div>
                                <div className="font-mono text-rose-400 font-bold">{formatMoney(t.amount)}</div>
                            </div>
                        ))}
                    </div>
                    <div className="flex justify-end pt-2">
                        <Button onClick={() => setShowDuplicatesModal(false)}>Stäng</Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
