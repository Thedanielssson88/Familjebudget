
import React, { useMemo, useState } from 'react';
import { useApp } from '../store';
import { useBudgetMonth } from '../hooks/useBudgetMonth';
import { formatMoney, getEffectiveBudgetGroupData, getBudgetInterval, calculateFixedBucketCost, calculateDailyBucketCost, calculateGoalBucketCost, getEffectiveBucketData, getTotalFamilyIncome, calculateSavedAmount, getUserIncome, calculateReimbursementMap, getEffectiveAmount } from '../utils';
import { 
    PieChart, Pie, Cell, Tooltip, ResponsiveContainer, 
    ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Area, Legend,
    Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
    BarChart, Line
} from 'recharts';
import { ChevronRight, ChevronDown, Edit2, Check, AlertTriangle, TrendingUp, TrendingDown, Calendar, BarChart3, PieChart as PieIcon, Filter, Info, Plane, X, Sparkles, Zap, Trophy, ShoppingBag, Layers, Clock, DollarSign, Activity, Target, Coffee, Repeat, ArrowRight, ArrowUpRight, ArrowDownRight, AlertOctagon, Utensils, Search, Percent, ThermometerSnowflake, Rocket, Wallet, PiggyBank, LayoutGrid, Eye, EyeOff, Bot, MessageSquare } from 'lucide-react';
import { BudgetProgressBar } from '../components/BudgetProgressBar';
import { cn, Button, Modal } from '../components/components';
import { BudgetGroup, Bucket, Transaction, MainCategory, SubCategory } from '../types';
import { format, subMonths, parseISO, differenceInDays, startOfDay, endOfDay, areIntervalsOverlapping, addDays, isValid, startOfMonth, endOfMonth, addMonths, getDay, startOfWeek, endOfWeek, subWeeks, getISOWeek, getDate, getDaysInMonth, eachDayOfInterval, subDays, subYears } from 'date-fns';
import { sv } from 'date-fns/locale';
import { constructMonthlyReportPrompt, fetchAiAnalysis, FinancialSnapshot } from '../services/aiService';

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
            const effAmount = getEffectiveAmount(t, reimbursementMap);
            if (effAmount === 0 && Math.abs(t.amount) > 0) return; // Skip if fully reimbursed or is a reimbursement itself

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

        // Convert Maps to Arrays and Sort
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
                        {/* MAIN CATEGORY ROW */}
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

                        {/* SUB CATEGORIES */}
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

                                            {/* TRANSACTIONS */}
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

// --- HELPER: Simple Markdown Renderer ---
const SimpleMarkdownRenderer = ({ text }: { text: string }) => {
    // Basic parser for Bold (**text**), Headers (#, ##), and Lists (-)
    const lines = text.split('\n');
    return (
        <div className="space-y-3 text-slate-300 text-sm leading-relaxed">
            {lines.map((line, i) => {
                const trimmed = line.trim();
                if (!trimmed) return <div key={i} className="h-2" />;
                
                // Headers
                if (trimmed.startsWith('## ')) return <h3 key={i} className="text-lg font-bold text-white mt-4 mb-2">{trimmed.replace('## ', '')}</h3>;
                if (trimmed.startsWith('# ')) return <h2 key={i} className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400 mt-6 mb-3">{trimmed.replace('# ', '')}</h2>;
                if (trimmed.startsWith('### ')) return <h4 key={i} className="text-base font-bold text-blue-200 mt-3">{trimmed.replace('### ', '')}</h4>;

                // Lists
                if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                    const content = trimmed.substring(2);
                    return (
                        <div key={i} className="flex gap-2 pl-2">
                            <span className="text-blue-500 mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0 block" />
                            <span dangerouslySetInnerHTML={{ __html: parseBold(content) }} />
                        </div>
                    );
                }
                
                // Numbered Lists
                if (/^\d+\./.test(trimmed)) {
                     return (
                        <div key={i} className="pl-2 font-medium text-white mt-2">
                            <span dangerouslySetInnerHTML={{ __html: parseBold(trimmed) }} />
                        </div>
                    );
                }

                // Table Rows (Simple piping detection)
                if (trimmed.startsWith('|')) {
                    const cells = trimmed.split('|').filter(c => c.trim() !== '');
                    if (trimmed.includes('---')) return null; // Skip divider row
                    return (
                        <div key={i} className="grid grid-cols-4 gap-2 text-xs border-b border-slate-700 py-1">
                            {cells.map((c, idx) => (
                                <div key={idx} className={cn("truncate", idx === 0 && "font-bold text-slate-200")}>{c.trim()}</div>
                            ))}
                        </div>
                    )
                }

                // Paragraphs
                return <p key={i} dangerouslySetInnerHTML={{ __html: parseBold(trimmed) }} />;
            })}
        </div>
    );
};

const parseBold = (text: string) => {
    // Replace **text** with <b>text</b>
    return text.replace(/\*\*(.*?)\*\*/g, '<b class="text-white">$1</b>');
};

// --- MAIN COMPONENT: STATS VIEW ---
export const StatsView: React.FC = () => {
    const { selectedMonth, budgetGroups, subCategories, transactions, buckets, updateBudgetGroup, settings, mainCategories, users } = useApp();
    const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
    const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
    const [tempLimit, setTempLimit] = useState<string>('');
    const [drillDownData, setDrillDownData] = useState<{ title: string, transactions: Transaction[], grouped?: boolean } | null>(null);
    const [timeframe, setTimeframe] = useState<1 | 3 | 6 | 12>(1);
    const [excludeDreams, setExcludeDreams] = useState(false);
    
    // AI Analysis State
    const [isAiModalOpen, setIsAiModalOpen] = useState(false);
    const [aiReport, setAiReport] = useState<string>('');
    const [aiPrompt, setAiPrompt] = useState<string>('');
    const [aiViewState, setAiViewState] = useState<'prompt' | 'loading' | 'result'>('prompt');

    // Calculate map ONCE for all transactions to ensure we have all connections
    const reimbursementMap = useMemo(() => calculateReimbursementMap(transactions), [transactions]);

    const calculateGroupLimitForMonth = (group: BudgetGroup, monthKey: string) => {
        const explicitData = group.monthlyData?.[monthKey];
        if (explicitData && !explicitData.isExplicitlyDeleted) return explicitData.limit;
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
        if (inheritedData && !inheritedData.isExplicitlyDeleted) return inheritedData.limit;
        return 0;
    };

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

    const data = useMemo(() => {
        let targetEndMonth = selectedMonth; 
        if (timeframe > 1) targetEndMonth = format(subMonths(parseISO(`${selectedMonth}-01`), 1), 'yyyy-MM');
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
            if (homeDaysCount > 5) scalingFactor = totalDays / homeDaysCount;
        }

        // Filter transactions for display period
        const relevantTx = transactions.filter(t => {
            if (t.date < startStr || t.date > endStr) return false;
            // Check basic type or negative amount
            const isExpense = t.type === 'EXPENSE' || (!t.type && t.amount < 0);
            if (!isExpense) return false;
            
            // Exclude Dreams if requested
            if (excludeDreams && t.bucketId) {
                const bucket = buckets.find(b => b.id === t.bucketId);
                if (bucket?.type === 'GOAL') return false;
            }
            return true;
        });

        const groupStats = budgetGroups.map(group => {
            const assignedSubs = subCategories.filter(s => s.budgetGroupId === group.id);
            const assignedSubIds = new Set(assignedSubs.map(s => s.id));
            
            // Filter transactions for this group
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
            
            // Calculate SPENT using Effective Amount
            groupTxs.forEach(t => {
                const effAmount = getEffectiveAmount(t, reimbursementMap);
                const amount = Math.abs(effAmount);
                if (amount === 0) return; // Skip zero-net transactions

                let shouldScale = true;
                if (excludeDreams) {
                    if (t.bucketId) {
                        const b = buckets.find(b => b.id === t.bucketId);
                        if (b?.type === 'FIXED') shouldScale = false;
                    } 
                    if (group.name.toLowerCase().includes('boende') || group.name.toLowerCase().includes('fast')) shouldScale = false;
                } else {
                    shouldScale = false;
                }
                
                spent += shouldScale ? (amount * scalingFactor) : amount;
            });

            const avgSpent = spent / timeframe;
            
            const breakdown = assignedSubs.map(sub => {
                let subSpent = 0;
                const subTxs = groupTxs.filter(t => t.categorySubId === sub.id);
                subTxs.forEach(t => {
                    const effAmount = getEffectiveAmount(t, reimbursementMap);
                    const amount = Math.abs(effAmount);
                    if (amount === 0) return;

                    const isFixedCat = sub.name.toLowerCase().includes('hyra') || sub.name.toLowerCase().includes('avgift') || sub.name.toLowerCase().includes('försäkring');
                    const factor = (excludeDreams && !isFixedCat) ? scalingFactor : 1;
                    subSpent += amount * factor;
                });
                return { ...sub, spent: subSpent / timeframe, transactions: subTxs.sort((a,b) => b.date.localeCompare(a.date)) };
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
                ...group, spent: avgSpent, limit: avgLimit, remaining: avgLimit - avgSpent,
                breakdown, unclassifiedSpent, unclassifiedTransactions: unclassifiedTxs.sort((a,b) => b.date.localeCompare(a.date))
            };
        }).sort((a, b) => b.spent - a.spent);

        const totalLimit = groupStats.reduce((sum, g) => sum + g.limit, 0);
        const totalSpent = groupStats.reduce((sum, g) => sum + g.spent, 0);
        const totalRemaining = totalLimit - totalSpent;
        return { groupStats, totalLimit, totalSpent, totalRemaining, isScaled: excludeDreams && scalingFactor > 1.05, homeDays: homeDaysCount, totalDays, scalingFactor, rangeLabel };
    }, [budgetGroups, subCategories, transactions, selectedMonth, timeframe, excludeDreams, buckets, settings.payday, reimbursementMap]);

    const handleStartEdit = (group: BudgetGroup) => {
        setEditingGroupId(group.id);
        const { data } = getEffectiveBudgetGroupData(group, selectedMonth);
        setTempLimit((data ? data.limit : 0).toString());
    };
    const handleSaveLimit = async (group: BudgetGroup) => {
        const amount = parseInt(tempLimit) || 0;
        const updatedGroup: BudgetGroup = {
            ...group, monthlyData: { ...group.monthlyData, [selectedMonth]: { limit: amount, isExplicitlyDeleted: false } }
        };
        await updateBudgetGroup(updatedGroup);
        setEditingGroupId(null);
    };

    const handlePrepareAiAnalysis = () => {
        setIsAiModalOpen(true);
        // If we already have a report, show it. Otherwise, prompt.
        if (aiReport) {
            setAiViewState('result');
            return; 
        }
        
        // 1. DETERMINE DATE RANGE BASED ON TIMEFRAME
        let targetEndMonth = selectedMonth; 
        if (timeframe > 1) targetEndMonth = format(subMonths(parseISO(`${selectedMonth}-01`), 1), 'yyyy-MM');
        
        const endDateObj = getBudgetInterval(targetEndMonth, settings.payday).end;
        const monthsBack = timeframe - 1;
        const startMonthKey = format(subMonths(parseISO(`${targetEndMonth}-01`), monthsBack), 'yyyy-MM');
        const startDateObj = getBudgetInterval(startMonthKey, settings.payday).start;
        
        const startStr = format(startDateObj, 'yyyy-MM-dd');
        const endStr = format(endDateObj, 'yyyy-MM-dd');
        const periodLabel = `${format(startDateObj, 'd MMM', {locale: sv})} - ${format(endDateObj, 'd MMM yyyy', {locale: sv})}`;
        const analysisLabel = timeframe === 1 ? data.rangeLabel : `${timeframe} Månader (${data.rangeLabel})`;

        // 2. CALCULATE TOTAL INCOME (Sum of all months in timeframe)
        let totalIncome = 0;
        for (let i = 0; i < timeframe; i++) {
             const mDate = addMonths(parseISO(`${startMonthKey}-01`), i);
             const mKey = format(mDate, 'yyyy-MM');
             totalIncome += getTotalFamilyIncome(users, mKey);
        }
        
        // 3. PREPARE BUDGET GROUPS (Scale averages back to totals)
        // data.groupStats contains averages when timeframe > 1
        const currentGroups = data.groupStats.map(g => ({
            name: g.name,
            limit: g.limit * timeframe,
            spent: g.spent * timeframe
        }));

        // 4. FILTER TRANSACTIONS FOR FULL PERIOD
        const analysisTxs = transactions.filter(t => {
            const inRange = t.date >= startStr && t.date <= endStr;
            const isRelevantType = t.type === 'INCOME' || t.type === 'EXPENSE' || (!t.type && t.amount < 0);
            const isNotTransfer = t.type !== 'TRANSFER'; 
            return inRange && isRelevantType && isNotTransfer;
        });
        
        const transactionLog = analysisTxs.map(t => {
            const amount = getEffectiveAmount(t, reimbursementMap); 
            if (amount === 0) return null;
            
            const mainName = mainCategories.find(m => m.id === t.categoryMainId)?.name || 'Övrigt';
            const subName = subCategories.find(s => s.id === t.categorySubId)?.name || '';
            let categoryLabel = subName ? `${mainName} > ${subName}` : mainName;
            
            if (t.bucketId) {
                const bucket = buckets.find(b => b.id === t.bucketId);
                if (bucket && bucket.type === 'GOAL') {
                    categoryLabel += ` [Dröm: ${bucket.name}]`;
                }
            }
            
            return `${t.date} | ${formatMoney(amount)} | ${t.description} | ${categoryLabel}`;
        }).filter(Boolean).join('\n');

        const topExpenses = analysisTxs
            .filter(t => t.amount < 0)
            .map(t => ({ name: t.description, amount: Math.abs(getEffectiveAmount(t, reimbursementMap)) }))
            .sort((a,b) => b.amount - a.amount)
            .slice(0, 5);

        const catMapCurrent = new Map<string, number>();
        analysisTxs.forEach(t => {
            if (t.amount >= 0) return;
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

        const snapshot: FinancialSnapshot = {
            totalIncome,
            budgetGroups: currentGroups,
            topExpenses,
            categoryBreakdownCurrent: breakdownCurrent,
            transactionLog, 
            monthLabel: analysisLabel,
            periodLabel: periodLabel
        };

        const generatedPrompt = constructMonthlyReportPrompt(snapshot);
        setAiPrompt(generatedPrompt);
        setAiViewState('prompt');
    };

    const handleExecuteAiAnalysis = async () => {
        setAiViewState('loading');
        try {
            const report = await fetchAiAnalysis(aiPrompt);
            setAiReport(report);
            setAiViewState('result');
        } catch (error) {
            console.error(error);
            setAiReport("Kunde inte genomföra analysen.");
            setAiViewState('result');
        }
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
                        <button onClick={handlePrepareAiAnalysis} className="px-3 py-2 text-xs font-bold rounded-lg flex items-center gap-2 transition-all bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 text-white shadow-lg border border-white/10">
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
                    <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">{timeframe > 1 ? 'Snitt Utfall' : 'Utfall'}</div>
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
                                            <div className="font-bold text-lg text-white flex items-center gap-2"><span>{group.icon} {group.name}</span>{hasOverspend && <AlertTriangle size={14} className="text-rose-500" />}</div>
                                            {group.isCatchAll && <div className="text-[10px] text-orange-400 uppercase font-bold">Obudgeterat / Övrigt</div>}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        {editingGroupId === group.id && timeframe === 1 ? (
                                            <div onClick={e => e.stopPropagation()} className="flex items-center justify-end gap-1 mb-1">
                                                <input autoFocus type="number" className="w-20 bg-slate-950 border border-blue-500 rounded px-2 py-1 text-right text-sm text-white outline-none font-mono" value={tempLimit} onChange={(e) => setTempLimit(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSaveLimit(group)} />
                                                <button onClick={() => handleSaveLimit(group)} className="p-1 bg-blue-600 text-white rounded hover:bg-blue-500"><Check size={14}/></button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-end gap-2 group/edit">
                                                <div className="text-sm font-mono font-bold text-white">{formatMoney(group.spent)}<span className="text-slate-500 font-normal text-xs mx-1">/</span><span className="text-slate-400 text-xs">{formatMoney(group.limit)}</span></div>
                                                {timeframe === 1 && <button onClick={(e) => { e.stopPropagation(); handleStartEdit(group); }} className="p-1 text-slate-600 hover:text-blue-400 opacity-0 group-hover/edit:opacity-100 transition-opacity"><Edit2 size={12} /></button>}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <BudgetProgressBar spent={group.spent} total={group.limit} compact />
                            </div>
                            {isExpanded && (
                                <div className="bg-slate-900/30 border-t border-slate-700/50 animate-in slide-in-from-top-2">
                                    {group.breakdown.map(sub => (
                                        <div key={sub.id} onClick={() => setDrillDownData({ title: sub.name, transactions: sub.transactions, grouped: false })} className="p-3 border-b border-slate-700/30 last:border-0 hover:bg-slate-800 transition-colors flex justify-between items-center cursor-pointer group">
                                            <span className="text-sm text-slate-300 group-hover:text-blue-300 transition-colors">{sub.name}</span>
                                            <span className="text-sm font-mono text-white">{formatMoney(sub.spent)}</span>
                                        </div>
                                    ))}
                                    {group.unclassifiedSpent > 0.01 && (
                                        <div onClick={() => setDrillDownData({ title: "Ospecificerat", transactions: group.unclassifiedTransactions, grouped: true })} className="p-3 border-b border-slate-700/30 flex justify-between items-center bg-slate-800/20 hover:bg-slate-800/40 cursor-pointer group">
                                            <span className="text-sm text-slate-400 italic group-hover:text-slate-200">Ospecificerat / Saknar underkategori</span>
                                            <span className="text-sm font-mono text-slate-400">{formatMoney(group.unclassifiedSpent)}</span>
                                        </div>
                                    )}
                                    {group.breakdown.length === 0 && group.unclassifiedSpent < 0.01 && <div className="p-4 text-center text-xs text-slate-500 italic">Inga utgifter här än.</div>}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
            <Modal isOpen={!!drillDownData} onClose={() => setDrillDownData(null)} title={drillDownData?.title || 'Transaktioner'}>
                {drillDownData?.grouped ? (
                    <GroupedDrillDown transactions={drillDownData.transactions} mainCategories={mainCategories} subCategories={subCategories} reimbursementMap={reimbursementMap} />
                ) : (
                    <div className="space-y-2">
                        {drillDownData?.transactions && drillDownData.transactions.length > 0 ? (
                            drillDownData.transactions.map(t => {
                                const eff = getEffectiveAmount(t, reimbursementMap);
                                if (eff === 0 && Math.abs(t.amount) > 0) return null; // Don't show fully reimbursed transactions in simple list
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

            {/* AI Analysis Modal */}
            <Modal isOpen={isAiModalOpen} onClose={() => setIsAiModalOpen(false)} title={`Ekonomisk Analys - ${data.rangeLabel}`}>
                <div className="min-h-[400px] flex flex-col">
                    
                    {/* STATE 1: PROMPT EDITING */}
                    {aiViewState === 'prompt' && (
                        <div className="flex flex-col h-full space-y-4">
                            <div className="bg-slate-800/50 p-3 rounded-lg text-sm text-slate-300 border border-slate-700">
                                Här är instruktionen som skickas till AI:n. Du kan redigera den om du vill ställa specifika frågor eller ge mer kontext.
                            </div>
                            <textarea 
                                value={aiPrompt}
                                onChange={(e) => setAiPrompt(e.target.value)}
                                className="flex-1 bg-slate-950 border border-slate-700 rounded-xl p-4 text-sm font-mono text-slate-300 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none h-[400px]"
                            />
                            <Button onClick={handleExecuteAiAnalysis} className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-lg">
                                <Bot size={18} className="mr-2" /> Analysera
                            </Button>
                        </div>
                    )}

                    {/* STATE 2: LOADING */}
                    {aiViewState === 'loading' && (
                        <div className="flex flex-col items-center justify-center py-20 space-y-4 h-full">
                            <Bot size={48} className="text-purple-400 animate-bounce" />
                            <div className="text-center">
                                <h3 className="text-white font-bold text-lg">AI-assistenten analyserar...</h3>
                                <p className="text-slate-400 text-sm mt-1">Går igenom transaktioner, budget och trender.</p>
                            </div>
                        </div>
                    )}

                    {/* STATE 3: RESULT */}
                    {aiViewState === 'result' && (
                        <div className="flex flex-col h-full space-y-4">
                            <div className="prose prose-invert max-w-none flex-1 overflow-y-auto pr-2">
                                <SimpleMarkdownRenderer text={aiReport} />
                            </div>
                            <div className="border-t border-slate-700 pt-4 flex gap-2">
                                <Button variant="secondary" onClick={() => setAiViewState('prompt')} className="flex-1">
                                    <MessageSquare size={16} className="mr-2" /> Redigera Prompt
                                </Button>
                                <Button onClick={() => setIsAiModalOpen(false)} className="flex-1">
                                    Stäng
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </Modal>
        </div>
    );
};
