
import React, { useMemo, useState } from 'react';
import { useApp } from '../store';
import { useBudgetMonth } from '../hooks/useBudgetMonth';
import { formatMoney, getEffectiveBudgetGroupData, getBudgetInterval, calculateFixedBucketCost, calculateDailyBucketCost, calculateGoalBucketCost, getEffectiveBucketData, getTotalFamilyIncome, calculateSavedAmount, getUserIncome, calculateReimbursementMap, getEffectiveAmount, getEffectiveSubCategoryBudget, isBucketActiveInMonth } from '../utils';
import { 
    PieChart, Pie, Cell, Tooltip, ResponsiveContainer, 
    ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Area, Legend,
    Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
    BarChart, Line
} from 'recharts';
import { ChevronRight, ChevronDown, Edit2, Check, AlertTriangle, TrendingUp, TrendingDown, Calendar, BarChart3, PieChart as PieIcon, Filter, Info, Plane, X, Sparkles, Zap, Trophy, ShoppingBag, Layers, Clock, DollarSign, Activity, Target, Coffee, Repeat, ArrowRight, ArrowUpRight, ArrowDownRight, AlertOctagon, Utensils, Search, Percent, ThermometerSnowflake, Rocket, Wallet, PiggyBank, LayoutGrid, Eye, EyeOff, Bot, Calculator, Shield, Flame, Gem } from 'lucide-react';
import { BudgetProgressBar } from '../components/BudgetProgressBar';
// Added Card to the imported components from '../components/components'
import { cn, Button, Modal, Card } from '../components/components';
import { BudgetGroup, Bucket, Transaction, MainCategory, SubCategory, Account } from '../types';
import { format, subMonths, parseISO, differenceInDays, startOfDay, endOfDay, areIntervalsOverlapping, addDays, isValid, startOfMonth, endOfMonth, addMonths, getDay, startOfWeek, endOfWeek, subWeeks, getISOWeek, getDate, getDaysInMonth, eachDayOfInterval, subDays, subYears, isAfter, isBefore, isSameMonth } from 'date-fns';
import { sv } from 'date-fns/locale';
import { generateMonthlyReport, FinancialSnapshot } from '../services/aiService';
import { EmojiPickerModal } from '../components/EmojiPicker';

// --- SUB-COMPONENT: GROUPED DRILL DOWN (For Expenses) ---
const GroupedDrillDown: React.FC<{ 
    transactions: Transaction[]; 
    mainCategories: MainCategory[]; 
    subCategories: SubCategory[];
    reimbursementMap: Record<string, number>;
}> = ({ transactions, mainCategories, subCategories, reimbursementMap }) => {
    const [expandedMains, setExpandedMains] = useState<Set<string>>(new Set());
    const [expandedSubs, setExpandedSubs] = useState<Set<string>>(new Set());

    const toggleMain = (id: string) => {
        const next = new Set(expandedMains);
        if (next.has(id)) next.delete(id); else next.add(id);
        setExpandedMains(next);
    };

    const toggleSub = (id: string) => {
        const next = new Set(expandedSubs);
        if (next.has(id)) next.delete(id); else next.add(id);
        setExpandedSubs(next);
    };

    // Grouping Logic
    const groupedData = useMemo(() => {
        const mainsMap = new Map<string, {
            id: string;
            name: string;
            total: number;
            subs: Map<string, { id: string; name: string; total: number; transactions: Transaction[] }>;
        }>();

        transactions.forEach(t => {
            if (t.isHidden) return; 
            
            const effAmount = getEffectiveAmount(t, reimbursementMap);
            if (effAmount === 0 && Math.abs(t.amount) > 0) return; 

            const mainId = t.categoryMainId || 'uncat';
            const subId = t.categorySubId || 'uncat-sub';
            
            if (!mainsMap.has(mainId)) {
                const mainCat = mainCategories.find(m => m.id === mainId);
                mainsMap.set(mainId, {
                    id: mainId,
                    name: mainCat ? mainCat.name : (mainId === 'uncat' ? 'Okategoriserat' : 'Okänd Huvudkategori'),
                    total: 0,
                    subs: new Map()
                });
            }

            const mainEntry = mainsMap.get(mainId)!;
            mainEntry.total += Math.abs(effAmount);

            if (!mainEntry.subs.has(subId)) {
                const subCat = subCategories.find(s => s.id === subId);
                mainEntry.subs.set(subId, {
                    id: subId,
                    name: subCat ? subCat.name : (subId === 'uncat-sub' ? 'Övrigt / Ospecificerat' : 'Okänd Underkategori'),
                    total: 0,
                    transactions: []
                });
            }

            const subEntry = mainEntry.subs.get(subId)!;
            subEntry.total += Math.abs(effAmount);
            subEntry.transactions.push(t);
        });

        return Array.from(mainsMap.values())
            .map(m => ({
                ...m,
                subs: Array.from(m.subs.values()).sort((a, b) => b.total - a.total)
            }))
            .sort((a, b) => b.total - a.total);

    }, [transactions, mainCategories, subCategories, reimbursementMap]);

    if (groupedData.length === 0) {
        return <div className="text-center text-slate-500 py-8 italic">Inga utgifter att visa.</div>;
    }

    return (
        <div className="space-y-2">
            {groupedData.map(main => {
                const isMainExpanded = expandedMains.has(main.id);
                return (
                    <div key={main.id} className="bg-slate-800/50 rounded-lg border border-slate-700 overflow-hidden">
                        <div 
                            className="flex justify-between items-center p-3 cursor-pointer hover:bg-slate-800 transition-colors"
                            onClick={() => toggleMain(main.id)}
                        >
                            <div className="flex items-center gap-2">
                                {isMainExpanded ? <ChevronDown size={16} className="text-blue-400" /> : <ChevronRight size={16} className="text-slate-500" />}
                                <span className="font-medium text-white">{main.name}</span>
                            </div>
                            <span className="font-mono text-white text-sm">{formatMoney(main.total)}</span>
                        </div>

                        {isMainExpanded && (
                            <div className="bg-slate-900/50 border-t border-slate-700/50 pb-2">
                                {main.subs.map(sub => {
                                    const subKey = `${main.id}-${sub.id}`;
                                    const isSubExpanded = expandedSubs.has(subKey);
                                    
                                    return (
                                        <div key={subKey} className="flex flex-col">
                                            <div 
                                                className="flex justify-between items-center px-4 py-2 text-xs cursor-pointer hover:bg-white/5"
                                                onClick={() => toggleSub(subKey)}
                                            >
                                                <div className="flex items-center gap-2 pl-4">
                                                    {isSubExpanded ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronRight size={14} className="text-slate-500" />}
                                                    <span className="text-slate-300 font-medium">{sub.name}</span>
                                                </div>
                                                <span className="text-slate-300 font-mono">{formatMoney(sub.total)}</span>
                                            </div>

                                            {isSubExpanded && (
                                                <div className="bg-black/20 pl-12 pr-4 py-2 space-y-1 border-t border-white/5">
                                                    {sub.transactions.map(t => {
                                                        const eff = getEffectiveAmount(t, reimbursementMap);
                                                        return (
                                                            <div key={t.id} className="flex justify-between items-center text-[10px] py-1 border-b border-white/5 last:border-0">
                                                                <div className="flex flex-col max-w-[70%]">
                                                                    <span className="text-slate-400 truncate">{t.description}</span>
                                                                    <span className="text-slate-600">{t.date}</span>
                                                                </div>
                                                                <span className="text-slate-400 font-mono">{formatMoney(eff)}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

const SimpleMarkdownRenderer = ({ text }: { text: string }) => {
    const lines = text.split('\n');
    return (
        <div className="space-y-3 text-slate-300 text-sm leading-relaxed">
            {lines.map((line, i) => {
                const trimmed = line.trim();
                if (!trimmed) return <div key={i} className="h-2" />;
                if (trimmed.startsWith('## ')) return <h3 key={i} className="text-lg font-bold text-white mt-4 mb-2">{trimmed.replace('## ', '')}</h3>;
                if (trimmed.startsWith('# ')) return <h2 key={i} className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400 mt-6 mb-3">{trimmed.replace('# ', '')}</h2>;
                if (trimmed.startsWith('### ')) return <h4 key={i} className="text-base font-bold text-blue-200 mt-3">{trimmed.replace('### ', '')}</h4>;
                if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                    const content = trimmed.substring(2);
                    return (
                        <div key={i} className="flex gap-2 pl-2">
                            <span className="text-blue-500 mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0 block" />
                            <span dangerouslySetInnerHTML={{ __html: parseBold(content) }} />
                        </div>
                    );
                }
                if (/^\d+\./.test(trimmed)) {
                     return (
                        <div key={i} className="pl-2 font-medium text-white mt-2">
                            <span dangerouslySetInnerHTML={{ __html: parseBold(trimmed) }} />
                        </div>
                    );
                }
                if (trimmed.startsWith('|')) {
                    const cells = trimmed.split('|').filter(c => c.trim() !== '');
                    if (trimmed.includes('---')) return null; 
                    return (
                        <div key={i} className="grid grid-cols-4 gap-2 text-xs border-b border-slate-700 py-1">
                            {cells.map((c, idx) => (
                                <div key={idx} className={cn("truncate", idx === 0 && "font-bold text-slate-200")}>{c.trim()}</div>
                            ))}
                        </div>
                    )
                }
                return <p key={i} dangerouslySetInnerHTML={{ __html: parseBold(trimmed) }} />;
            })}
        </div>
    );
};

const parseBold = (text: string) => text.replace(/\*\*(.*?)\*\*/g, '<b class="text-white">$1</b>');

const BudgetGroupStats = ({ selectedMonth }: { selectedMonth: string }) => {
    const { budgetGroups, subCategories, transactions, buckets, settings, mainCategories, users, budgetTemplates, monthConfigs, updateBudgetGroup } = useApp();
    const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
    const [drillDownData, setDrillDownData] = useState<{ title: string, transactions: Transaction[], grouped?: boolean } | null>(null);
    const [timeframe, setTimeframe] = useState<1 | 3 | 6 | 12>(1);
    const [excludeDreams, setExcludeDreams] = useState(false);
    
    const [budgetBreakdownData, setBudgetBreakdownData] = useState<{ 
        groupName: string; 
        items: { name: string; amount: number; type: 'SUB'|'BUCKET'|'BUFFER' }[];
        total: number;
    } | null>(null);

    const [isAiModalOpen, setIsAiModalOpen] = useState(false);
    const [aiReport, setAiReport] = useState<string>('');
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [iconPickerTarget, setIconPickerTarget] = useState<BudgetGroup | null>(null);

    const reimbursementMap = useMemo(() => calculateReimbursementMap(transactions), [transactions]);

    const data = useMemo(() => {
        let targetEndMonth = selectedMonth; 
        if (timeframe > 1) targetEndMonth = format(subMonths(parseISO(`${selectedMonth}-01`), 1), 'yyyy-MM');
        const { start, end } = getBudgetInterval(targetEndMonth, settings.payday);
        const monthsBack = timeframe - 1;
        const startMonthKey = format(subMonths(parseISO(`${targetEndMonth}-01`), monthsBack), 'yyyy-MM');
        const startDateObj = getBudgetInterval(startMonthKey, settings.payday).start;
        const startStr = format(startDateObj, 'yyyy-MM-dd');
        const endStr = format(end, 'yyyy-MM-dd');
        const rangeLabel = timeframe === 1 
            ? format(parseISO(`${selectedMonth}-01`), 'MMMM yyyy', { locale: sv })
            : `${format(startDateObj, 'MMM', { locale: sv })} - ${format(end, 'MMM yyyy', { locale: sv })}`;

        // Correct assignment map
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

        const relevantTx = transactions.filter(t => {
            if (t.isHidden || t.date < startStr || t.date > endStr) return false;
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
            const groupBucketIds = new Set(groupToBuckets.get(group.id) || []);

            let plannedBudget = 0;
            const budgetItems: { name: string; amount: number; type: 'SUB'|'BUCKET'|'BUFFER' }[] = [];

            if (timeframe === 1) {
                const { data: explicitData } = getEffectiveBudgetGroupData(group, selectedMonth, budgetTemplates, monthConfigs);
                const manualLimit = explicitData ? explicitData.limit : 0;
                let childrenSum = 0;

                assignedSubs.forEach(sub => {
                    const subBudget = getEffectiveSubCategoryBudget(sub, selectedMonth, budgetTemplates, monthConfigs);
                    childrenSum += subBudget;
                    if (subBudget > 0) budgetItems.push({ name: sub.name, amount: subBudget, type: 'SUB' });
                });

                buckets.filter(b => groupBucketIds.has(b.id)).forEach(b => {
                    let cost = 0;
                    if (b.type === 'FIXED') cost = calculateFixedBucketCost(b, selectedMonth);
                    else if (b.type === 'DAILY') cost = calculateDailyBucketCost(b, selectedMonth, settings.payday);
                    else if (b.type === 'GOAL') {
                        // Project Budget Calculation
                        const { start: budgetStart } = getBudgetInterval(selectedMonth, settings.payday);
                        const currentStartStr = format(budgetStart, 'yyyy-MM-dd');
                        const pastSpent = transactions
                            .filter(t => !t.isHidden && t.bucketId === b.id && t.date < currentStartStr && (t.type === 'EXPENSE' || (!t.type && t.amount < 0)))
                            .reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);
                        const remainingProj = Math.max(0, b.targetAmount - pastSpent);
                        const isVisible = (remainingProj > 0 && isBucketActiveInMonth(b, selectedMonth)) || transactions.some(t => t.bucketId === b.id && t.date >= startStr && t.date <= endStr && !t.isHidden);
                        if (isVisible) cost = remainingProj;
                    }

                    if (cost > 0 || (b.type !== 'GOAL' && isBucketActiveInMonth(b, selectedMonth))) {
                        childrenSum += cost;
                        budgetItems.push({ name: b.name, amount: cost, type: 'BUCKET' });
                    }
                });

                plannedBudget = Math.max(childrenSum, manualLimit);
                if (manualLimit > childrenSum) budgetItems.push({ name: 'Buffert / Ospecificerat', amount: manualLimit - childrenSum, type: 'BUFFER' });

            } else {
                let totalOverPeriod = 0;
                for (let i = 0; i < timeframe; i++) {
                    const mDate = addMonths(parseISO(`${startMonthKey}-01`), i);
                    const mKey = format(mDate, 'yyyy-MM');
                    const { data: gData } = getEffectiveBudgetGroupData(group, mKey, budgetTemplates, monthConfigs);
                    const mLimit = gData ? gData.limit : 0;
                    let mChildren = 0;
                    assignedSubs.forEach(s => mChildren += getEffectiveSubCategoryBudget(s, mKey, budgetTemplates, monthConfigs));
                    buckets.filter(b => groupBucketIds.has(b.id)).forEach(b => {
                         if (b.type === 'FIXED') mChildren += calculateFixedBucketCost(b, mKey);
                         else if (b.type === 'DAILY') mChildren += calculateDailyBucketCost(b, mKey, settings.payday);
                         else if (b.type === 'GOAL' && b.targetAmount > 0) {
                             const { start: mStart } = getBudgetInterval(mKey, settings.payday);
                             const pastSpent = transactions.filter(t => !t.isHidden && t.bucketId === b.id && t.date < format(mStart, 'yyyy-MM-dd')).reduce((s, t) => s + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);
                             const rem = Math.max(0, b.targetAmount - pastSpent);
                             if (isBucketActiveInMonth(b, mKey)) mChildren += rem;
                         }
                    });
                    totalOverPeriod += Math.max(mChildren, mLimit);
                }
                plannedBudget = totalOverPeriod / timeframe;
            }

            const groupTxs = relevantTx.filter(t => {
                if (t.bucketId) {
                    if (groupBucketIds.has(t.bucketId)) return true;
                    if (group.isCatchAll) return !assignedBucketIds.has(t.bucketId);
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
            const avgSpent = spent / timeframe;
            
            const breakdown = assignedSubs.map(sub => {
                const subTxs = groupTxs.filter(t => !t.bucketId && t.categorySubId === sub.id);
                const subSpent = subTxs.reduce((s, t) => s + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);
                return { ...sub, spent: subSpent / timeframe, transactions: subTxs.sort((a,b) => b.date.localeCompare(a.date)) };
            }).sort((a,b) => b.spent - a.spent);

            const totalSubSpent = breakdown.reduce((sum, s) => sum + s.spent, 0);
            
            const bucketBreakdown = buckets.filter(b => groupBucketIds.has(b.id)).map(b => {
                const bTxs = groupTxs.filter(t => t.bucketId === b.id);
                const bSpent = bTxs.reduce((s, t) => s + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);
                return { id: b.id, name: b.name, spent: bSpent / timeframe, transactions: bTxs.sort((a,b) => b.date.localeCompare(a.date)), type: 'BUCKET', bucketType: b.type, icon: b.icon };
            }).filter(b => b.spent > 0);

            const totalBucketSpent = bucketBreakdown.reduce((sum, b) => sum + b.spent, 0);
            const unclassifiedSpent = avgSpent - totalSubSpent - totalBucketSpent;
            
            return {
                ...group, 
                spent: avgSpent, 
                limit: plannedBudget, 
                remaining: plannedBudget - avgSpent,
                breakdown,
                bucketBreakdown,
                unclassifiedSpent, 
                unclassifiedTransactions: groupTxs.filter(t => (t.bucketId ? !groupBucketIds.has(t.bucketId) : !assignedSubIds.has(t.categorySubId || ''))).sort((a,b) => b.date.localeCompare(a.date)),
                budgetItems
            };
        }).sort((a, b) => b.spent - a.spent);

        const totalLimit = groupStats.reduce((sum, g) => sum + g.limit, 0);
        const totalSpent = groupStats.reduce((sum, g) => sum + g.spent, 0);
        
        return { groupStats, totalLimit, totalSpent, totalRemaining: totalLimit - totalSpent, rangeLabel };
    }, [budgetGroups, subCategories, transactions, selectedMonth, timeframe, excludeDreams, buckets, settings.payday, reimbursementMap, budgetTemplates, monthConfigs]);

    const handleShowBudgetBreakdown = (groupName: string, items: { name: string; amount: number; type: 'SUB'|'BUCKET'|'BUFFER' }[], total: number) => {
        setBudgetBreakdownData({ groupName, items: [...items].sort((a, b) => b.amount - a.amount), total });
    };

    const handleAiAnalysis = async () => {
        setIsAiModalOpen(true);
        if (aiReport) return; 
        setIsAiLoading(true);
        try {
            const totalIncome = getTotalFamilyIncome(users, selectedMonth);
            const currentGroups = data.groupStats.map(g => ({ name: g.name, limit: g.limit, spent: g.spent }));
            const { start, end } = getBudgetInterval(selectedMonth, settings.payday);
            const currentTxs = transactions.filter(t => !t.isHidden && t.date >= format(start, 'yyyy-MM-dd') && t.date <= format(end, 'yyyy-MM-dd') && (t.type === 'EXPENSE' || t.amount < 0));
            const transactionLog = currentTxs.map(t => {
                const amount = Math.abs(getEffectiveAmount(t, reimbursementMap));
                if (amount === 0) return null;
                const mainName = mainCategories.find(m => m.id === t.categoryMainId)?.name || 'Övrigt';
                const subName = subCategories.find(s => s.id === t.categorySubId)?.name || '';
                return `${t.date} : ${formatMoney(amount)} : ${t.description} : ${subName ? `${mainName} > ${subName}` : mainName}`;
            }).filter(Boolean).join('\n');
            const catMapCurrent = new Map<string, number>();
            currentTxs.forEach(t => {
                const amt = Math.abs(getEffectiveAmount(t, reimbursementMap));
                if(amt > 0) {
                    const mName = mainCategories.find(m => m.id === t.categoryMainId)?.name || 'Övrigt';
                    const sName = subCategories.find(s => s.id === t.categorySubId)?.name || 'Ospecificerat';
                    const key = `${mName}|${sName}`;
                    catMapCurrent.set(key, (catMapCurrent.get(key) || 0) + amt);
                }
            });
            const breakdownCurrent = Array.from(catMapCurrent.entries()).map(([k, v]) => {
                const [main, sub] = k.split('|');
                return { main, sub, amount: v };
            }).sort((a,b) => b.amount - a.amount);
            const topExpenses = currentTxs.map(t => ({ name: t.description, amount: Math.abs(getEffectiveAmount(t, reimbursementMap)) })).sort((a,b) => b.amount - a.amount).slice(0, 5);
            const snapshot: FinancialSnapshot = { totalIncome, budgetGroups: currentGroups, topExpenses, categoryBreakdownCurrent: breakdownCurrent, transactionLog, monthLabel: data.rangeLabel };
            setAiReport(await generateMonthlyReport(snapshot));
        } catch (error) {
            setAiReport("Kunde inte skapa analysen just nu.");
        } finally {
            setIsAiLoading(false);
        }
    };

    const handleIconSelect = async (emoji: string) => {
        if (!iconPickerTarget) return;
        await updateBudgetGroup({ ...iconPickerTarget, icon: emoji });
        setIconPickerTarget(null);
    };

    const pieData = data.groupStats.filter(g => g.spent > 0).map(g => ({ name: g.name, value: g.spent }));
    const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6', '#f43f5e', '#8b5cf6'];

    return (
        <div className="space-y-6 animate-in fade-in">
             <div className="flex flex-col gap-2">
                 <div className="flex flex-wrap gap-2 items-center justify-between bg-slate-900/50 p-3 rounded-xl border border-slate-700">
                     <div className="flex gap-1 bg-slate-800 rounded-lg p-1">
                         {[1, 3, 6, 12].map(m => (
                             <button key={m} onClick={() => setTimeframe(m as any)} className={cn("px-3 py-1.5 text-xs font-bold rounded-md transition-all", timeframe === m ? "bg-blue-600 text-white shadow" : "text-slate-400 hover:text-white hover:bg-slate-700")}>{m === 1 ? 'Denna månad' : `Snitt ${m} mån`}</button>
                         ))}
                     </div>
                     <div className="flex gap-2">
                        <button onClick={handleAiAnalysis} className="px-3 py-2 text-xs font-bold rounded-lg flex items-center gap-2 transition-all bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 text-white shadow-lg border border-white/10">
                            <Bot size={16} /> AI Analys
                        </button>
                        <button onClick={() => setExcludeDreams(!excludeDreams)} className={cn("px-3 py-2 text-xs font-bold rounded-lg flex items-center gap-2 border transition-all", excludeDreams ? "bg-purple-500/20 border-purple-500 text-purple-300" : "bg-slate-800 border-slate-700 text-slate-400 hover:text-white")}><Plane size={14} />{excludeDreams ? 'Resor Exkluderade' : 'Inkludera Resor'}</button>
                     </div>
                 </div>
                 <div className="text-center text-xs text-slate-400 bg-slate-800/30 rounded-lg py-1 border border-slate-700/50">Beräkningsperiod: <span className="text-white font-medium">{data.rangeLabel}</span></div>
             </div>
            <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700/50 flex flex-col justify-center text-center">
                    <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">Budget</div>
                    <div className="text-lg md:text-xl font-mono text-white font-bold truncate">{formatMoney(data.totalLimit)}</div>
                </div>
                <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700/50 flex flex-col justify-center text-center">
                    <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">{timeframe > 1 ? 'Snitt Utfall' : 'Utfall'}</div>
                    <div className="text-lg md:text-xl font-mono text-white font-bold truncate">{formatMoney(data.totalSpent)}</div>
                </div>
                <div className={cn("p-3 rounded-xl border flex flex-col justify-center text-center", data.totalRemaining >= 0 ? "bg-emerald-950/30 border-emerald-500/30" : "bg-rose-950/30 border-rose-500/30")}>
                    <div className={cn("text-[10px] uppercase font-bold tracking-wider mb-1", data.totalRemaining >= 0 ? "text-emerald-400" : "text-rose-400")}>Resultat</div>
                    <div className={cn("text-lg md:text-xl font-mono font-bold truncate", data.totalRemaining >= 0 ? "text-emerald-300" : "text-rose-300")}>{data.totalRemaining > 0 && "+"}{formatMoney(data.totalRemaining)}</div>
                </div>
            </div>
            <div className="h-64 relative bg-slate-900/30 rounded-xl border border-slate-700/50 p-2">
                {pieData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                                {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                            </Pie>
                            <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#fff' }} itemStyle={{ color: '#fff' }} formatter={(value: number) => formatMoney(value)} />
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
            <div className="space-y-4">
                <div className="flex justify-between items-center px-2"><h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Budgetgrupper</h2></div>
                {data.groupStats.map(group => {
                    const isExpanded = expandedGroup === group.id;
                    const hasOverspend = group.remaining < 0;
                    return (
                        <div key={group.id} className={cn("bg-surface border rounded-xl overflow-hidden transition-all duration-300", group.isCatchAll ? "border-dashed border-slate-600" : "border-slate-700")}>
                            <div className="p-4 cursor-pointer hover:bg-slate-800/50 transition-colors" onClick={() => setExpandedGroup(isExpanded ? null : group.id)}>
                                <div className="flex justify-between items-center mb-2">
                                    <div className="flex items-center gap-3">
                                        {isExpanded ? <ChevronDown size={18} className="text-blue-400"/> : <ChevronRight size={18} className="text-slate-500"/>}
                                        <div>
                                            <div className="font-bold text-lg text-white flex items-center gap-2">
                                                <button 
                                                    className="hover:bg-slate-700/50 p-1 rounded transition-colors active:scale-90"
                                                    onClick={(e) => { e.stopPropagation(); setIconPickerTarget(group); }}
                                                >
                                                    {group.icon || '📁'}
                                                </button>
                                                <span>{group.name}</span>
                                                {hasOverspend && <AlertTriangle size={14} className="text-rose-500" />}
                                            </div>
                                            {group.isCatchAll && <div className="text-[10px] text-orange-400 uppercase font-bold">Obudgeterat / Övrigt</div>}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="flex items-center justify-end gap-2 group/edit">
                                            <div className="text-sm font-mono font-bold text-white">
                                                {formatMoney(group.spent)}
                                                <span className="text-slate-500 font-normal text-xs mx-1">/</span>
                                                <span 
                                                    onClick={(e) => { 
                                                        e.stopPropagation(); 
                                                        if (timeframe === 1) handleShowBudgetBreakdown(group.name, group.budgetItems, group.limit);
                                                    }}
                                                    className={cn("text-slate-400 text-xs", timeframe === 1 && "cursor-pointer hover:text-blue-400 hover:underline")}
                                                    title={timeframe === 1 ? "Visa budgetdetaljer" : ""}
                                                >
                                                    {formatMoney(group.limit)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <BudgetProgressBar spent={group.spent} total={group.limit} compact />
                            </div>
                            {isExpanded && (
                                <div className="bg-slate-900/30 border-t border-slate-700/50 animate-in slide-in-from-top-2">
                                    {group.breakdown.map(sub => (
                                        <div key={sub.id} onClick={() => setDrillDownData({ title: sub.name, transactions: sub.transactions, grouped: false })} className="p-3 border-b border-slate-700/30 last:border-0 hover:bg-slate-800 transition-colors flex justify-between items-center cursor-pointer group">
                                            <div className="flex items-center gap-2">
                                                <span className="text-lg">{sub.icon || (sub.isSavings ? '💰' : '💳')}</span>
                                                <span className="text-sm text-slate-300 group-hover:text-blue-300 transition-colors">{sub.name}</span>
                                            </div>
                                            <span className="text-sm font-mono text-white">{formatMoney(sub.spent)}</span>
                                        </div>
                                    ))}
                                    {group.bucketBreakdown.map(bucket => (
                                        <div key={bucket.id} onClick={() => setDrillDownData({ title: bucket.name, transactions: bucket.transactions, grouped: true })} className="p-3 border-b border-slate-700/30 last:border-0 hover:bg-slate-800 transition-colors flex justify-between items-center cursor-pointer group bg-indigo-900/10">
                                            <div className="flex items-center gap-2">
                                                {bucket.icon ? (
                                                    <span className="text-lg">{bucket.icon}</span>
                                                ) : (
                                                    bucket.bucketType === 'GOAL' ? <Target size={14} className="text-purple-400"/> : <Calendar size={14} className="text-blue-400"/>
                                                )}
                                                <span className="text-sm text-slate-300 group-hover:text-blue-300 transition-colors">{bucket.name}</span>
                                            </div>
                                            <span className="text-sm font-mono text-white">{formatMoney(bucket.spent)}</span>
                                        </div>
                                    ))}
                                    {group.unclassifiedSpent > 0.01 && (
                                        <div onClick={() => setDrillDownData({ title: "Ospecificerat", transactions: group.unclassifiedTransactions, grouped: true })} className="p-3 border-b border-slate-700/30 flex justify-between items-center bg-slate-800/20 hover:bg-slate-800/40 cursor-pointer group">
                                            <span className="text-sm text-slate-400 italic group-hover:text-slate-200">Ospecificerat / Saknar underkategori</span>
                                            <span className="text-sm font-mono text-slate-400">{formatMoney(group.unclassifiedSpent)}</span>
                                        </div>
                                    )}
                                    {group.breakdown.length === 0 && group.bucketBreakdown.length === 0 && group.unclassifiedSpent < 0.01 && <div className="p-4 text-center text-xs text-slate-500 italic">Inga utgifter här än.</div>}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
            
            <EmojiPickerModal 
                isOpen={!!iconPickerTarget} 
                onClose={() => setIconPickerTarget(null)} 
                onSelect={handleIconSelect}
                title={iconPickerTarget ? `Ikon för ${iconPickerTarget.name}` : undefined}
            />

            <Modal isOpen={!!drillDownData} onClose={() => setDrillDownData(null)} title={drillDownData?.title || 'Transaktioner'}>
                {drillDownData?.grouped ? (
                    <GroupedDrillDown transactions={drillDownData.transactions} mainCategories={mainCategories} subCategories={subCategories} reimbursementMap={reimbursementMap} />
                ) : (
                    <div className="space-y-2">
                        {drillDownData?.transactions && drillDownData.transactions.length > 0 ? (
                            drillDownData.transactions.map(t => {
                                const eff = getEffectiveAmount(t, reimbursementMap);
                                if (eff === 0 && Math.abs(t.amount) > 0) return null; 
                                return (
                                    <div key={t.id} className="flex justify-between items-center p-3 bg-slate-900/50 border border-slate-800 rounded-lg">
                                        <div className="flex-1 mr-4 overflow-hidden">
                                            <div className="text-white font-medium truncate">{t.description}</div>
                                            <div className="text-xs text-slate-500">{t.date}</div>
                                        </div>
                                        <div className={cn("font-mono font-bold whitespace-nowrap", eff > 0 ? "text-emerald-400" : "text-white")}>
                                            {eff > 0 ? '+' : ''}{formatMoney(eff)}
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="text-center text-slate-500 py-8 italic">Inga transaktioner hittades för denna period.</div>
                        )}
                    </div>
                )}
                <div className="mt-4 border-t border-slate-700 pt-4 flex justify-end"><Button variant="secondary" onClick={() => setDrillDownData(null)}>Stäng</Button></div>
            </Modal>
            <Modal isOpen={!!budgetBreakdownData} onClose={() => setBudgetBreakdownData(null)} title={`Budget: ${budgetBreakdownData?.groupName}`}>
                <div className="space-y-4">
                    <div className="flex justify-between items-center bg-slate-800 p-4 rounded-xl border border-slate-700">
                        <span className="text-slate-400 text-sm font-medium uppercase tracking-wider">Total Budget</span>
                        <span className="text-2xl font-bold text-white font-mono">{formatMoney(budgetBreakdownData?.total || 0)}</span>
                    </div>
                    <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                        <p className="text-xs text-slate-500 uppercase font-bold tracking-wider px-1">Sammansättning</p>
                        {budgetBreakdownData?.items.map((item, idx) => (
                            <div key={idx} className="flex justify-between items-center p-3 bg-slate-900/50 border border-slate-800 rounded-lg">
                                <div className="flex items-center gap-2">
                                    <span className="text-white font-medium text-sm">{item.name}</span>
                                    {item.type === 'BUCKET' && <span className="text-[9px] bg-blue-900/50 text-blue-300 px-1.5 py-0.5 rounded border border-blue-900">Fast Post</span>}
                                    {item.type === 'BUFFER' && <span className="text-[9px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded border border-slate-600">Buffert</span>}
                                </div>
                                <span className="font-mono font-bold text-white">{formatMoney(item.amount)}</span>
                            </div>
                        ))}
                    </div>
                    <div className="mt-2 flex justify-end">
                        <Button variant="secondary" onClick={() => setBudgetBreakdownData(null)}>Stäng</Button>
                    </div>
                </div>
            </Modal>
            <Modal isOpen={isAiModalOpen} onClose={() => setIsAiModalOpen(false)} title={`Ekonomisk Analys - ${data.rangeLabel}`}>
                <div className="min-h-[300px]">
                    {isAiLoading ? (
                        <div className="flex flex-col items-center justify-center py-20 space-y-4">
                            <Bot size={48} className="text-purple-400 animate-bounce" />
                            <div className="text-center">
                                <h3 className="text-white font-bold text-lg">AI-assistenten analyserar...</h3>
                                <p className="text-slate-400 text-sm mt-1">Går igenom transaktioner, budget och trender.</p>
                            </div>
                        </div>
                    ) : (
                        <div className="prose prose-invert max-w-none">
                            <SimpleMarkdownRenderer text={aiReport} />
                        </div>
                    )}
                </div>
            </Modal>
        </div>
    );
};

const TrendsAnalysis = () => {
    const { transactions, budgetGroups, subCategories, buckets, users, settings, budgetTemplates, monthConfigs } = useApp();
    const { selectedMonth } = useApp();
    const reimbursementMap = useMemo(() => calculateReimbursementMap(transactions), [transactions]);

    const trendData = useMemo(() => {
        const months: any[] = [];
        const currentSelectedDate = parseISO(`${selectedMonth}-01`);
        
        // Loop back 11 months + current = 12 months
        for (let i = 11; i >= 0; i--) {
            const mDate = subMonths(currentSelectedDate, i);
            const mKey = format(mDate, 'yyyy-MM');
            const { start, end } = getBudgetInterval(mKey, settings.payday);
            const startStr = format(start, 'yyyy-MM-dd');
            const endStr = format(end, 'yyyy-MM-dd');

            // 1. Income (Green Line)
            const income = getTotalFamilyIncome(users, mKey);

            // 2. Budget (Limits - Blue Line)
            let totalBudgetLimit = 0;
            budgetGroups.forEach(group => {
                const { data: gData } = getEffectiveBudgetGroupData(group, mKey, budgetTemplates, monthConfigs);
                const manualLimit = gData ? gData.limit : 0;
                
                const groupSubs = subCategories.filter(s => s.budgetGroupId === group.id);
                const subBudgetSum = groupSubs.reduce((s, sub) => s + getEffectiveSubCategoryBudget(sub, mKey, budgetTemplates, monthConfigs), 0);
                
                const groupBuckets = buckets.filter(b => b.budgetGroupId === group.id || (group.linkedBucketIds && group.linkedBucketIds.includes(b.id)));
                const bucketBudgetSum = groupBuckets.reduce((s, b) => {
                    let cost = 0;
                    if (b.type === 'FIXED') cost = calculateFixedBucketCost(b, mKey);
                    else if (b.type === 'DAILY') cost = calculateDailyBucketCost(b, mKey, settings.payday);
                    else if (b.type === 'GOAL' && b.paymentSource === 'INCOME') cost = calculateGoalBucketCost(b, mKey);
                    return s + cost;
                }, 0);

                totalBudgetLimit += Math.max(manualLimit, subBudgetSum + bucketBudgetSum);
            });

            // 3. Actual Spent (Costs vs Dreams - Stacked Bars)
            // USER INSTRUCTION: "bara visa utgifter, inte överföringar och inkomster"
            // We filter strictly for type === 'EXPENSE'
            const monthTxs = transactions.filter(t => 
                !t.isHidden && 
                t.date >= startStr && 
                t.date <= endStr && 
                t.type === 'EXPENSE'
            );
            
            let costs = 0;
            let dreams = 0;

            monthTxs.forEach(t => {
                const eff = Math.abs(getEffectiveAmount(t, reimbursementMap));
                if (eff === 0) return;

                const bucket = t.bucketId ? buckets.find(b => b.id === t.bucketId) : null;
                const sub = t.categorySubId ? subCategories.find(s => s.id === t.categorySubId) : null;

                // Determine if this expense belongs to "Dreams" (Savings/Goals)
                const isSavings = (bucket && (bucket.type === 'GOAL' || bucket.isSavings)) || (sub && sub.isSavings);

                if (isSavings) {
                    dreams += eff;
                } else {
                    costs += eff;
                }
            });

            months.push({
                name: format(mDate, 'MMM', { locale: sv }),
                monthKey: mKey,
                income,
                budget: totalBudgetLimit,
                costs,
                dreams,
                totalActual: costs + dreams,
                savingsRate: income > 0 ? ((income - costs) / income) * 100 : 0
            });
        }
        return months;
    }, [transactions, budgetGroups, subCategories, buckets, users, selectedMonth, settings.payday, reimbursementMap, budgetTemplates, monthConfigs]);

    const averageIncome = trendData.reduce((s, d) => s + d.income, 0) / 12;
    const averageSpent = trendData.reduce((s, d) => s + d.totalActual, 0) / 12;
    const totalSavings = trendData.reduce((s, d) => s + (d.income - d.costs), 0);

    return (
        <div className="space-y-6 animate-in fade-in">
            {/* KPI ROW */}
            <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700/50">
                    <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Snitt Inkomst</div>
                    <div className="text-lg font-mono text-emerald-400 font-bold">{formatMoney(averageIncome)}</div>
                </div>
                <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700/50">
                    <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Snitt Utgift</div>
                    <div className="text-lg font-mono text-white font-bold">{formatMoney(averageSpent)}</div>
                </div>
                <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700/50">
                    <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Ack. Överskott</div>
                    <div className={cn("text-lg font-mono font-bold", totalSavings >= 0 ? "text-blue-400" : "text-rose-400")}>
                        {formatMoney(totalSavings)}
                    </div>
                </div>
            </div>

            {/* MAIN CHART */}
            <div className="bg-slate-900/30 p-4 rounded-2xl border border-slate-700/50 h-[450px]">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={trendData} margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
                        <defs>
                            <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                            </linearGradient>
                            <linearGradient id="colorBudget" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                        <XAxis 
                            dataKey="name" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fill: '#64748b', fontSize: 12 }}
                            dy={10}
                        />
                        <YAxis 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fill: '#64748b', fontSize: 10 }}
                            tickFormatter={(val) => `${val/1000}k`}
                        />
                        <Tooltip 
                            contentStyle={{ 
                                backgroundColor: '#0f172a', 
                                border: '1px solid #334155', 
                                borderRadius: '12px',
                                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                            }}
                            itemStyle={{ fontSize: '12px' }}
                            formatter={(value: number) => [formatMoney(value), '']}
                            labelStyle={{ color: '#fff', fontWeight: 'bold', marginBottom: '4px' }}
                        />
                        <Legend 
                            verticalAlign="top" 
                            align="right" 
                            iconType="circle"
                            wrapperStyle={{ paddingBottom: '20px', fontSize: '12px' }}
                        />
                        
                        {/* Bars for Costs and Dreams (Savings) */}
                        <Bar 
                            dataKey="costs" 
                            name="Utgifter (Röd)" 
                            stackId="a" 
                            fill="#ef4444" 
                            radius={[0, 0, 0, 0]} 
                            barSize={30}
                            opacity={0.8}
                        />
                        <Bar 
                            dataKey="dreams" 
                            name="Drömmar (Lila)" 
                            stackId="a" 
                            fill="#8b5cf6" 
                            radius={[4, 4, 0, 0]} 
                            barSize={30}
                            opacity={0.8}
                        />

                        {/* Line for Budget */}
                        <Line 
                            type="monotone" 
                            dataKey="budget" 
                            name="Budget (Blå)" 
                            stroke="#3b82f6" 
                            strokeWidth={3} 
                            dot={{ r: 4, fill: '#3b82f6', strokeWidth: 2, stroke: '#0f172a' }}
                            activeDot={{ r: 6, strokeWidth: 0 }}
                        />

                        {/* Line for Income */}
                        <Line 
                            type="monotone" 
                            dataKey="income" 
                            name="Inkomst (Grön)" 
                            stroke="#10b981" 
                            strokeWidth={3} 
                            dot={{ r: 4, fill: '#10b981', strokeWidth: 2, stroke: '#0f172a' }}
                            activeDot={{ r: 6, strokeWidth: 0 }}
                        />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>

            {/* TREND INSIGHTS */}
            <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/50">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Sparkles size={14} className="text-yellow-400" /> Trendanalys (Utgifter exkl. Överföringar)
                </h4>
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-emerald-500/10 rounded-lg"><TrendingUp size={16} className="text-emerald-400" /></div>
                            <div>
                                <div className="text-sm font-bold text-white">Sparkvot (Snitt)</div>
                                <div className="text-[10px] text-slate-500">Hur mycket blir kvar efter löpande utgifter?</div>
                            </div>
                        </div>
                        <div className="text-lg font-mono font-bold text-emerald-400">
                            {Math.round(trendData.reduce((s, d) => s + d.savingsRate, 0) / 12)}%
                        </div>
                    </div>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-500/10 rounded-lg"><Activity size={16} className="text-blue-400" /></div>
                            <div>
                                <div className="text-sm font-bold text-white">Budgetföljsamhet</div>
                                <div className="text-[10px] text-slate-500">Snittavvikelse mot budgetlimit</div>
                            </div>
                        </div>
                        <div className={cn("text-lg font-mono font-bold", (averageSpent - trendData.reduce((s, d) => s + d.budget, 0) / 12) > 0 ? "text-rose-400" : "text-emerald-400")}>
                            {formatMoney(averageSpent - trendData.reduce((s, d) => s + d.budget, 0) / 12)}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const AccountStats = () => {
    // Destructured mainCategories and subCategories from useApp for GroupedDrillDown usage
    const { accounts, buckets, transactions, selectedMonth, settings, updateTransaction, mainCategories, subCategories, updateAccount } = useApp();
    const { startStr, endStr, intervalLabel } = useBudgetMonth(selectedMonth);
    const [timeframe, setTimeframe] = useState<1 | 3 | 6 | 9 | 12>(1);
    const [expandedAccount, setExpandedAccount] = useState<string | null>(null);
    const [drillDownData, setDrillDownData] = useState<{ title: string, transactions: Transaction[], grouped?: boolean } | null>(null);
    const [mappingTx, setMappingTx] = useState<Transaction | null>(null);
    const [iconPickerTarget, setIconPickerTarget] = useState<Account | null>(null);

    const reimbursementMap = useMemo(() => calculateReimbursementMap(transactions), [transactions]);
    const data = useMemo(() => {
        let targetStartStr = startStr; let targetEndStr = endStr; let targetLabel = intervalLabel;
        if (timeframe > 1) {
            const targetEndMonth = format(subMonths(parseISO(`${selectedMonth}-01`), 1), 'yyyy-MM');
            const { start, end } = getBudgetInterval(targetEndMonth, settings.payday);
            const startMonthKey = format(subMonths(parseISO(`${targetEndMonth}-01`), timeframe - 1), 'yyyy-MM');
            const startDateObj = getBudgetInterval(startMonthKey, settings.payday).start;
            targetStartStr = format(startDateObj, 'yyyy-MM-dd'); targetEndStr = format(end, 'yyyy-MM-dd');
            targetLabel = `${format(startDateObj, 'MMM', { locale: sv })} - ${format(end, 'MMM yyyy', { locale: sv })}`;
        }
        const relevantTxs = transactions.filter(t => !t.isHidden && t.date >= targetStartStr && t.date <= targetEndStr);
        const processedAccounts = accounts.map(acc => {
            const bucketItems: any[] = [];
            buckets.filter(b => b.accountId === acc.id).forEach(b => {
                const bucketTxs = relevantTxs.filter(t => t.bucketId === b.id && t.accountId === acc.id);
                const deposits = bucketTxs.filter(t => getEffectiveAmount(t, reimbursementMap) > 0);
                const withdrawals = bucketTxs.filter(t => getEffectiveAmount(t, reimbursementMap) < 0 && t.type !== 'EXPENSE');
                const depositsSum = deposits.reduce((s, t) => s + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);
                const withdrawalsSum = withdrawals.reduce((s, t) => s + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);
                const expensesSum = bucketTxs.filter(t => getEffectiveAmount(t, reimbursementMap) < 0 && t.type === 'EXPENSE').reduce((s, t) => s + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);
                const rawExpenses = bucketTxs.filter(t => getEffectiveAmount(t, reimbursementMap) < 0 && t.type === 'EXPENSE');
                if (b.type === 'GOAL') {
                    if (depositsSum > 0 || isBucketActiveInMonth(b, selectedMonth)) {
                        bucketItems.push({ id: `${b.id}-saving`, name: `Spara: ${b.name}`, planned: calculateGoalBucketCost(b, selectedMonth), deposit: depositsSum / timeframe, withdrawal: 0, expense: 0, rawDeposits: deposits });
                    }
                    if (expensesSum > 0 || withdrawalsSum > 0) {
                        bucketItems.push({ id: `${b.id}-spending`, name: b.name, planned: 0, deposit: 0, withdrawal: withdrawalsSum / timeframe, expense: expensesSum / timeframe, rawWithdrawals: withdrawals, rawExpenses: rawExpenses });
                    }
                } else {
                    let p = 0; if (b.type === 'FIXED') p = calculateFixedBucketCost(b, selectedMonth); else p = calculateDailyBucketCost(b, selectedMonth, settings.payday);
                    bucketItems.push({ id: b.id, name: b.name, planned: p, deposit: depositsSum / timeframe, withdrawal: withdrawalsSum / timeframe, expense: expensesSum / timeframe, rawDeposits: deposits, rawWithdrawals: withdrawals, rawExpenses: rawExpenses });
                }
            });
            const unallocatedTxs = relevantTxs.filter(t => t.accountId === acc.id && (!t.bucketId || t.bucketId === 'INTERNAL' || t.bucketId === 'PAYOUT'));
            const otherStats = { deposit: unallocatedTxs.filter(t => t.amount > 0).reduce((s,t) => s + t.amount, 0) / timeframe, withdrawal: unallocatedTxs.filter(t => t.amount < 0 && t.type !== 'EXPENSE').reduce((s,t) => s + Math.abs(t.amount), 0) / timeframe, expense: unallocatedTxs.filter(t => t.amount < 0 && t.type === 'EXPENSE').reduce((s,t) => s + Math.abs(t.amount), 0) / timeframe, rawDeposits: unallocatedTxs.filter(t => t.amount > 0), rawWithdrawals: unallocatedTxs.filter(t => t.amount < 0 && t.type !== 'EXPENSE'), rawExpenses: unallocatedTxs.filter(t => t.amount < 0 && t.type === 'EXPENSE') };
            return { ...acc, standardItems: bucketItems.filter(i => !i.id.includes('goal')), goalItems: bucketItems.filter(i => i.id.includes('goal')), otherStats, netFlow: (bucketItems.reduce((s, b) => s + b.deposit, 0) + otherStats.deposit) - (bucketItems.reduce((s, b) => s + b.withdrawal + b.expense, 0) + otherStats.withdrawal + otherStats.expense) };
        });
        return { processedAccounts, targetLabel };
    }, [accounts, buckets, transactions, selectedMonth, timeframe, settings.payday, startStr, endStr, reimbursementMap]);

    const handleDrillDown = (title: string, txs: Transaction[], grouped = false) => { if (txs.length > 0) setDrillDownData({ title, transactions: txs, grouped }); };

    const handleAccountIconSelect = async (emoji: string) => {
        if (!iconPickerTarget) return;
        await updateAccount({ ...iconPickerTarget, icon: emoji });
        setIconPickerTarget(null);
    };

    return (
        <div className="space-y-6">
            <div className="flex bg-slate-800 p-1 rounded-xl gap-1 border border-slate-700 overflow-x-auto no-scrollbar">
                {[1, 3, 6, 9, 12].map(m => (<button key={m} onClick={() => setTimeframe(m as any)} className={cn("flex-1 px-4 py-2 rounded-lg text-xs font-bold transition-all", timeframe === m ? "bg-cyan-600 text-white" : "text-slate-400 hover:text-white")}>{m === 1 ? 'Denna månad' : `Snitt ${m} mån`}</button>))}
            </div>
            <div className="space-y-4">
                {data.processedAccounts.map(acc => (
                    <div key={acc.id} className="bg-surface border border-slate-700 rounded-xl overflow-hidden shadow-md">
                        <div className="p-4 cursor-pointer hover:bg-slate-800/80" onClick={() => setExpandedAccount(expandedAccount === acc.id ? null : acc.id)}>
                            <div className="flex items-center gap-3">
                                {expandedAccount === acc.id ? <ChevronDown size={18} className="text-cyan-400"/> : <ChevronRight size={18} className="text-slate-500"/>}
                                <button 
                                    className="text-xl hover:bg-slate-700/50 p-2 rounded-xl transition-all active:scale-90"
                                    onClick={(e) => { e.stopPropagation(); setIconPickerTarget(acc); }}
                                >
                                    {acc.icon}
                                </button>
                                <div className="flex-1 font-bold text-white text-lg">{acc.name}</div>
                                <div className="text-right"><div className="text-[10px] text-slate-400 uppercase font-bold">Nettoflöde</div><div className={cn("font-mono font-bold", acc.netFlow >= 0 ? "text-emerald-400" : "text-rose-400")}>{formatMoney(acc.netFlow)}</div></div>
                            </div>
                        </div>
                        {expandedAccount === acc.id && (
                            <div className="bg-slate-900/30 border-t border-slate-700/50 p-2 overflow-x-auto">
                                <div className="grid grid-cols-5 gap-2 text-[9px] uppercase font-bold text-slate-500 tracking-wider border-b border-slate-700 pb-2 mb-2 px-2 min-w-[350px]">
                                    <div className="col-span-1">Post</div><div className="text-right text-blue-300">Plan Ins.</div><div className="text-right text-emerald-400">Insättning</div><div className="text-right text-orange-300">Uttag</div><div className="text-right text-rose-400">Utgifter</div>
                                </div>
                                {acc.standardItems.map(b => (
                                    <div key={b.id} className="grid grid-cols-5 gap-2 text-[10px] items-center hover:bg-white/5 p-2 rounded transition-colors">
                                        <div className="col-span-1 font-medium text-slate-300 truncate" title={b.name}>{b.name}</div>
                                        <div className="text-right text-blue-200/70 font-mono">{formatMoney(b.planned)}</div>
                                        <div className={cn("text-right font-mono cursor-pointer hover:bg-emerald-500/20 rounded px-1", b.deposit > 0 ? "text-emerald-400 font-bold" : "text-slate-600")} onClick={() => handleDrillDown(`${b.name} - Insättningar`, b.rawDeposits)}>{formatMoney(b.deposit)}</div>
                                        <div className={cn("text-right font-mono cursor-pointer hover:bg-orange-500/20 rounded px-1", b.withdrawal > 0 ? "text-orange-300" : "text-slate-600")} onClick={() => handleDrillDown(`${b.name} - Uttag`, b.rawWithdrawals)}>{formatMoney(b.withdrawal)}</div>
                                        <div className={cn("text-right font-mono cursor-pointer hover:bg-rose-500/20 rounded px-1", b.expense > 0 ? "text-rose-400" : "text-slate-600")} onClick={() => handleDrillDown(`${b.name} - Utgifter`, b.rawExpenses, true)}>{formatMoney(b.expense)}</div>
                                    </div>
                                ))}
                                <div className="grid grid-cols-5 gap-2 text-[10px] items-center hover:bg-white/5 p-2 rounded transition-colors mt-2 pt-2 border-t border-slate-700/30">
                                    <div className="col-span-1 font-medium text-slate-500">Övrigt / Okopplat</div>
                                    <div className="text-right font-mono">-</div>
                                    <div className={cn("text-right font-mono cursor-pointer hover:bg-emerald-500/20 rounded px-1", acc.otherStats.deposit > 0 ? "text-emerald-400 font-bold" : "text-slate-600")} onClick={() => handleDrillDown(`Okopplade Insättningar`, acc.otherStats.rawDeposits)}>{formatMoney(acc.otherStats.deposit)}</div>
                                    <div className={cn("text-right font-mono cursor-pointer hover:bg-orange-500/20 rounded px-1", acc.otherStats.withdrawal > 0 ? "text-orange-300" : "text-slate-600")} onClick={() => handleDrillDown(`Okopplade Uttag`, acc.otherStats.rawWithdrawals)}>{formatMoney(acc.otherStats.withdrawal)}</div>
                                    <div className={cn("text-right font-mono cursor-pointer hover:bg-rose-500/20 rounded px-1", acc.otherStats.expense > 0 ? "text-rose-400" : "text-slate-600")} onClick={() => handleDrillDown(`Okopplade Utgifter`, acc.otherStats.rawExpenses, true)}>{formatMoney(acc.otherStats.expense)}</div>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <EmojiPickerModal 
                isOpen={!!iconPickerTarget} 
                onClose={() => setIconPickerTarget(null)} 
                onSelect={handleAccountIconSelect}
                title={iconPickerTarget ? `Ikon för ${iconPickerTarget.name}` : undefined}
            />

            <Modal isOpen={!!drillDownData} onClose={() => setDrillDownData(null)} title={drillDownData?.title || 'Transaktioner'}>
                {drillDownData?.grouped ? (
                    <GroupedDrillDown transactions={drillDownData.transactions} mainCategories={mainCategories} subCategories={subCategories} reimbursementMap={reimbursementMap} />
                ) : (
                    <div className="space-y-2">
                        {drillDownData?.transactions?.map(t => (
                            <div key={t.id} className="flex justify-between items-center p-3 bg-slate-900/50 border border-slate-800 rounded-lg transition-all group">
                                <div className="flex-1 mr-4 overflow-hidden"><div className="text-white font-medium truncate">{t.description}</div><div className="text-xs text-slate-500">{t.date}</div></div>
                                <div className={cn("font-mono font-bold whitespace-nowrap", t.amount > 0 ? "text-emerald-400" : "text-white")}>{t.amount > 0 ? '+' : ''}{formatMoney(t.amount)}</div>
                            </div>
                        ))}
                    </div>
                )}
                <div className="mt-4 border-t border-slate-700 pt-4 flex justify-end"><Button variant="secondary" onClick={() => setDrillDownData(null)}>Stäng</Button></div>
            </Modal>
        </div>
    );
};

export const StatsView: React.FC = () => {
  const { selectedMonth } = useApp();
  const [activeTab, setActiveTab] = useState<'snapshot' | 'accounts' | 'trends' | 'insights'>('snapshot');
  return (
    <div className="space-y-6 pb-24 animate-in slide-in-from-right duration-300">
      <header><h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-indigo-400">Statistik</h1><p className="text-slate-400">Följ upp din ekonomi och se trender.</p></header>
      <div className="flex p-1 bg-slate-800 rounded-xl shadow-lg border border-slate-700/50 overflow-x-auto no-scrollbar">
          <button onClick={() => setActiveTab('snapshot')} className={cn("flex-1 py-2 px-3 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all whitespace-nowrap", activeTab === 'snapshot' ? "bg-indigo-600 text-white shadow-lg" : "text-slate-400 hover:text-white")}><PieIcon size={16} /> Budgetgrupper</button>
          <button onClick={() => setActiveTab('accounts')} className={cn("flex-1 py-2 px-3 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all whitespace-nowrap", activeTab === 'accounts' ? "bg-cyan-600 text-white shadow-lg" : "text-slate-400 hover:text-white")}><Wallet size={16} /> Konton</button>
          <button onClick={() => setActiveTab('trends')} className={cn("flex-1 py-2 px-3 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all whitespace-nowrap", activeTab === 'trends' ? "bg-purple-600 text-white shadow-lg" : "text-slate-400 hover:text-white")}><TrendingUp size={16} /> Trender</button>
          <button onClick={() => setActiveTab('insights')} className={cn("flex-1 py-2 px-3 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all whitespace-nowrap", activeTab === 'insights' ? "bg-pink-600 text-white shadow-lg" : "text-slate-400 hover:text-white")}><Sparkles size={16} /> Insikter</button>
      </div>
      {activeTab === 'snapshot' ? <BudgetGroupStats selectedMonth={selectedMonth} /> : activeTab === 'accounts' ? <AccountStats /> : activeTab === 'trends' ? <TrendsAnalysis /> : <InsightsAnalysis />}
    </div>
  );
};

const InsightsAnalysis = () => { 
    const { transactions, buckets, subCategories, mainCategories, selectedMonth, budgetGroups, settings, budgetTemplates, monthConfigs } = useApp();
    const reimbursementMap = useMemo(() => calculateReimbursementMap(transactions), [transactions]);
    const { startStr, endStr } = useBudgetMonth(selectedMonth);

    // --- ANALYTIC DATA ---
    const insights = useMemo(() => {
        const monthTxs = transactions.filter(t => !t.isHidden && t.date >= startStr && t.date <= endStr);
        const prevMonthKey = format(subMonths(parseISO(`${selectedMonth}-01`), 1), 'yyyy-MM');
        const { start: prevStart, end: prevEnd } = getBudgetInterval(prevMonthKey, settings.payday);
        const prevStartStr = format(prevStart, 'yyyy-MM-dd');
        const prevEndStr = format(prevEnd, 'yyyy-MM-dd');
        const prevMonthTxs = transactions.filter(t => !t.isHidden && t.date >= prevStartStr && t.date <= prevEndStr);

        // 1. Radar Profile
        const getSum = (txs: Transaction[], filter: (t: Transaction) => boolean) => 
            txs.filter(filter).reduce((s, t) => s + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);

        const profileData = [
            { 
                subject: 'Spararen', 
                full: 100, 
                value: Math.min(100, (getSum(monthTxs, t => {
                    const bucket = t.bucketId ? buckets.find(b => b.id === t.bucketId) : null;
                    const sub = t.categorySubId ? subCategories.find(s => s.id === t.categorySubId) : null;
                    return (bucket?.isSavings || sub?.isSavings || bucket?.type === 'GOAL') === true;
                }) / (getTotalFamilyIncome(useApp().users, selectedMonth) || 1)) * 500)
            },
            { 
                subject: 'Livsnjutaren', 
                full: 100, 
                value: Math.min(100, (getSum(monthTxs, t => {
                    const mainName = mainCategories.find(m => m.id === t.categoryMainId)?.name.toLowerCase() || '';
                    return mainName.includes('nöje') || mainName.includes('shopping') || mainName.includes('resa');
                }) / 5000) * 100)
            },
            { 
                subject: 'Tryggheten', 
                full: 100, 
                value: Math.min(100, (getSum(monthTxs, t => {
                    const mainName = mainCategories.find(m => m.id === t.categoryMainId)?.name.toLowerCase() || '';
                    return mainName.includes('boende') || mainName.includes('transport') || mainName.includes('hälsa');
                }) / 15000) * 100)
            },
            { 
                subject: 'Matvraket', 
                full: 100, 
                value: Math.min(100, (getSum(monthTxs, t => {
                    const mainName = mainCategories.find(m => m.id === t.categoryMainId)?.name.toLowerCase() || '';
                    return mainName.includes('mat');
                }) / 8000) * 100)
            },
            { 
                subject: 'Slösaren', 
                full: 100, 
                value: Math.min(100, (getSum(monthTxs, t => t.type === 'EXPENSE' || (!t.type && t.amount < 0)) / 25000) * 100)
            }
        ];

        // Dominant Trait
        const dominant = [...profileData].sort((a,b) => b.value - a.value)[0];

        // 2. Farligaste Dag
        const weekdaySums = new Array(7).fill(0);
        monthTxs.forEach(t => {
            if (t.type === 'EXPENSE' || t.amount < 0) {
                weekdaySums[getDay(parseISO(t.date))] += Math.abs(getEffectiveAmount(t, reimbursementMap));
            }
        });
        const weekdays = ['Söndag', 'Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag'];
        const dangerousDayIdx = weekdaySums.indexOf(Math.max(...weekdaySums));
        const dangerousDay = weekdays[dangerousDayIdx];

        // 3. Mat-kvoten
        const groceries = getSum(monthTxs, t => {
            const sub = subCategories.find(s => s.id === t.categorySubId);
            return sub?.name.toLowerCase().includes('matvaru') || sub?.name.toLowerCase().includes('grossist') || false;
        });
        const dining = getSum(monthTxs, t => {
            const sub = subCategories.find(s => s.id === t.categorySubId);
            return sub?.name.toLowerCase().includes('restaurang') || sub?.name.toLowerCase().includes('takeaway') || false;
        });
        const foodRatio = groceries > 0 ? Math.round((dining / groceries) * 100) : 0;

        // 4. Dubbel-dragningar
        const duplicates: Transaction[] = [];
        const seen = new Map<string, string>();
        monthTxs.forEach(t => {
            const key = `${t.date}-${t.amount}-${t.description}`;
            if (seen.has(key)) duplicates.push(t);
            else seen.set(key, t.id);
        });

        // 5. Lattefaktorn
        const smallSpends = monthTxs.filter(t => Math.abs(getEffectiveAmount(t, reimbursementMap)) < 200 && (t.type === 'EXPENSE' || t.amount < 0));
        const latteTotal = smallSpends.reduce((s, t) => s + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);

        // 6. Helg-effekten
        const weekendSpend = getSum(monthTxs, t => [0, 5, 6].includes(getDay(parseISO(t.date))));
        const totalSpend = getSum(monthTxs, t => t.type === 'EXPENSE' || t.amount < 0);
        const weekendPercent = totalSpend > 0 ? Math.round((weekendSpend / totalSpend) * 100) : 0;

        // 7. Pengamagneter (Stores)
        const storeMap = new Map<string, { total: number, count: number }>();
        monthTxs.forEach(t => {
            if (t.type === 'EXPENSE' || t.amount < 0) {
                const name = t.description.split(' ')[0].replace(/[^a-zA-Z]/g, '');
                if (name.length < 3) return;
                const curr = storeMap.get(name) || { total: 0, count: 0 };
                storeMap.set(name, { total: curr.total + Math.abs(getEffectiveAmount(t, reimbursementMap)), count: curr.count + 1 });
            }
        });
        const moneyMagnets = Array.from(storeMap.entries()).sort((a,b) => b[1].total - a[1].total).slice(0, 5);
        const creaturesOfHabit = Array.from(storeMap.entries()).sort((a,b) => b[1].count - a[1].count).slice(0, 5);

        // 8. Inflations-kollen (Grocery specifically)
        const mainStore = creaturesOfHabit.length > 0 ? creaturesOfHabit[0][0] : null;
        let inflationMsg = "Ingen data";
        if (mainStore) {
            const currentAvg = getSum(monthTxs, t => t.description.toLowerCase().includes(mainStore.toLowerCase())) / 
                monthTxs.filter(t => t.description.toLowerCase().includes(mainStore.toLowerCase())).length;
            const prevAvg = getSum(prevMonthTxs, t => t.description.toLowerCase().includes(mainStore.toLowerCase())) / 
                prevMonthTxs.filter(t => t.description.toLowerCase().includes(mainStore.toLowerCase())).length;
            
            if (currentAvg && prevAvg) {
                const diff = ((currentAvg - prevAvg) / prevAvg) * 100;
                inflationMsg = `${diff > 0 ? '+' : ''}${diff.toFixed(1)}% mot förra månaden`;
            }
        }

        return { 
            profileData, dominant, dangerousDay, foodRatio, 
            duplicates, latteTotal, weekendPercent, 
            moneyMagnets, creaturesOfHabit, inflationMsg, mainStore,
            weekdaySums
        };
    }, [transactions, selectedMonth, reimbursementMap, buckets, subCategories, mainCategories, settings]);

    const radarColors = {
        'Spararen': 'text-emerald-400',
        'Livsnjutaren': 'text-pink-400',
        'Tryggheten': 'text-blue-400',
        'Matvraket': 'text-orange-400',
        'Slösaren': 'text-rose-400'
    };

    const traitIcons = {
        'Spararen': <PiggyBank className="w-8 h-8 text-emerald-400" />,
        'Livsnjutaren': <Gem className="w-8 h-8 text-pink-400" />,
        'Tryggheten': <Shield className="w-8 h-8 text-blue-400" />,
        'Matvraket': <Utensils className="w-8 h-8 text-orange-400" />,
        'Slösaren': <Flame className="w-8 h-8 text-rose-400" />
    };

    return (
        <div className="space-y-6 animate-in fade-in">
            {/* 1. ECONOMIC DNA */}
            <Card className="p-0 overflow-hidden border-slate-700 bg-gradient-to-br from-slate-900 to-slate-800">
                <div className="p-4 border-b border-white/5 flex justify-between items-center">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <Activity size={14} className="text-blue-400" /> Ekonomiskt DNA
                    </h3>
                    <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full font-bold">PROFILERING</span>
                </div>
                
                <div className="grid md:grid-cols-2 items-center">
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <RadarChart cx="50%" cy="50%" outerRadius="70%" data={insights.profileData}>
                                <PolarGrid stroke="#334155" />
                                <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                                <Radar
                                    name="Profil"
                                    dataKey="value"
                                    stroke="#3b82f6"
                                    fill="#3b82f6"
                                    fillOpacity={0.5}
                                />
                            </RadarChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="p-6 space-y-4">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-white/5 rounded-2xl border border-white/10">
                                {traitIcons[insights.dominant.subject as keyof typeof traitIcons]}
                            </div>
                            <div>
                                <div className="text-xs text-slate-500 uppercase font-bold">Dominant Drag</div>
                                <div className={cn("text-2xl font-bold", radarColors[insights.dominant.subject as keyof typeof radarColors])}>
                                    {insights.dominant.subject}
                                </div>
                            </div>
                        </div>
                        <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700">
                            <div className="flex justify-between items-center">
                                <span className="text-xs text-slate-400 font-medium">Farligaste veckodag:</span>
                                <span className="text-sm font-bold text-rose-400">{insights.dangerousDay}</span>
                            </div>
                            <p className="text-[10px] text-slate-500 mt-2 italic leading-relaxed">
                                Detta är dagen då pengarna rullar snabbast. Håll extra koll på impulserna då!
                            </p>
                        </div>
                    </div>
                </div>
            </Card>

            {/* 2. FINANSIELL RÖNTGEN */}
            <div className="grid grid-cols-2 gap-4">
                <Card className="bg-slate-800/50 border-slate-700">
                    <div className="text-[10px] text-slate-500 uppercase font-bold mb-3 flex items-center gap-1">
                        <Utensils size={10} className="text-orange-400" /> Mat-kvoten
                    </div>
                    <div className="text-3xl font-bold text-white mb-1">{insights.foodRatio} <span className="text-sm text-slate-500 font-normal">kr ute</span></div>
                    <div className="text-[9px] text-slate-400">per 100 kr i matbutiken.</div>
                    <div className="mt-3 h-1.5 w-full bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-orange-500" style={{ width: `${Math.min(100, insights.foodRatio)}%` }} />
                    </div>
                </Card>

                <Card className="bg-slate-800/50 border-slate-700">
                    <div className="text-[10px] text-slate-500 uppercase font-bold mb-3 flex items-center gap-1">
                        <TrendingUp size={10} className="text-blue-400" /> Inflationskollen
                    </div>
                    <div className="text-xl font-bold text-white mb-1 truncate" title={insights.mainStore || ''}>
                        {insights.mainStore || 'Ingen butik'}
                    </div>
                    <div className={cn("text-sm font-bold", insights.inflationMsg.includes('+') ? "text-rose-400" : "text-emerald-400")}>
                        {insights.inflationMsg}
                    </div>
                    <p className="text-[8px] text-slate-500 mt-2">Snittkvitto i din vanligaste butik.</p>
                </Card>
            </div>

            {/* 3. DUBBELDRAGNINGAR ALERT */}
            {insights.duplicates.length > 0 && (
                <div className="bg-rose-500/10 border border-rose-500/30 p-4 rounded-2xl animate-pulse">
                    <div className="flex items-center gap-2 text-rose-400 mb-2">
                        <AlertOctagon size={18} />
                        <h4 className="font-bold text-sm uppercase tracking-wider">Potentiella Dubbeldragningar</h4>
                    </div>
                    <div className="space-y-2">
                        {insights.duplicates.map(t => (
                            <div key={t.id} className="flex justify-between items-center text-xs bg-black/20 p-2 rounded border border-rose-500/10">
                                <span className="text-slate-300 font-medium truncate max-w-[60%]">{t.description}</span>
                                <span className="text-white font-mono font-bold">{formatMoney(t.amount)}</span>
                            </div>
                        ))}
                    </div>
                    <p className="text-[10px] text-rose-300/70 mt-2">Dessa transaktioner har exakt samma belopp och text på samma dag. Dubbelkolla med banken!</p>
                </div>
            )}

            {/* 4. BEHAVIOR ANALYSIS GRID */}
            <div className="space-y-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">Shopping & Beteende</h3>
                
                <div className="grid gap-4">
                    {/* Money Magnets */}
                    <Card className="bg-slate-900/50 border-slate-800">
                        <div className="flex justify-between items-center mb-4">
                            <h4 className="text-[10px] text-slate-500 uppercase font-bold flex items-center gap-2">
                                <ShoppingBag size={12} className="text-purple-400" /> Pengamagneterna (Mest pengar)
                            </h4>
                        </div>
                        <div className="space-y-3">
                            {insights.moneyMagnets.map(([name, data], i) => (
                                <div key={name} className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs text-slate-600 font-bold w-4">{i+1}.</span>
                                        <span className="text-sm text-slate-200 font-medium capitalize">{name}</span>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-sm font-mono font-bold text-white">{formatMoney(data.total)}</div>
                                        <div className="text-[9px] text-slate-500">{data.count} köp</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card>

                    {/* Lattefaktorn */}
                    <Card className="bg-slate-900/50 border-slate-800 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-5 rotate-12">
                            <Coffee size={64} />
                        </div>
                        <div className="relative z-10">
                            <h4 className="text-[10px] text-slate-500 uppercase font-bold flex items-center gap-2 mb-3">
                                <Coffee size={12} className="text-amber-400" /> Lattefaktorn (Småköp)
                            </h4>
                            <div className="flex justify-between items-end">
                                <div>
                                    <div className="text-3xl font-bold text-white font-mono">{formatMoney(insights.latteTotal)}</div>
                                    <div className="text-xs text-slate-400 mt-1">Summan av alla köp under 200 kr.</div>
                                </div>
                                <div className="text-right">
                                    <div className="text-emerald-400 font-bold flex items-center gap-1">
                                        <Rocket size={14} />
                                        Accelerator
                                    </div>
                                    <div className="text-[9px] text-slate-500 leading-tight">
                                        Halvera dessa och nå sparmålet <br/> 
                                        <span className="text-white font-bold">2.4 månader</span> tidigare.
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Card>

                    {/* Helgeffekt */}
                    <Card className="bg-slate-900/50 border-slate-800">
                        <div className="flex justify-between items-center mb-4">
                            <h4 className="text-[10px] text-slate-500 uppercase font-bold flex items-center gap-2">
                                <Repeat size={12} className="text-indigo-400" /> Helg-effekten
                            </h4>
                            <span className="text-xl font-bold text-white">{insights.weekendPercent}%</span>
                        </div>
                        <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden flex">
                            <div className="h-full bg-indigo-500" style={{ width: `${insights.weekendPercent}%` }} />
                            <div className="h-full bg-slate-700" style={{ width: `${100 - insights.weekendPercent}%` }} />
                        </div>
                        <div className="flex justify-between text-[8px] uppercase tracking-widest text-slate-500 mt-2 font-bold">
                            <span>Helg (Fre-Sön)</span>
                            <span>Vardag (Mån-Tor)</span>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
};
