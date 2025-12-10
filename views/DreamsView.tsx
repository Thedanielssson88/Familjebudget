import React, { useEffect, useState, useMemo } from 'react';
import { useApp } from '../store';
import { calculateSavedAmount, calculateGoalBucketCost, formatMoney } from '../utils';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { format, parseISO, isValid, addMonths, differenceInMonths } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Archive, CheckCircle, Pause, Play, Rocket, TrendingUp, Calendar, Trash2, Settings, Save, Search, Receipt, CheckSquare, Square, X, Unlink, Wallet, PiggyBank, PieChart as PieChartIcon, ChevronDown, ChevronRight } from 'lucide-react';
import { cn, Button, Modal, Input } from '../components/components';
import { Bucket, Transaction } from '../types';
import { db } from '../db';

// Animated Number Component
const AnimatedNumber = ({ value }: { value: number }) => {
    const [displayValue, setDisplayValue] = useState(0);

    useEffect(() => {
        let start = displayValue;
        const end = value;
        const duration = 1000;
        const startTime = performance.now();

        const animate = (currentTime: number) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Ease out cubic
            const ease = 1 - Math.pow(1 - progress, 3);
            
            setDisplayValue(start + (end - start) * ease);

            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        requestAnimationFrame(animate);
    }, [value]);

    return <span>{formatMoney(displayValue)}</span>;
};

interface DreamCardProps {
    goal: Bucket;
    isArchived: boolean;
    selectedMonth: string;
    transactions: Transaction[];
    onArchive: (id: string, name: string) => void;
    onDelete: (id: string, name: string) => void;
    onEdit: (goal: Bucket) => void;
}

// Sub-component for individual dream card to handle simulation/pause state
const DreamCard: React.FC<DreamCardProps> = ({ goal, isArchived, selectedMonth, transactions, onArchive, onDelete, onEdit }) => {
    const { updateBucket, mainCategories, subCategories } = useApp();
    const [isSimulating, setIsSimulating] = useState(false);
    const [simulatedExtra, setSimulatedExtra] = useState(0);

    // Stats State
    const [isStatsOpen, setIsStatsOpen] = useState(false);
    const [expandedStats, setExpandedStats] = useState<Set<string>>(new Set());
    const [expandedSubStats, setExpandedSubStats] = useState<Set<string>>(new Set());

    // Calculate core metrics
    const saved = calculateSavedAmount(goal, selectedMonth);
    const remaining = Math.max(0, goal.targetAmount - saved);
    const progress = goal.targetAmount > 0 ? Math.min(100, (saved / goal.targetAmount) * 100) : 0;
    
    // Calculate total Booked Spend (Transactions linked to this goal)
    const totalBooked = useMemo(() => {
        return transactions
            .filter(t => t.bucketId === goal.id && (t.type === 'EXPENSE' || t.amount < 0))
            .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    }, [transactions, goal.id]);

    // Calculate Stats Breakdown
    const statsBreakdown = useMemo(() => {
        const relevantTxs = transactions.filter(t => t.bucketId === goal.id && (t.type === 'EXPENSE' || t.amount < 0));
        
        const mains = mainCategories.map(main => {
            const mainTxs = relevantTxs.filter(t => t.categoryMainId === main.id);
            if (mainTxs.length === 0) return null;
            
            const mainTotal = mainTxs.reduce((sum, t) => sum + Math.abs(t.amount), 0);
            
            const subs = subCategories
                .filter(s => s.mainCategoryId === main.id)
                .map(sub => {
                    const subTxs = mainTxs.filter(t => t.categorySubId === sub.id);
                    if (subTxs.length === 0) return null;
                    const subTotal = subTxs.reduce((sum, t) => sum + Math.abs(t.amount), 0);
                    return { ...sub, total: subTotal, transactions: subTxs };
                })
                .filter((s): s is NonNullable<typeof s> => !!s)
                .sort((a, b) => b.total - a.total);

            // Unassigned
            const unassignedTxs = mainTxs.filter(t => !t.categorySubId);
            if (unassignedTxs.length > 0) {
                const unTotal = unassignedTxs.reduce((sum, t) => sum + Math.abs(t.amount), 0);
                subs.push({ id: 'orphan', mainCategoryId: main.id, name: 'Övrigt', total: unTotal, description: '', budgetGroupId: '', transactions: unassignedTxs });
            }

            return { ...main, total: mainTotal, subs };
        }).filter((m): m is NonNullable<typeof m> => !!m).sort((a, b) => b.total - a.total);

        // Also handle completely uncategorized (no main cat)
        const uncategorizedTxs = relevantTxs.filter(t => !t.categoryMainId);
        if (uncategorizedTxs.length > 0) {
            const total = uncategorizedTxs.reduce((sum, t) => sum + Math.abs(t.amount), 0);
            mains.push({ 
                id: 'uncat', 
                name: 'Okategoriserat', 
                description: '', 
                total, 
                subs: [{ id: 'uncat-sub', mainCategoryId: 'uncat', name: 'Övrigt', total, description: '', budgetGroupId: '', transactions: uncategorizedTxs }] 
            });
        }

        return mains;
    }, [transactions, goal.id, mainCategories, subCategories]);

    const toggleStat = (id: string) => {
        const next = new Set(expandedStats);
        if (next.has(id)) next.delete(id); else next.add(id);
        setExpandedStats(next);
    };

    const toggleSubStat = (id: string) => {
        const next = new Set(expandedSubStats);
        if (next.has(id)) next.delete(id); else next.add(id);
        setExpandedSubStats(next);
    };

    // Check if paused this specific month
    const isPaused = goal.monthlyData[selectedMonth]?.isExplicitlyDeleted;

    // Calculate current monthly rate
    const currentMonthlyRate = calculateGoalBucketCost(goal, selectedMonth);
    
    // For simulation baseline
    const targetDateObj = goal.targetDate ? parseISO(`${goal.targetDate}-01`) : addMonths(new Date(), 12);
    const monthsRemainingReal = Math.max(1, differenceInMonths(targetDateObj, parseISO(`${selectedMonth}-01`)));
    const baselineRate = currentMonthlyRate > 0 ? currentMonthlyRate : (remaining / monthsRemainingReal);

    // Simulation Calculations
    const simulatedRate = baselineRate + simulatedExtra;
    const monthsToGoalSimulated = simulatedRate > 0 ? Math.ceil(remaining / simulatedRate) : monthsRemainingReal;
    const projectedDate = addMonths(parseISO(`${selectedMonth}-01`), monthsToGoalSimulated);
    const monthsSaved = Math.max(0, monthsRemainingReal - monthsToGoalSimulated);

    const chartData = [
        { name: 'Saved', value: saved },
        { name: 'Remaining', value: remaining }
    ];
    
    // DATE LABEL LOGIC
    let dateLabel = 'Ej satt';
    
    // 1. Prefer Event Date Range if available
    if (goal.eventStartDate && goal.eventEndDate) {
        const start = parseISO(goal.eventStartDate);
        const end = parseISO(goal.eventEndDate);
        if (isValid(start) && isValid(end)) {
            dateLabel = `${format(start, 'd MMM')} - ${format(end, 'd MMM yyyy', {locale: sv})}`;
        }
    } 
    // 2. Fallback to Target Date
    else if (goal.targetDate) {
        const targetD = parseISO(`${goal.targetDate}-01`);
        if (isValid(targetD)) {
            dateLabel = format(targetD, 'MMMM yyyy', {locale: sv});
        }
    }

    const handlePauseToggle = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const newData = { ...goal.monthlyData };
        const currentData = newData[selectedMonth] || { amount: 0, dailyAmount: 0, activeDays: [] };
        // Toggle explicit deletion
        newData[selectedMonth] = { ...currentData, isExplicitlyDeleted: !isPaused };
        updateBucket({ ...goal, monthlyData: newData });
    };

    const grayscale = isArchived || isPaused ? "grayscale" : "";
    const opacity = isPaused ? "opacity-90" : "";

    return (
        <div className={cn("relative w-full rounded-3xl overflow-hidden shadow-2xl group bg-slate-800 transition-all border border-slate-700/50", grayscale, opacity)}>
            {/* Background Image Container */}
            <div className="absolute inset-0 h-64 z-0">
                <div 
                    className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
                    style={{ 
                        backgroundImage: `url(${goal.backgroundImage || 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?q=80&w=2021&auto=format&fit=crop'})` 
                    }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/80 to-transparent" />
            </div>

            {/* Top Controls */}
            <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start z-20">
                {!isArchived && goal.paymentSource !== 'BALANCE' ? (
                    <button 
                        onClick={handlePauseToggle}
                        className={cn(
                            "flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-md border transition-all text-xs font-bold uppercase tracking-wider shadow-lg",
                            isPaused 
                                ? "bg-amber-500/20 border-amber-500/50 text-amber-300 hover:bg-amber-500/30"
                                : "bg-black/30 border-white/10 text-white/80 hover:bg-black/50 hover:text-white"
                        )}
                    >
                        {isPaused ? (
                            <>
                                <Play className="w-3 h-3 fill-current" /> Pausad
                            </>
                        ) : (
                            <>
                                <Pause className="w-3 h-3 fill-current" /> Pausa Månad
                            </>
                        )}
                    </button>
                ) : <div></div> /* Spacer */}

                <div className="flex gap-2">
                    {!isArchived && (
                        <button 
                            onClick={(e) => { e.stopPropagation(); setIsStatsOpen(true); }}
                            className="bg-black/30 hover:bg-black/50 text-white/80 hover:text-white p-2 rounded-full transition-all backdrop-blur-md border border-white/10 z-50"
                            title="Statistik"
                        >
                            <PieChartIcon className="w-4 h-4" />
                        </button>
                    )}
                    {!isArchived && (
                        <button 
                            onClick={(e) => { e.stopPropagation(); onEdit(goal); }}
                            className="bg-black/30 hover:bg-black/50 text-white/80 hover:text-white p-2 rounded-full transition-all backdrop-blur-md border border-white/10 z-50"
                            title="Inställningar"
                        >
                            <Settings className="w-4 h-4" />
                        </button>
                    )}
                    {!isArchived ? (
                        <button 
                            onClick={(e) => { 
                                e.preventDefault();
                                e.stopPropagation(); 
                                onArchive(goal.id, goal.name); 
                            }}
                            className="bg-black/30 hover:bg-black/50 text-white/80 hover:text-white p-2 rounded-full transition-all backdrop-blur-md border border-white/10 z-50"
                            title="Arkivera / Avsluta sparande"
                        >
                            <Archive className="w-4 h-4" />
                        </button>
                    ) : (
                        <button 
                            onClick={(e) => { 
                                e.preventDefault();
                                e.stopPropagation(); 
                                onDelete(goal.id, goal.name); 
                            }}
                            className="bg-red-500/20 hover:bg-red-500/40 text-red-300 hover:text-white p-2 rounded-full transition-all backdrop-blur-md border border-red-500/10 z-50"
                            title="Ta bort permanent"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>

            {/* Main Content */}
            <div className="relative z-10 p-6 pt-32 flex flex-col h-full justify-end">
                <div className="flex items-end justify-between">
                    <div className="flex-1 min-w-0 pr-4">
                        <div className="flex items-center gap-2 mb-1">
                            <h2 className="text-2xl font-bold leading-none text-white drop-shadow-lg truncate">{goal.name}</h2>
                            {isArchived && <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />}
                        </div>
                        <p className="text-sm text-slate-300 mb-4 font-medium drop-shadow-md flex items-center gap-1">
                            {isArchived ? (
                                <span>Avslutad: {goal.archivedDate}</span>
                            ) : (
                                <>
                                    <span>Datum: {dateLabel}</span>
                                    {!isPaused && simulatedExtra === 0 && goal.paymentSource !== 'BALANCE' && (
                                        <span className="text-slate-500 text-xs bg-black/40 px-1.5 py-0.5 rounded">
                                            {formatMoney(currentMonthlyRate)}/mån
                                        </span>
                                    )}
                                    {goal.paymentSource === 'BALANCE' && (
                                        <span className="text-amber-400 text-xs bg-black/40 px-1.5 py-0.5 rounded flex items-center gap-1">
                                            <PiggyBank size={10} /> Befintligt Saldo
                                        </span>
                                    )}
                                </>
                            )}
                        </p>
                        
                        <div className="space-y-1">
                            <div className="text-xs font-bold uppercase tracking-widest text-purple-300 drop-shadow-md">
                                {isArchived ? "Totalt Sparat" : (goal.paymentSource === 'BALANCE' ? "Tillgängligt Saldo" : "Kvar till drömmen")}
                            </div>
                            <div className="text-4xl font-bold font-mono tracking-tighter text-white drop-shadow-lg">
                                {isArchived || goal.paymentSource === 'BALANCE' ? (
                                    <span>{formatMoney(goal.paymentSource === 'BALANCE' ? goal.targetAmount : saved)}</span>
                                ) : (
                                    <AnimatedNumber value={remaining} />
                                )}
                            </div>
                            {/* NEW: Total Booked Amount Indicator */}
                            {totalBooked > 0 && (
                                <div 
                                    onClick={(e) => { e.stopPropagation(); setIsStatsOpen(true); }}
                                    className="text-xs text-white/80 bg-black/40 inline-flex items-center gap-1 px-2 py-1 rounded-md backdrop-blur-sm mt-1 border border-white/10 cursor-pointer hover:bg-black/60 transition-colors"
                                >
                                    <Receipt size={10} /> Bokfört: <span className="font-mono font-bold text-rose-300">-{formatMoney(totalBooked)}</span> <ChevronRight size={10} />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Donut Chart */}
                    <div className="w-24 h-24 relative shrink-0">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={chartData}
                                    innerRadius={35}
                                    outerRadius={45}
                                    startAngle={90}
                                    endAngle={-270}
                                    dataKey="value"
                                    stroke="none"
                                >
                                    <Cell fill={isArchived ? "#64748b" : (isPaused ? "#fbbf24" : "#a855f7")} /> 
                                    <Cell fill="#ffffff" fillOpacity={0.1} />
                                </Pie>
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex items-center justify-center font-bold text-sm text-white drop-shadow-md">
                            {Math.round(progress)}%
                        </div>
                    </div>
                </div>

                {/* SIMULATOR SECTION */}
                {!isArchived && !isPaused && goal.paymentSource !== 'BALANCE' && (
                    <div className="mt-6 pt-4 border-t border-white/10">
                        <button 
                            onClick={() => setIsSimulating(!isSimulating)}
                            className="flex items-center gap-2 text-xs font-bold text-purple-300 hover:text-purple-200 transition-colors uppercase tracking-wider mb-2"
                        >
                            <Rocket className="w-4 h-4" /> 
                            {isSimulating ? "Dölj Simulator" : "Simulera ökat sparande"}
                        </button>
                        
                        {isSimulating && (
                            <div className="bg-purple-900/30 rounded-xl p-3 border border-purple-500/30 animate-in slide-in-from-top-2">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-xs text-purple-200">Lägg till extra:</span>
                                    <span className="text-sm font-bold text-white font-mono">+{formatMoney(simulatedExtra)}/mån</span>
                                </div>
                                <input 
                                    type="range"
                                    min="0"
                                    max="5000"
                                    step="100"
                                    value={simulatedExtra}
                                    onChange={(e) => setSimulatedExtra(Number(e.target.value))}
                                    className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500 mb-3"
                                />
                                {simulatedExtra > 0 && (
                                    <div className="text-xs text-purple-100 flex items-start gap-2 bg-purple-500/20 p-2 rounded">
                                        <TrendingUp className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
                                        <div>
                                            Ni blir klara <span className="font-bold text-emerald-300">{format(projectedDate, 'MMMM yyyy', {locale: sv})}</span>.
                                            <div className="text-purple-300 mt-0.5">
                                                Det är <span className="font-bold">{monthsSaved} månader</span> tidigare!
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* STATISTICS MODAL */}
            <Modal isOpen={isStatsOpen} onClose={() => setIsStatsOpen(false)} title={`Utgifter: ${goal.name}`}>
                <div className="space-y-4">
                    <div className="flex justify-between items-center bg-slate-800 p-4 rounded-xl border border-slate-700">
                        <span className="text-slate-400 text-sm font-medium uppercase tracking-wider">Totalt Spenderat</span>
                        <span className="text-2xl font-bold text-white font-mono">{formatMoney(totalBooked)}</span>
                    </div>

                    <div className="space-y-2">
                        {statsBreakdown.map(main => {
                            const isExpanded = expandedStats.has(main.id);
                            return (
                                <div key={main.id} className="bg-slate-800/50 rounded-lg border border-slate-700 overflow-hidden">
                                    <div 
                                        onClick={() => toggleStat(main.id)}
                                        className="flex justify-between items-center p-3 cursor-pointer hover:bg-slate-800 transition-colors"
                                    >
                                        <div className="flex items-center gap-2">
                                            {isExpanded ? <ChevronDown size={16} className="text-blue-400" /> : <ChevronRight size={16} className="text-slate-500" />}
                                            <span className="font-medium text-white">{main.name}</span>
                                        </div>
                                        <span className="font-mono text-white text-sm">{formatMoney(main.total)}</span>
                                    </div>
                                    
                                    {isExpanded && (
                                        <div className="bg-slate-900/50 border-t border-slate-700/50 pb-2">
                                            {main.subs.map(sub => {
                                                const subKey = `${main.id}-${sub.id}`;
                                                const isSubExpanded = expandedSubStats.has(subKey);
                                                
                                                return (
                                                    <div key={subKey} className="flex flex-col">
                                                        <div 
                                                            className="flex justify-between items-center px-4 py-2 text-xs cursor-pointer hover:bg-white/5"
                                                            onClick={() => toggleSubStat(subKey)}
                                                        >
                                                            <div className="flex items-center gap-2 pl-4">
                                                                {isSubExpanded ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronRight size={14} className="text-slate-500" />}
                                                                <span className="text-slate-300 font-medium">{sub.name}</span>
                                                            </div>
                                                            <span className="text-slate-300 font-mono">{formatMoney(sub.total)}</span>
                                                        </div>

                                                        {/* Transaction Details */}
                                                        {isSubExpanded && (
                                                            <div className="bg-black/20 pl-12 pr-4 py-2 space-y-1 border-t border-white/5">
                                                                {sub.transactions.length > 0 ? sub.transactions.map(t => (
                                                                    <div key={t.id} className="flex justify-between items-center text-[10px] py-1 border-b border-white/5 last:border-0">
                                                                        <div className="flex flex-col max-w-[70%]">
                                                                            <span className="text-slate-400 truncate">{t.description}</span>
                                                                            <span className="text-slate-600">{t.date}</span>
                                                                        </div>
                                                                        <span className="text-slate-400 font-mono">{formatMoney(t.amount)}</span>
                                                                    </div>
                                                                )) : (
                                                                    <div className="text-[10px] text-slate-600 italic">Inga detaljer</div>
                                                                )}
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
                        {statsBreakdown.length === 0 && (
                            <div className="text-center text-slate-500 py-8 italic">Inga utgifter bokförda än.</div>
                        )}
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export const DreamsView: React.FC = () => {