
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
import { ChevronRight, ChevronDown, Edit2, Check, AlertTriangle, TrendingUp, TrendingDown, Calendar, BarChart3, PieChart as PieIcon, Filter, Info, Plane, X, Sparkles, Zap, Trophy, ShoppingBag, Layers, Clock, DollarSign, Activity, Target, Coffee, Repeat, ArrowRight, ArrowUpRight, ArrowDownRight, AlertOctagon, Utensils, Search, Percent, ThermometerSnowflake, Rocket, Wallet, PiggyBank, LayoutGrid, Eye, EyeOff, Bot, Calculator } from 'lucide-react';
import { BudgetProgressBar } from '../components/BudgetProgressBar';
import { cn, Button, Modal } from '../components/components';
import { BudgetGroup, Bucket, Transaction, MainCategory, SubCategory } from '../types';
import { format, subMonths, parseISO, differenceInDays, startOfDay, endOfDay, areIntervalsOverlapping, addDays, isValid, startOfMonth, endOfMonth, addMonths, getDay, startOfWeek, endOfWeek, subWeeks, getISOWeek, getDate, getDaysInMonth, eachDayOfInterval, subDays, subYears } from 'date-fns';
import { sv } from 'date-fns/locale';
import { generateMonthlyReport, FinancialSnapshot } from '../services/aiService';

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
            if (t.isHidden) return; // Skip hidden transactions
            
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
                    // Actually, a simple table renderer is hard without block context. 
                    // Let's just render as a grid row
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

// --- SUB-COMPONENT: BUDGET GROUPS SNAPSHOT ---
const BudgetGroupStats = ({ selectedMonth }: { selectedMonth: string }) => {
    const { budgetGroups, subCategories, transactions, buckets, settings, mainCategories, users, budgetTemplates, monthConfigs } = useApp();
    const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
    const [drillDownData, setDrillDownData] = useState<{ title: string, transactions: Transaction[], grouped?: boolean } | null>(null);
    const [timeframe, setTimeframe] = useState<1 | 3 | 6 | 12>(1);
    const [excludeDreams, setExcludeDreams] = useState(false);
    
    // Budget Breakdown Modal State
    const [budgetBreakdownData, setBudgetBreakdownData] = useState<{ 
        groupName: string; 
        items: { name: string; amount: number; type: 'SUB'|'BUCKET'|'BUFFER' }[];
        total: number;
    } | null>(null);

    // AI Analysis State
    const [isAiModalOpen, setIsAiModalOpen] = useState(false);
    const [aiReport, setAiReport] = useState<string>('');
    const [isAiLoading, setIsAiLoading] = useState(false);

    // Calculate map ONCE for all transactions to ensure we have all connections
    const reimbursementMap = useMemo(() => calculateReimbursementMap(transactions), [transactions]);

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

        // Filter transactions for display period (AND exclude hidden)
        const relevantTx = transactions.filter(t => {
            if (t.isHidden) return false; // Exclude hidden
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
            // STRICT MAPPING LOGIC (Same as OperatingBudgetView)
            
            // 1. Linked Subcategories
            const assignedSubs = subCategories.filter(s => s.budgetGroupId === group.id);
            
            // 2. Linked Buckets
            const linkedBuckets = buckets.filter(b => {
                const isExplicitlyLinked = b.budgetGroupId 
                    ? b.budgetGroupId === group.id 
                    : (group.linkedBucketIds && group.linkedBucketIds.includes(b.id));
                const isOrphan = !b.budgetGroupId && (!group.linkedBucketIds || !group.linkedBucketIds.includes(b.id));
                const isClaimedByCatchAll = group.isCatchAll && isOrphan;
                return isExplicitlyLinked || isClaimedByCatchAll;
            });

            // 3. Planned Budget Calculation (For current month view or average)
            let plannedBudget = 0;
            
            // Collect items for Breakdown view
            const budgetItems: { name: string; amount: number; type: 'SUB'|'BUCKET'|'BUFFER' }[] = [];

            if (timeframe === 1) {
                // Exact calculation for this month
                const { data: explicitData } = getEffectiveBudgetGroupData(group, selectedMonth, budgetTemplates, monthConfigs);
                const manualLimit = explicitData ? explicitData.limit : 0;
                
                let childrenSum = 0;

                assignedSubs.forEach(sub => {
                    const subBudget = getEffectiveSubCategoryBudget(sub, selectedMonth, budgetTemplates, monthConfigs);
                    childrenSum += subBudget;
                    if (subBudget > 0) budgetItems.push({ name: sub.name, amount: subBudget, type: 'SUB' });
                });

                linkedBuckets.forEach(b => {
                    // Logic from OperatingBudgetView
                    let cost = 0;
                    if (b.type === 'GOAL') cost = calculateGoalBucketCost(b, selectedMonth);
                    else if (b.type === 'FIXED') {
                        const { data } = getEffectiveBucketData(b, selectedMonth, budgetTemplates, monthConfigs);
                        cost = data ? data.amount : 0;
                    } else if (b.type === 'DAILY') {
                        const { data } = getEffectiveBucketData(b, selectedMonth, budgetTemplates, monthConfigs);
                        if (data) {
                            const { start, end } = getBudgetInterval(selectedMonth, settings.payday);
                            const days = eachDayOfInterval({ start, end });
                            let count = 0;
                            days.forEach(day => {
                                if (data.activeDays.includes(getDay(day))) {
                                    count++;
                                }
                            });
                            cost = count * data.dailyAmount;
                        }
                    }
                    // Filter: Only include if active/relevant
                    if (cost > 0 || isBucketActiveInMonth(b, selectedMonth)) {
                        childrenSum += cost;
                        budgetItems.push({ name: b.name, amount: cost, type: 'BUCKET' });
                    }
                });

                plannedBudget = Math.max(childrenSum, manualLimit);
                
                // Add Buffer item if applicable
                if (manualLimit > childrenSum) {
                    budgetItems.push({ name: 'Buffert / Ospecificerat', amount: manualLimit - childrenSum, type: 'BUFFER' });
                }

            } else {
                // Average budget over timeframe
                let totalOverPeriod = 0;
                for (let i = 0; i < timeframe; i++) {
                    const mDate = addMonths(parseISO(`${startMonthKey}-01`), i);
                    const mKey = format(mDate, 'yyyy-MM');
                    
                    // Helper to get budget for a month
                    const { data: gData } = getEffectiveBudgetGroupData(group, mKey, budgetTemplates, monthConfigs);
                    const mLimit = gData ? gData.limit : 0;
                    let mChildren = 0;
                    
                    // Simple sum approximation for historical
                    assignedSubs.forEach(s => mChildren += getEffectiveSubCategoryBudget(s, mKey, budgetTemplates, monthConfigs));
                    linkedBuckets.forEach(b => {
                         // Simplified cost checks for speed in loop
                         if (b.type === 'FIXED') mChildren += calculateFixedBucketCost(b, mKey);
                         else if (b.type === 'DAILY') mChildren += calculateDailyBucketCost(b, mKey, settings.payday);
                         else if (b.type === 'GOAL') mChildren += calculateGoalBucketCost(b, mKey);
                    });
                    totalOverPeriod += Math.max(mChildren, mLimit);
                }
                plannedBudget = totalOverPeriod / timeframe;
            }

            // 4. Calculate Spent
            const assignedSubIds = new Set(assignedSubs.map(s => s.id));
            const linkedBucketIds = new Set(linkedBuckets.map(b => b.id));

            // Filter transactions for this group based on STRICT mapping
            const groupTxs = relevantTx.filter(t => {
                if (excludeDreams) {
                     if (t.bucketId) {
                        const b = buckets.find(b => b.id === t.bucketId);
                        if (b?.type === 'GOAL') return false; 
                    }
                }
                
                // Check if transaction belongs to linked SubCategory
                if (t.categorySubId && assignedSubIds.has(t.categorySubId)) return true;
                
                // Check if transaction belongs to linked Bucket
                if (t.bucketId && linkedBucketIds.has(t.bucketId)) return true;

                // Catch-all Logic
                if (group.isCatchAll) {
                    // It is catch-all if:
                    // 1. Not linked to any specific bucket in another group (Orphan)
                    // 2. Not linked to any specific subcategory in another group (Orphan)
                    const sub = t.categorySubId ? subCategories.find(s => s.id === t.categorySubId) : null;
                    const bucket = t.bucketId ? buckets.find(b => b.id === t.bucketId) : null;
                    
                    const isSubOrphan = !sub || !sub.budgetGroupId;
                    const isBucketOrphan = !bucket || (!bucket.budgetGroupId && (!bucket.type || bucket.type !== 'GOAL')); // Goals usually distinct

                    // Note: If t has NO sub and NO bucket, it's definitely catch-all
                    if (!t.categorySubId && !t.bucketId) return true;
                    
                    if (t.categorySubId && isSubOrphan) return true;
                    if (t.bucketId && isBucketOrphan) return true;
                }
                return false;
            });

            let spent = 0;
            groupTxs.forEach(t => {
                const effAmount = getEffectiveAmount(t, reimbursementMap);
                const amount = Math.abs(effAmount);
                if (amount === 0) return;

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
            
            // Detailed Breakdown for UI
            
            // 4a. Subcategory Breakdown
            const breakdown = assignedSubs.map(sub => {
                let subSpent = 0;
                const subTxs = groupTxs.filter(t => t.categorySubId === sub.id);
                subTxs.forEach(t => {
                    const effAmount = getEffectiveAmount(t, reimbursementMap);
                    const amount = Math.abs(effAmount);
                    if (amount === 0) return;
                    const factor = (excludeDreams && !sub.name.toLowerCase().includes('hyra')) ? scalingFactor : 1;
                    subSpent += amount * factor;
                });
                return { ...sub, spent: subSpent / timeframe, transactions: subTxs.sort((a,b) => b.date.localeCompare(a.date)) };
            }).sort((a,b) => b.spent - a.spent);

            const totalSubSpent = breakdown.reduce((sum, s) => sum + s.spent, 0);
            
            // 4b. Bucket Breakdown (New logic to separate Buckets from Unclassified)
            const bucketBreakdown = linkedBuckets.map(b => {
                let bSpent = 0;
                const bTxs = groupTxs.filter(t => t.bucketId === b.id);
                bTxs.forEach(t => {
                    const effAmount = getEffectiveAmount(t, reimbursementMap);
                    const amount = Math.abs(effAmount);
                    if (amount === 0) return;
                    const factor = excludeDreams && b.type !== 'FIXED' ? scalingFactor : 1;
                    bSpent += amount * factor;
                });
                return { 
                    id: b.id, 
                    name: b.name, 
                    spent: bSpent / timeframe, 
                    transactions: bTxs.sort((a,b) => b.date.localeCompare(a.date)),
                    type: 'BUCKET',
                    bucketType: b.type
                };
            }).filter(b => b.spent > 0);

            const totalBucketSpent = bucketBreakdown.reduce((sum, b) => sum + b.spent, 0);

            // 4c. True Unclassified (Neither subcategory nor linked bucket)
            const nonSubOrBucketTxs = groupTxs.filter(t => 
                !assignedSubIds.has(t.categorySubId || '') && 
                !linkedBucketIds.has(t.bucketId || '')
            );
            
            // Calculate unclassified spent total
            const unclassifiedSpent = avgSpent - totalSubSpent - totalBucketSpent;
            
            return {
                ...group, 
                spent: avgSpent, 
                limit: plannedBudget, 
                remaining: plannedBudget - avgSpent,
                breakdown,
                bucketBreakdown,
                unclassifiedSpent, 
                unclassifiedTransactions: nonSubOrBucketTxs.sort((a,b) => b.date.localeCompare(a.date)),
                budgetItems
            };
        }).sort((a, b) => b.spent - a.spent);

        const totalLimit = groupStats.reduce((sum, g) => sum + g.limit, 0);
        const totalSpent = groupStats.reduce((sum, g) => sum + g.spent, 0);
        const totalRemaining = totalLimit - totalSpent;
        
        return { groupStats, totalLimit, totalSpent, totalRemaining, isScaled: excludeDreams && scalingFactor > 1.05, homeDays: homeDaysCount, totalDays, scalingFactor, rangeLabel };
    }, [budgetGroups, subCategories, transactions, selectedMonth, timeframe, excludeDreams, buckets, settings.payday, reimbursementMap, budgetTemplates, monthConfigs]);

    const handleShowBudgetBreakdown = (groupName: string, items: { name: string; amount: number; type: 'SUB'|'BUCKET'|'BUFFER' }[], total: number) => {
        // Sort items by amount desc
        const sorted = [...items].sort((a, b) => b.amount - a.amount);
        setBudgetBreakdownData({ groupName, items: sorted, total });
    };

    const handleAiAnalysis = async () => {
        setIsAiModalOpen(true);
        if (aiReport) return; 
        
        setIsAiLoading(true);
        
        try {
            const totalIncome = getTotalFamilyIncome(users, selectedMonth);
            
            const currentGroups = data.groupStats.map(g => ({
                name: g.name,
                limit: g.limit,
                spent: g.spent
            }));

            const { start, end } = getBudgetInterval(selectedMonth, settings.payday);
            const startStr = format(start, 'yyyy-MM-dd');
            const endStr = format(end, 'yyyy-MM-dd');
            const currentTxs = transactions.filter(t => !t.isHidden && t.date >= startStr && t.date <= endStr && (t.type === 'EXPENSE' || t.amount < 0));
            
            const transactionLog = currentTxs.map(t => {
                const amount = Math.abs(getEffectiveAmount(t, reimbursementMap));
                if (amount === 0) return null;
                const mainName = mainCategories.find(m => m.id === t.categoryMainId)?.name || 'Övrigt';
                const subName = subCategories.find(s => s.id === t.categorySubId)?.name || '';
                const category = subName ? `${mainName} > ${subName}` : mainName;
                return `${t.date} : ${formatMoney(amount)} : ${t.description} : ${category}`;
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

            const topExpenses = currentTxs
                .map(t => ({ name: t.description, amount: Math.abs(getEffectiveAmount(t, reimbursementMap)) }))
                .sort((a,b) => b.amount - a.amount)
                .slice(0, 5);

            const snapshot: FinancialSnapshot = {
                totalIncome,
                budgetGroups: currentGroups,
                topExpenses,
                categoryBreakdownCurrent: breakdownCurrent,
                transactionLog,
                monthLabel: data.rangeLabel
            };

            const report = await generateMonthlyReport(snapshot);
            setAiReport(report);

        } catch (error) {
            console.error(error);
            setAiReport("Kunde inte skapa analysen just nu.");
        } finally {
            setIsAiLoading(false);
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
                                    {/* Subcategories Breakdown */}
                                    {group.breakdown.map(sub => (
                                        <div key={sub.id} onClick={() => setDrillDownData({ title: sub.name, transactions: sub.transactions, grouped: false })} className="p-3 border-b border-slate-700/30 last:border-0 hover:bg-slate-800 transition-colors flex justify-between items-center cursor-pointer group">
                                            <span className="text-sm text-slate-300 group-hover:text-blue-300 transition-colors">{sub.name}</span>
                                            <span className="text-sm font-mono text-white">{formatMoney(sub.spent)}</span>
                                        </div>
                                    ))}

                                    {/* Buckets Breakdown (Goals/Fixed) */}
                                    {group.bucketBreakdown.map(bucket => (
                                        <div key={bucket.id} onClick={() => setDrillDownData({ title: bucket.name, transactions: bucket.transactions, grouped: true })} className="p-3 border-b border-slate-700/30 last:border-0 hover:bg-slate-800 transition-colors flex justify-between items-center cursor-pointer group bg-indigo-900/10">
                                            <div className="flex items-center gap-2">
                                                {bucket.bucketType === 'GOAL' ? <Target size={14} className="text-purple-400"/> : <Calendar size={14} className="text-blue-400"/>}
                                                <span className="text-sm text-slate-300 group-hover:text-blue-300 transition-colors">{bucket.name}</span>
                                            </div>
                                            <span className="text-sm font-mono text-white">{formatMoney(bucket.spent)}</span>
                                        </div>
                                    ))}

                                    {/* True Unclassified */}
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

            {/* Budget Breakdown Modal */}
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
                        {budgetBreakdownData?.items.length === 0 && <div className="text-center text-slate-500 py-4 italic">Inga poster budgeterade i denna grupp.</div>}
                    </div>
                    
                    <div className="mt-4 pt-2 border-t border-slate-700 text-xs text-slate-400">
                        Detta visar de planerade kostnaderna (Underkategorier + Fasta poster) som är kopplade till denna budgetgrupp för månaden.
                    </div>
                    
                    <div className="mt-2 flex justify-end">
                        <Button variant="secondary" onClick={() => setBudgetBreakdownData(null)}>Stäng</Button>
                    </div>
                </div>
            </Modal>

            {/* AI Analysis Modal */}
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

const AccountStats = () => {
    const { accounts, buckets, transactions, selectedMonth, settings, mainCategories, subCategories, updateTransaction } = useApp();
    const { startStr, endStr, intervalLabel } = useBudgetMonth(selectedMonth);
    const [timeframe, setTimeframe] = useState<1 | 3 | 6 | 9 | 12>(1);
    const [expandedAccount, setExpandedAccount] = useState<string | null>(null);
    const [drillDownData, setDrillDownData] = useState<{ title: string, transactions: Transaction[], grouped?: boolean } | null>(null);
    const [mappingTx, setMappingTx] = useState<Transaction | null>(null);

    const reimbursementMap = useMemo(() => calculateReimbursementMap(transactions), [transactions]);

    const data = useMemo(() => {
        let targetStartStr = startStr;
        let targetEndStr = endStr;
        let targetLabel = intervalLabel;
        if (timeframe > 1) {
            const targetEndMonth = format(subMonths(parseISO(`${selectedMonth}-01`), 1), 'yyyy-MM');
            const endDateObj = getBudgetInterval(targetEndMonth, settings.payday).end;
            const monthsBack = timeframe - 1;
            const startMonthKey = format(subMonths(parseISO(`${targetEndMonth}-01`), monthsBack), 'yyyy-MM');
            const startDateObj = getBudgetInterval(startMonthKey, settings.payday).start;
            targetStartStr = format(startDateObj, 'yyyy-MM-dd');
            targetEndStr = format(endDateObj, 'yyyy-MM-dd');
            targetLabel = `${format(startDateObj, 'MMM', { locale: sv })} - ${format(endDateObj, 'MMM yyyy', { locale: sv })}`;
        } else { targetLabel = intervalLabel; }
        
        // Filter out hidden transactions here, so they don't affect ANY calculations
        const relevantTxs = transactions.filter(t => 
            !t.isHidden && // EXCLUDE HIDDEN
            t.date >= targetStartStr && 
            t.date <= targetEndStr
        );
        
        const processedAccounts = accounts.map(acc => {
            const accBuckets = buckets.filter(b => b.accountId === acc.id);
            const regularBuckets = accBuckets.filter(b => b.type !== 'GOAL');
            const ownedDreams = accBuckets.filter(b => b.type === 'GOAL');
            const referencedDreamIds = new Set<string>();
            relevantTxs.filter(t => t.accountId === acc.id && t.bucketId).forEach(t => {
                const b = buckets.find(bk => bk.id === t.bucketId);
                if (b && b.type === 'GOAL') referencedDreamIds.add(b.id);
            });
            const allRelevantDreamIds = new Set([...ownedDreams.map(d => d.id), ...referencedDreamIds]);
            const dreams = Array.from(allRelevantDreamIds).map(id => buckets.find(b => b.id === id)!).filter(Boolean);
            
            const getBucketData = (bucketList: Bucket[]) => {
                return bucketList.map(b => {
                    let plannedTotal = 0;
                    if (b.accountId === acc.id) {
                        for(let i=0; i<timeframe; i++) {
                            const mDate = subMonths(parseISO(`${selectedMonth}-01`), i);
                            const mKey = format(mDate, 'yyyy-MM');
                            if (b.type === 'FIXED') plannedTotal += calculateFixedBucketCost(b, mKey);
                            else if (b.type === 'DAILY') plannedTotal += calculateDailyBucketCost(b, mKey, settings.payday);
                            else if (b.type === 'GOAL') plannedTotal += calculateGoalBucketCost(b, mKey);
                        }
                    }
                    const plannedAvg = plannedTotal / timeframe;
                    const bucketTxs = relevantTxs.filter(t => t.bucketId === b.id && t.accountId === acc.id);
                    
                    // Effective Calcs
                    const deposits = bucketTxs.filter(t => getEffectiveAmount(t, reimbursementMap) > 0);
                    const withdrawals = bucketTxs.filter(t => {
                        const eff = getEffectiveAmount(t, reimbursementMap);
                        return eff < 0 && t.type !== 'EXPENSE';
                    });
                    const expenses = bucketTxs.filter(t => {
                        const eff = getEffectiveAmount(t, reimbursementMap);
                        return eff < 0 && t.type === 'EXPENSE';
                    });

                    const depositSum = deposits.reduce((sum, t) => sum + getEffectiveAmount(t, reimbursementMap), 0);
                    const withdrawalSum = withdrawals.reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);
                    const expenseSum = expenses.reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);
                    
                    return { ...b, planned: plannedAvg, deposit: depositSum / timeframe, withdrawal: withdrawalSum / timeframe, expense: expenseSum / timeframe, rawDeposits: deposits, rawWithdrawals: withdrawals, rawExpenses: expenses };
                });
            };
            
            const bucketStats = getBucketData(regularBuckets);
            const dreamStats = getBucketData(dreams);
            
            const unallocatedTxs = relevantTxs.filter(t => t.accountId === acc.id && (!t.bucketId || t.bucketId === 'INTERNAL' || t.bucketId === 'PAYOUT'));
            
            const otherDeposits = unallocatedTxs.filter(t => getEffectiveAmount(t, reimbursementMap) > 0);
            const otherWithdrawals = unallocatedTxs.filter(t => {
                const eff = getEffectiveAmount(t, reimbursementMap);
                return eff < 0 && t.type !== 'EXPENSE';
            });
            const otherExpenses = unallocatedTxs.filter(t => {
                const eff = getEffectiveAmount(t, reimbursementMap);
                return eff < 0 && t.type === 'EXPENSE';
            });

            const otherStats = { 
                planned: 0, 
                deposit: otherDeposits.reduce((sum, t) => sum + getEffectiveAmount(t, reimbursementMap), 0) / timeframe, 
                withdrawal: otherWithdrawals.reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0) / timeframe, 
                expense: otherExpenses.reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0) / timeframe, 
                rawDeposits: otherDeposits, 
                rawWithdrawals: otherWithdrawals, 
                rawExpenses: otherExpenses 
            };
            
            const totalActual = bucketStats.reduce((s, b) => s + b.deposit, 0) + dreamStats.reduce((s, b) => s + b.deposit, 0) + otherStats.deposit;
            const totalOut = bucketStats.reduce((s, b) => s + b.withdrawal + b.expense, 0) + dreamStats.reduce((s, b) => s + b.withdrawal + b.expense, 0) + otherStats.withdrawal + otherStats.expense;
            const netFlow = totalActual - totalOut;
            
            return { ...acc, bucketStats, dreamStats, otherStats, netFlow };
        });
        return { processedAccounts, targetLabel };
    }, [accounts, buckets, transactions, selectedMonth, timeframe, settings.payday, startStr, endStr, intervalLabel, reimbursementMap]);

    const handleDrillDown = (title: string, txs: Transaction[], grouped = false) => { if (txs.length > 0) setDrillDownData({ title, transactions: txs, grouped }); };
    const handleMapToBucket = async (bucketId: string) => { if (!mappingTx) return; await updateTransaction({ ...mappingTx, bucketId: bucketId, type: 'TRANSFER' }); setMappingTx(null); setDrillDownData(null); };
    const availableBuckets = mappingTx ? buckets.filter(b => b.accountId === mappingTx.accountId && !b.archivedDate) : [];

    return (
        <div className="space-y-6 animate-in fade-in">
            <div className="flex flex-col gap-2">
                <div className="flex bg-slate-800 p-1 rounded-xl overflow-x-auto no-scrollbar gap-1 border border-slate-700">
                    {[1, 3, 6, 9, 12].map(m => (
                        <button key={m} onClick={() => setTimeframe(m as any)} className={cn("flex-1 px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all", timeframe === m ? "bg-cyan-600 text-white shadow-lg" : "text-slate-400 hover:text-white hover:bg-slate-700")}>{m === 1 ? 'Denna månad' : `Snitt ${m} mån`}</button>
                    ))}
                </div>
                 <div className="text-center text-xs text-slate-400 bg-slate-800/30 rounded-lg py-1 border border-slate-700/50">Beräkningsperiod: <span className="text-white font-medium">{data.targetLabel}</span></div>
            </div>
            <div className="space-y-4">
                {data.processedAccounts.map(acc => {
                    const isExpanded = expandedAccount === acc.id;
                    return (
                        <div key={acc.id} className="bg-surface border border-slate-700 rounded-xl overflow-hidden shadow-md">
                            <div className="p-4 cursor-pointer hover:bg-slate-800/80 transition-colors" onClick={() => setExpandedAccount(isExpanded ? null : acc.id)}>
                                <div className="flex items-center gap-3 mb-2">
                                    {isExpanded ? <ChevronDown className="w-5 h-5 text-cyan-400"/> : <ChevronRight className="w-5 h-5 text-slate-500"/>}
                                    <div className="text-xl">{acc.icon}</div>
                                    <div className="flex-1"><div className="font-bold text-white text-lg">{acc.name}</div></div>
                                    <div className="text-right"><div className="text-xs text-slate-400 uppercase font-bold">Nettoflöde</div><div className={cn("font-mono font-bold", acc.netFlow >= 0 ? "text-emerald-400" : "text-rose-400")}>{formatMoney(acc.netFlow)}</div></div>
                                </div>
                            </div>
                            {isExpanded && (
                                <div className="bg-slate-900/30 border-t border-slate-700/50 p-2 overflow-x-auto">
                                    <div className="grid grid-cols-5 gap-2 text-[9px] uppercase font-bold text-slate-500 tracking-wider border-b border-slate-700 pb-2 mb-2 px-2 min-w-[350px]">
                                        <div className="col-span-1">Post</div><div className="text-right text-blue-300">Plan Ins.</div><div className="text-right text-emerald-400">Insättning</div><div className="text-right text-orange-300">Uttag</div><div className="text-right text-rose-400">Utgifter</div>
                                    </div>
                                    {acc.bucketStats.length > 0 && (
                                        <div className="space-y-1 mb-4 min-w-[350px]">
                                            <div className="text-[10px] font-bold text-cyan-400 uppercase flex items-center gap-1 px-2 mb-1"><LayoutGrid size={10} /> Fasta & Rörliga</div>
                                            {acc.bucketStats.map(b => (
                                                <div key={b.id} className="grid grid-cols-5 gap-2 text-[10px] items-center hover:bg-white/5 p-2 rounded transition-colors">
                                                    <div className="col-span-1 font-medium text-slate-300 truncate" title={b.name}>{b.name}</div>
                                                    <div className="text-right text-blue-200/70 font-mono">{formatMoney(b.planned)}</div>
                                                    <div className={cn("text-right font-mono cursor-pointer hover:bg-emerald-500/20 rounded px-1", b.deposit > 0 ? "text-emerald-400 font-bold" : "text-slate-600")} onClick={() => handleDrillDown(`${b.name} - Insättningar`, b.rawDeposits)}>{formatMoney(b.deposit)}</div>
                                                    <div className={cn("text-right font-mono cursor-pointer hover:bg-orange-500/20 rounded px-1", b.withdrawal > 0 ? "text-orange-300" : "text-slate-600")} onClick={() => handleDrillDown(`${b.name} - Uttag (Överföringar)`, b.rawWithdrawals)}>{formatMoney(b.withdrawal)}</div>
                                                    <div className={cn("text-right font-mono cursor-pointer hover:bg-rose-500/20 rounded px-1", b.expense > 0 ? "text-rose-400" : "text-slate-600")} onClick={() => handleDrillDown(`${b.name} - Utgifter (Konsumtion)`, b.rawExpenses, true)}>{formatMoney(b.expense)}</div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {acc.dreamStats.length > 0 && (
                                        <div className="space-y-1 mb-4 min-w-[350px]">
                                            <div className="text-[10px] font-bold text-purple-400 uppercase flex items-center gap-1 px-2 mb-1"><Target size={10} /> Drömmar & Mål</div>
                                            {acc.dreamStats.map(b => (
                                                <div key={b.id} className="grid grid-cols-5 gap-2 text-[10px] items-center hover:bg-white/5 p-2 rounded transition-colors">
                                                    <div className="col-span-1 font-medium text-slate-300 truncate" title={b.name}>{b.name}</div>
                                                    <div className="text-right text-blue-200/70 font-mono">{formatMoney(b.planned)}</div>
                                                    <div className={cn("text-right font-mono cursor-pointer hover:bg-emerald-500/20 rounded px-1", b.deposit > 0 ? "text-emerald-400 font-bold" : "text-slate-600")} onClick={() => handleDrillDown(`${b.name} - Insättningar`, b.rawDeposits)}>{formatMoney(b.deposit)}</div>
                                                    <div className={cn("text-right font-mono cursor-pointer hover:bg-orange-500/20 rounded px-1", b.withdrawal > 0 ? "text-orange-300" : "text-slate-600")} onClick={() => handleDrillDown(`${b.name} - Uttag`, b.rawWithdrawals)}>{formatMoney(b.withdrawal)}</div>
                                                    <div className={cn("text-right font-mono cursor-pointer hover:bg-rose-500/20 rounded px-1", b.expense > 0 ? "text-rose-400" : "text-slate-600")} onClick={() => handleDrillDown(`${b.name} - Utgifter`, b.rawExpenses, true)}>{formatMoney(b.expense)}</div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    <div className="space-y-1 pt-2 border-t border-slate-700/30 min-w-[350px]">
                                        <div className="text-[10px] font-bold text-orange-400 uppercase flex items-center gap-1 px-2"><AlertOctagon size={10} /> Övrigt / Okopplat</div>
                                        <div className="grid grid-cols-5 gap-2 text-[10px] items-center hover:bg-white/5 p-2 rounded transition-colors">
                                            <div className="col-span-1 font-medium text-slate-300">Övriga Transaktioner</div>
                                            <div className="text-right text-slate-600 font-mono">-</div>
                                            <div className={cn("text-right font-mono cursor-pointer hover:bg-emerald-500/20 rounded px-1", acc.otherStats.deposit > 0 ? "text-emerald-400 font-bold" : "text-slate-600")} onClick={() => handleDrillDown(`Okopplade Insättningar (${acc.name})`, acc.otherStats.rawDeposits)}>{formatMoney(acc.otherStats.deposit)}</div>
                                            <div className={cn("text-right font-mono cursor-pointer hover:bg-orange-500/20 rounded px-1", acc.otherStats.withdrawal > 0 ? "text-orange-300" : "text-slate-600")} onClick={() => handleDrillDown(`Okopplade Uttag (${acc.name})`, acc.otherStats.rawWithdrawals)}>{formatMoney(acc.otherStats.withdrawal)}</div>
                                            <div className={cn("text-right font-mono cursor-pointer hover:bg-rose-500/20 rounded px-1", acc.otherStats.expense > 0 ? "text-rose-400" : "text-slate-600")} onClick={() => handleDrillDown(`Okopplade Utgifter (${acc.name})`, acc.otherStats.rawExpenses, true)}>{formatMoney(acc.otherStats.expense)}</div>
                                        </div>
                                    </div>
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
                            drillDownData.transactions.map(t => (
                                <div key={t.id} onClick={() => setMappingTx(t)} className="flex justify-between items-center p-3 bg-slate-900/50 border border-slate-800 rounded-lg cursor-pointer hover:bg-slate-800 hover:border-blue-500/50 transition-all group">
                                    <div className="flex-1 mr-4 overflow-hidden">
                                        <div className="text-white font-medium truncate flex items-center gap-2">{t.description}<ChevronRight className="w-3 h-3 text-slate-600 group-hover:text-blue-400 transition-colors" /></div>
                                        <div className="text-xs text-slate-500">{t.date}</div>
                                    </div>
                                    <div className={cn("font-mono font-bold whitespace-nowrap", getEffectiveAmount(t, reimbursementMap) > 0 ? "text-emerald-400" : "text-white")}>{getEffectiveAmount(t, reimbursementMap) > 0 ? '+' : ''}{formatMoney(getEffectiveAmount(t, reimbursementMap))}</div>
                                </div>
                            ))
                        ) : (
                            <div className="text-center text-slate-500 py-8 italic">Inga transaktioner hittades för denna period.</div>
                        )}
                    </div>
                )}
                <div className="mt-4 border-t border-slate-700 pt-4 flex justify-end"><Button variant="secondary" onClick={() => setDrillDownData(null)}>Stäng</Button></div>
            </Modal>
            <Modal isOpen={!!mappingTx} onClose={() => setMappingTx(null)} title="Koppla till Budgetpost">
                <div className="space-y-4">
                    <div className="bg-slate-800 p-3 rounded-lg text-sm mb-4 border border-slate-700">
                        <div className="text-slate-400 text-xs uppercase mb-1">Transaktion</div>
                        <div className="font-bold text-white">{mappingTx?.description}</div>
                        <div className="font-mono text-white">{formatMoney(mappingTx ? getEffectiveAmount(mappingTx, reimbursementMap) : 0)}</div>
                    </div>
                    <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                        <p className="text-xs text-slate-400 uppercase font-bold tracking-wider px-1">Välj Bucket</p>
                        {availableBuckets.map(b => (
                            <button key={b.id} onClick={() => handleMapToBucket(b.id)} className="w-full text-left p-3 rounded-xl bg-slate-700/50 hover:bg-blue-600 hover:text-white transition-all flex items-center gap-3 group">
                                <div className="p-2 bg-slate-800 rounded-lg text-slate-400 group-hover:bg-white/20 group-hover:text-white"><Wallet size={16} /></div>
                                <div className="flex-1"><div className="font-bold text-sm">{b.name}</div><div className="text-xs opacity-70 group-hover:text-blue-100">{b.type === 'FIXED' ? 'Fast' : (b.type === 'DAILY' ? 'Rörlig' : 'Mål')}</div></div>
                                <ArrowRight size={16} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                            </button>
                        ))}
                        {availableBuckets.length === 0 && <div className="text-center text-slate-500 py-4 italic">Inga budgetposter hittades för detta konto.</div>}
                    </div>
                </div>
            </Modal>
        </div>
    );
};

// --- SUB-COMPONENT: INSIGHTS & DNA ---
const InsightsAnalysis = () => {
    const { transactions, buckets, settings, mainCategories, users, selectedMonth, subCategories } = useApp();
    const [insightTimeframe, setInsightTimeframe] = useState<1 | 3 | 6 | 9 | 12>(1);

    const reimbursementMap = useMemo(() => calculateReimbursementMap(transactions), [transactions]);

    const analysisData = useMemo(() => {
        // 1. Datumintervall (samma logik som budgeten)
        const currentEndDate = getBudgetInterval(selectedMonth, settings.payday).end;
        
        // Hitta startdatum baserat på lönemånad
        const startMonthDate = subMonths(parseISO(`${selectedMonth}-01`), insightTimeframe - 1);
        const startMonthKey = format(startMonthDate, 'yyyy-MM');
        const startDateObj = getBudgetInterval(startMonthKey, settings.payday).start;

        const startStr = format(startDateObj, 'yyyy-MM-dd');
        const endStr = format(currentEndDate, 'yyyy-MM-dd');

        // Filtrera transaktioner (Utgifter)
        const allTxs = transactions.filter(t => !t.isHidden && t.date >= startStr && t.date <= endStr);
        const expenseTxs = allTxs.filter(t => t.type === 'EXPENSE' || (!t.type && t.amount < 0));
        
        const income = getTotalFamilyIncome(users, selectedMonth); 

        // Hjälpfunktion för att städa namn
        const cleanName = (desc: string) => {
            let name = desc.trim();
            const parts = name.split(' ');
            if (parts.length > 1) name = `${parts[0]} ${parts[1]}`;
            else name = parts[0];
            return name.replace(/AB|SE|Kortköp|Reserverat/gi, '').trim();
        };

        // 2. PENGAMAGNETERNA (Top Merchants) using Effective Amount
        const merchantMap = new Map<string, number>();
        const merchantCountMap = new Map<string, number>();

        expenseTxs.forEach(t => {
            const eff = Math.abs(getEffectiveAmount(t, reimbursementMap));
            if (eff === 0) return;

            if (t.bucketId && !t.categoryMainId) return; 
            const name = cleanName(t.description);
            merchantMap.set(name, (merchantMap.get(name) || 0) + eff);
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

        // 3. VANEDJURET (Frekvens)
        const frequentSpenders = Array.from(merchantCountMap.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([name, count], index) => ({
                rank: index + 1, 
                name,
                count: Math.round(count / insightTimeframe * 10) / 10,
                totalAmount: Math.round((merchantMap.get(name) || 0) / insightTimeframe)
            }));

        // 4. SMÅUTGIFTER ("Lattefaktorn") < 200 kr
        const smallTxMap = new Map<string, { total: number, count: number }>();
        expenseTxs.forEach(t => {
            const eff = Math.abs(getEffectiveAmount(t, reimbursementMap));
            if (eff === 0 || eff >= 200) return;

            const name = cleanName(t.description);
            const current = smallTxMap.get(name) || { total: 0, count: 0 };
            smallTxMap.set(name, { total: current.total + eff, count: current.count + 1 });
        });

        const topSmallSpends = Array.from(smallTxMap.entries())
            .sort((a, b) => b[1].total - a[1].total)
            .slice(0, 10)
            .map(([name, data], index) => ({
                rank: index + 1, 
                name,
                amount: Math.round(data.total / insightTimeframe),
                count: Math.round(data.count / insightTimeframe * 10) / 10
            }));

        const totalSmallSpendMonthly = topSmallSpends.reduce((sum, item) => sum + item.amount, 0);
        const smallMonthly = totalSmallSpendMonthly;

        // 5. TRENDBROTT (Jämför med föregående period)
        const prevEndMonthDate = subMonths(parseISO(`${selectedMonth}-01`), insightTimeframe);
        const prevEndMonthKey = format(prevEndMonthDate, 'yyyy-MM');
        const prevEndDateObj = getBudgetInterval(prevEndMonthKey, settings.payday).end;
        
        const prevStartMonthDate = subMonths(prevEndMonthDate, insightTimeframe - 1);
        const prevStartMonthKey = format(prevStartMonthDate, 'yyyy-MM');
        const prevStartDateObj = getBudgetInterval(prevStartMonthKey, settings.payday).start;

        const prevStartStr = format(prevStartDateObj, 'yyyy-MM-dd');
        const prevEndStr = format(prevEndDateObj, 'yyyy-MM-dd');

        const prevTxs = transactions.filter(t => 
            !t.isHidden && // exclude hidden
            t.date >= prevStartStr && 
            t.date <= prevEndStr && 
            (t.type === 'EXPENSE' || (!t.type && t.amount < 0))
        );

        const currCatTotals = new Map<string, number>();
        const prevCatTotals = new Map<string, number>();

        expenseTxs.forEach(t => {
            const eff = Math.abs(getEffectiveAmount(t, reimbursementMap));
            if (t.categoryMainId && eff > 0) {
                currCatTotals.set(t.categoryMainId, (currCatTotals.get(t.categoryMainId) || 0) + eff);
            }
        });
        prevTxs.forEach(t => {
            const eff = Math.abs(getEffectiveAmount(t, reimbursementMap));
            if (t.categoryMainId && eff > 0) {
                prevCatTotals.set(t.categoryMainId, (prevCatTotals.get(t.categoryMainId) || 0) + eff);
            }
        });

        const trendBreakers = mainCategories.map(cat => {
            const curr = (currCatTotals.get(cat.id) || 0) / insightTimeframe;
            const prev = (prevCatTotals.get(cat.id) || 0) / insightTimeframe;
            const diff = curr - prev;
            const percent = prev > 0 ? (diff / prev) * 100 : (curr > 0 ? 100 : 0);
            return { name: cat.name, curr, prev, diff, percent };
        })
        .filter(t => Math.abs(t.diff) > 500)
        .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
        .slice(0, 5);

        // 6. EKONOMISKT DNA (Radar)
        const dayCounts = [0,0,0,0,0,0,0];
        const daySums = [0,0,0,0,0,0,0];
        const daysInInterval = eachDayOfInterval({ start: startDateObj, end: currentEndDate });
        daysInInterval.forEach(d => dayCounts[getDay(d)]++);
        expenseTxs.forEach(t => {
            const eff = Math.abs(getEffectiveAmount(t, reimbursementMap));
            if (eff === 0) return;
            const day = getDay(parseISO(t.date));
            daySums[day] += eff;
        });
        const days = ['Sön', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör'];
        const rhythmData = days.map((day, i) => ({ 
            day, 
            amount: dayCounts[i] > 0 ? Math.round(daySums[i] / dayCounts[i]) : 0 
        }));
        const maxDayVal = Math.max(...rhythmData.map(r => r.amount));
        const peakDay = rhythmData.find(r => r.amount === maxDayVal);

        let totalSavings = 0; let totalFun = 0; let totalSecurity = 0; let totalFood = 0; let totalConsumption = 0;
        expenseTxs.forEach(t => {
            const amt = Math.abs(getEffectiveAmount(t, reimbursementMap));
            if (amt === 0) return;
            totalConsumption += amt;
            const cid = t.categoryMainId;
            if (cid === '1' || cid === '3' || cid === '6') totalSecurity += amt; 
            if (cid === '4' || cid === '5' || cid === '202') totalFun += amt; 
            if (cid === '2' && t.categorySubId !== '202') totalFood += amt; 
        });
        const savingTxs = allTxs.filter(t => t.type === 'TRANSFER' && t.bucketId);
        savingTxs.forEach(t => {
            const b = buckets.find(bk => bk.id === t.bucketId);
            const amt = Math.abs(getEffectiveAmount(t, reimbursementMap));
            if (b && b.isSavings) totalSavings += amt;
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

        // 7. Savings Opportunity
        const opportunityMap = new Map<string, number>();
        expenseTxs.forEach(t => {
            const amt = Math.abs(getEffectiveAmount(t, reimbursementMap));
            if (amt === 0) return;
            if (t.categoryMainId === '4' || t.categoryMainId === '5' || t.categoryMainId === '202') { 
                if (t.categorySubId) {
                    const sub = subCategories.find(s => s.id === t.categorySubId);
                    if (sub) opportunityMap.set(sub.name, (opportunityMap.get(sub.name) || 0) + amt);
                }
            }
        });
        const topOpportunity = Array.from(opportunityMap.entries()).sort((a,b) => b[1] - a[1])[0];
        
        const weekendSpend = daySums[0] + daySums[5] + daySums[6];
        const weekdaySpend = daySums[1] + daySums[2] + daySums[3] + daySums[4];
        const weekendRatio = (weekendSpend / (weekendSpend + weekdaySpend)) * 100;

        // 8. Mat-kvoten
        const grocerySpend = expenseTxs.filter(t => t.categorySubId === '201').reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);
        const restaurantSpend = expenseTxs.filter(t => t.categorySubId === '202').reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);
        const foodRatio = grocerySpend > 0 ? Math.round((restaurantSpend / grocerySpend) * 100) : 0;

        // 9. Inflation Check
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
            const avgCurrent = currentMerchantTxs.length > 0 ? currentMerchantTxs.reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0) / currentMerchantTxs.length : 0;
            const prevMerchantTxs = prevTxs.filter(t => t.categorySubId === '201' && cleanName(t.description) === merchantName);
            const avgPrev = prevMerchantTxs.length > 0 ? prevMerchantTxs.reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0) / prevMerchantTxs.length : 0;
            
            if (avgPrev > 0) {
                inflationData = { store: merchantName, current: avgCurrent, prev: avgPrev, diff: avgCurrent - avgPrev };
            }
        }

        // 10. Dubbel-dragningar (Uses Raw Amounts to detect duplicates on bank side)
        const duplicateCandidates: Transaction[] = [];
        const seenTx = new Set<string>();
        expenseTxs.forEach(t => {
            const key = `${t.date}-${Math.abs(t.amount)}-${t.description.trim()}`;
            if (seenTx.has(key)) {
                duplicateCandidates.push(t);
            }
            seenTx.add(key);
        });

        // 11. Dröm-accelerator
        let dreamAccelData = null;
        const potentialSaving = smallMonthly * 0.5;
        const activeGoals = buckets.filter(b => b.type === 'GOAL' && !b.archivedDate && b.targetAmount > 0 && b.targetDate);
        if (activeGoals.length > 0 && potentialSaving > 0) {
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
            dreamAccelData
        };
    }, [transactions, users, selectedMonth, buckets, settings.payday, mainCategories, subCategories, insightTimeframe, reimbursementMap]);

    const { 
        radarData, topMerchants, rhythmData, peakDay, topOpportunity, weekendRatio, 
        topSmallSpends, totalSmallSpendMonthly, trendBreakers, frequentSpenders,
        foodRatio, inflationData, duplicateCandidates, dreamAccelData
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

            {/* HERO SECTION: DNA */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-1 rounded-3xl shadow-2xl border border-slate-700/50 relative overflow-hidden">
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

            {/* FINANSIELL RÖNTGEN */}
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

                {/* 3. DREAM ACCELERATOR */}
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

                {/* 4. DUPLICATES */}
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

            {/* KLASSISK ANALYS */}
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 px-1 mt-6">
                <Zap className="w-4 h-4 text-yellow-400" /> Klassisk Analys
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* STÖRSTA BOVEN */}
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

                {/* HELG-EFFEKTEN */}
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

                {/* TRENDBROTT */}
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
                    </div>
                </div>
            </div>

            {/* SMÅUTGIFTER */}
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
                </div>
            </div>

            {/* PENGAMAGNETERNA & VANEDJURET */}
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

            {/* SPENDERYTMEN */}
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

// --- SUB-COMPONENT: TRENDS ANALYSIS (Updated) ---
const TrendsAnalysis = () => {
    const { transactions, buckets, settings, budgetGroups, mainCategories, subCategories, users } = useApp(); 
    const [trendMonths, setTrendMonths] = useState<6 | 12>(6);
    
    // --- FILTERS ---
    const [trendMainCat, setTrendMainCat] = useState('');
    const [trendSubCat, setTrendSubCat] = useState('');
    
    // --- VIEW TOGGLE ---
    const [viewScope, setViewScope] = useState<'TOTAL' | 'COSTS'>('TOTAL');

    const reimbursementMap = useMemo(() => calculateReimbursementMap(transactions), [transactions]);

    const trendData = useMemo(() => {
        const result = [];
        const today = new Date();
        const payday = settings.payday;

        // Shades of Green for Income
        const userColors = ['#4ade80', '#22c55e', '#86efac', '#15803d']; 

        for (let i = trendMonths - 1; i >= 0; i--) {
            const date = subMonths(today, i);
            const monthKey = format(date, 'yyyy-MM');
            const { start, end } = getBudgetInterval(monthKey, payday);
            const startStr = format(start, 'yyyy-MM-dd');
            const endStr = format(end, 'yyyy-MM-dd');

            // 1. Fetch relevant transactions
            const monthTxs = transactions.filter(t => 
                !t.isHidden && // EXCLUDE HIDDEN
                t.date >= startStr && 
                t.date <= endStr
            );

            // Filter for Expenses
            const expenseTxs = monthTxs.filter(t => 
                (t.type === 'EXPENSE' || (!t.type && t.amount < 0))
            ).filter(t => {
                if (trendMainCat && t.categoryMainId !== trendMainCat) return false;
                if (trendSubCat && t.categorySubId !== trendSubCat) return false;
                return true;
            });

            // 2. Split into Operating vs Dreams (Using Effective Amount)
            let operating = 0;
            let dreams = 0;

            expenseTxs.forEach(t => {
                const amt = Math.abs(getEffectiveAmount(t, reimbursementMap));
                if (amt === 0) return;

                let isDream = false;
                if (t.bucketId) {
                    const b = buckets.find(bk => bk.id === t.bucketId);
                    if (b && b.type === 'GOAL') {
                        isDream = true;
                    }
                }
                
                if (isDream) {
                    dreams += amt;
                } else {
                    operating += amt;
                }
            });

            // 3. Calculate Income per User & Payouts (Only if NO filters active)
            let incomeData: Record<string, number> = {};
            let payouts = 0;

            if (!trendMainCat && !trendSubCat) {
                // Income
                users.forEach(u => {
                    const data = u.incomeData[monthKey];
                    const total = (data?.salary || 0) + (data?.childBenefit || 0) + (data?.insurance || 0);
                    incomeData[`inc_${u.id}`] = total;
                });

                // Payouts (Transfers out, bucketId === 'PAYOUT')
                const payoutTxs = monthTxs.filter(t => t.bucketId === 'PAYOUT');
                payouts = payoutTxs.reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);
            }

            // 4. Calculate Budget
            let budgetLimit = 0;
            if (!trendMainCat && !trendSubCat) {
                budgetLimit = budgetGroups.reduce((sum, g) => {
                    const { data } = getEffectiveBudgetGroupData(g, monthKey);
                    return sum + (data?.limit || 0);
                }, 0);
            }

            result.push({
                month: format(date, 'MMM', { locale: sv }),
                fullMonth: format(date, 'yyyy-MM'),
                budget: budgetLimit,
                operating: Math.round(operating),
                dreams: Math.round(dreams),
                payouts: Math.round(payouts),
                totalExpense: Math.round(operating + dreams + payouts),
                ...incomeData
            });
        }
        return { data: result, userColors };
    }, [transactions, buckets, budgetGroups, settings.payday, trendMonths, trendMainCat, trendSubCat, users, reimbursementMap]);

    const availableSubCats = useMemo(() => {
        if (!trendMainCat) return [];
        return subCategories.filter(s => s.mainCategoryId === trendMainCat);
    }, [trendMainCat, subCategories]);

    // Show Full Comparison if NO Filters AND ViewScope is TOTAL
    const showIncome = !trendMainCat && !trendSubCat && viewScope === 'TOTAL';
    const showBudget = !trendMainCat && !trendSubCat;

    return (
        <div className="space-y-6 animate-in fade-in">
            
            {/* CONTROLS */}
            <div className="flex flex-col gap-3">
                <div className="flex justify-between items-center">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">
                        Budget vs Verklighet
                    </h3>
                    <div className="flex bg-slate-800 p-1 rounded-lg">
                        <button onClick={() => setTrendMonths(6)} className={cn("px-3 py-1.5 text-xs font-bold rounded transition-all", trendMonths === 6 ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white")}>6 Mån</button>
                        <button onClick={() => setTrendMonths(12)} className={cn("px-3 py-1.5 text-xs font-bold rounded transition-all", trendMonths === 12 ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white")}>1 År</button>
                    </div>
                </div>

                {/* VIEW SCOPE TOGGLE */}
                <div className="flex bg-slate-900 p-1 rounded-lg w-full">
                    <button 
                        onClick={() => setViewScope('TOTAL')}
                        className={cn("flex-1 px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2", 
                            viewScope === 'TOTAL' ? "bg-slate-700 text-white shadow" : "text-slate-400 hover:text-white"
                        )}
                    >
                        <Eye size={14} /> Totalbild
                    </button>
                    <button 
                        onClick={() => setViewScope('COSTS')}
                        className={cn("flex-1 px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2", 
                            viewScope === 'COSTS' ? "bg-rose-600 text-white shadow" : "text-slate-400 hover:text-white"
                        )}
                    >
                        <EyeOff size={14} /> Bara Kostnader
                    </button>
                </div>

                {/* FILTERS */}
                <div className="grid grid-cols-2 gap-2 bg-slate-900/50 p-2 rounded-lg border border-slate-800">
                    <select 
                        className="bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs text-white outline-none focus:border-indigo-500"
                        value={trendMainCat}
                        onChange={(e) => {
                            setTrendMainCat(e.target.value);
                            setTrendSubCat(''); 
                        }}
                    >
                        <option value="">Alla Kategorier</option>
                        {mainCategories.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>

                    <select 
                        className="bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs text-white outline-none focus:border-indigo-500 disabled:opacity-50"
                        value={trendSubCat}
                        onChange={(e) => setTrendSubCat(e.target.value)}
                        disabled={!trendMainCat}
                    >
                        <option value="">Alla Underkategorier</option>
                        {availableSubCats.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* CHART */}
            <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700 h-80 relative shadow-inner">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={trendData.data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                            <linearGradient id="colorBudget" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2}/>
                                <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                        <XAxis dataKey="month" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(val) => `${(val/1000).toFixed(0)}k`} />
                        <Tooltip 
                            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px', color: '#fff' }}
                            formatter={(value: number, name: string) => {
                                if (name === 'operating') return [formatMoney(value), 'Driftkostnad'];
                                if (name === 'dreams') return [formatMoney(value), 'Drömmar/Resor'];
                                if (name === 'payouts') return [formatMoney(value), 'Utbetalningar'];
                                if (name === 'budget') return [formatMoney(value), 'Budgettak'];
                                if (name.startsWith('inc_')) {
                                    const uid = name.replace('inc_', '');
                                    const u = users.find(user => user.id === uid);
                                    return [formatMoney(value), `Inkomst ${u ? u.name : ''}`];
                                }
                                return [formatMoney(value), name];
                            }}
                            labelStyle={{ color: '#94a3b8', marginBottom: '0.5rem' }}
                        />
                        <Legend iconType="circle" wrapperStyle={{ paddingTop: '10px', fontSize: '10px' }} />
                        
                        {showBudget && (
                            <Area type="monotone" dataKey="budget" name="Budget" stroke="#6366f1" strokeWidth={2} fill="url(#colorBudget)" />
                        )}
                        
                        {/* LEFT STACK: INCOME (Only if ShowIncome is true) */}
                        {showIncome && users.map((u, i) => (
                            <Bar 
                                key={u.id} 
                                dataKey={`inc_${u.id}`} 
                                name={`Inkomst ${u.name}`} 
                                stackId="left" 
                                fill={trendData.userColors[i % trendData.userColors.length]} 
                                radius={i === users.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} 
                                barSize={20} 
                            />
                        ))}

                        {/* RIGHT STACK: EXPENSES (Drift is now RED) */}
                        <Bar dataKey="operating" name="Drift" stackId="right" fill="#ef4444" radius={[0, 0, 4, 4]} barSize={20} />
                        <Bar dataKey="dreams" name="Drömmar" stackId="right" fill="#8b5cf6" radius={[4, 4, 0, 0]} barSize={20} />
                        {showIncome && <Bar dataKey="payouts" name="Utbetalningar" stackId="right" fill="#f97316" radius={[4, 4, 0, 0]} barSize={20} />}
                        
                    </ComposedChart>
                </ResponsiveContainer>
                {!showBudget && (
                    <div className="absolute top-2 right-4 text-[10px] text-slate-500 bg-black/20 px-2 py-1 rounded">
                        Budget & Inkomst visas ej vid filtrering
                    </div>
                )}
            </div>
            
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {trendData.data.slice(trendMonths === 6 ? -3 : -4).reverse().map(d => {
                    const isOverBudget = d.budget > 0 && d.operating > d.budget;
                    return (
                        <div key={d.fullMonth} className={cn("p-3 rounded-xl border flex flex-col justify-between", isOverBudget ? "bg-rose-950/20 border-rose-500/20" : "bg-slate-800 border-slate-700")}>
                            <div className="flex justify-between items-start mb-2">
                                <div className="text-xs font-bold text-slate-400 uppercase capitalize">{d.month}</div>
                                {d.dreams > 0 && <div className="h-2 w-2 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(139,92,246,0.5)]"></div>}
                            </div>
                            
                            <div>
                                <div className="text-lg font-mono font-bold text-white">{formatMoney(d.totalExpense)}</div>
                                <div className="text-[10px] text-slate-500 mt-1 flex justify-between items-center">
                                    {d.budget > 0 ? (
                                        <>
                                            <span>Budget: {formatMoney(d.budget)}</span>
                                            {isOverBudget && <AlertTriangle size={10} className="text-rose-500" />}
                                        </>
                                    ) : (
                                        <span className="italic">Filter aktivt</span>
                                    )}
                                </div>
                            </div>
                            
                            {/* Mini Progress Bar */}
                            <div className="w-full bg-slate-700/50 h-1 mt-2 rounded-full overflow-hidden flex">
                                <div className="h-full bg-rose-500" style={{ width: `${d.totalExpense > 0 ? Math.min(100, (d.operating / d.totalExpense) * 100) : 0}%` }}></div>
                                <div className="h-full bg-purple-500" style={{ width: `${d.totalExpense > 0 ? Math.min(100, (d.dreams / d.totalExpense) * 100) : 0}%` }}></div>
                                <div className="h-full bg-orange-500" style={{ width: `${d.totalExpense > 0 ? Math.min(100, (d.payouts / d.totalExpense) * 100) : 0}%` }}></div>
                            </div>
                        </div>
                    );
                })}
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
