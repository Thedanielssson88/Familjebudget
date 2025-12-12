
import React, { useEffect, useState, useMemo } from 'react';
import { useApp } from '../store';
import { calculateSavedAmount, calculateGoalBucketCost, formatMoney, generateId, calculateReimbursementMap, getEffectiveAmount } from '../utils';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { format, parseISO, isValid, addMonths, differenceInMonths } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Archive, CheckCircle, Pause, Play, Rocket, TrendingUp, Calendar, Trash2, Settings, Save, Search, Receipt, CheckSquare, Square, X, Unlink, Wallet, PiggyBank, PieChart as PieChartIcon, ChevronDown, ChevronRight, Plus, Target, Image as ImageIcon, Link } from 'lucide-react';
import { cn, Button, Modal, Input } from '../components/components';
import { Bucket, Transaction } from '../types';

const DREAM_IMAGES = [
  "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=2073&auto=format&fit=crop", // Beach
  "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?q=80&w=2021&auto=format&fit=crop", // Travel
  "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?q=80&w=2070&auto=format&fit=crop", // Car
  "https://images.unsplash.com/photo-1560518883-ce09059eeffa?q=80&w=1973&auto=format&fit=crop", // House
  "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?q=80&w=2070&auto=format&fit=crop", // Sofa/Home
  "https://images.unsplash.com/photo-1523275335684-37898b6baf30?q=80&w=1999&auto=format&fit=crop", // Watch/Luxury
  "https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=2070&auto=format&fit=crop", // Tech
];

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
    
    const reimbursementMap = useMemo(() => calculateReimbursementMap(transactions), [transactions]);

    // Calculate total Booked Spend (Transactions linked to this goal)
    const totalBooked = useMemo(() => {
        return transactions
            .filter(t => t.bucketId === goal.id && (t.type === 'EXPENSE' || t.amount < 0))
            .reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);
    }, [transactions, goal.id, reimbursementMap]);

    // Calculate Stats Breakdown
    const statsBreakdown = useMemo(() => {
        const relevantTxs = transactions.filter(t => t.bucketId === goal.id && (t.type === 'EXPENSE' || t.amount < 0));
        
        const mains = mainCategories.map(main => {
            const mainTxs = relevantTxs.filter(t => t.categoryMainId === main.id);
            if (mainTxs.length === 0) return null;
            
            const mainTotal = mainTxs.reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);
            
            const subs = subCategories
                .filter(s => s.mainCategoryId === main.id)
                .map(sub => {
                    const subTxs = mainTxs.filter(t => t.categorySubId === sub.id);
                    if (subTxs.length === 0) return null;
                    const subTotal = subTxs.reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);
                    return { ...sub, total: subTotal, transactions: subTxs };
                })
                .filter((s): s is NonNullable<typeof s> => !!s)
                .sort((a, b) => b.total - a.total);

            // Unassigned
            const unassignedTxs = mainTxs.filter(t => !t.categorySubId);
            if (unassignedTxs.length > 0) {
                const unTotal = unassignedTxs.reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);
                subs.push({ id: 'orphan', mainCategoryId: main.id, name: 'Övrigt', total: unTotal, description: '', budgetGroupId: '', transactions: unassignedTxs });
            }

            return { ...main, total: mainTotal, subs };
        }).filter((m): m is NonNullable<typeof m> => !!m).sort((a, b) => b.total - a.total);

        // Also handle completely uncategorized (no main cat)
        const uncategorizedTxs = relevantTxs.filter(t => !t.categoryMainId);
        if (uncategorizedTxs.length > 0) {
            const total = uncategorizedTxs.reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);
            mains.push({ 
                id: 'uncat', 
                name: 'Okategoriserat', 
                description: '', 
                total, 
                subs: [{ id: 'uncat-sub', mainCategoryId: 'uncat', name: 'Övrigt', total, description: '', budgetGroupId: '', transactions: uncategorizedTxs }] 
            });
        }

        return mains;
    }, [transactions, goal.id, mainCategories, subCategories, reimbursementMap]);

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
            <div className="absolute inset-0 h-full z-0">
                <div 
                    className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
                    style={{ 
                        backgroundImage: `url(${goal.backgroundImage || 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?q=80&w=2021&auto=format&fit=crop'})` 
                    }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/60 to-transparent" />
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
                                <Pause className="w-3 h-3 fill-current" /> Pausa
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

            {/* Main Content - Compact */}
            <div className="relative z-10 p-5 pt-16 flex flex-col h-full justify-end">
                <div className="flex items-end justify-between">
                    <div className="flex-1 min-w-0 pr-4">
                        <div className="flex items-center gap-2 mb-0.5">
                            <h2 className="text-xl font-bold leading-none text-white drop-shadow-lg truncate">{goal.name}</h2>
                            {isArchived && <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />}
                        </div>
                        <p className="text-sm text-slate-300 mb-2 font-medium drop-shadow-md flex items-center gap-1">
                            {isArchived ? (
                                <span>Avslutad: {goal.archivedDate}</span>
                            ) : (
                                <>
                                    <span>{dateLabel}</span>
                                    {!isPaused && simulatedExtra === 0 && goal.paymentSource !== 'BALANCE' && (
                                        <span className="text-slate-400 text-xs px-1 py-0.5">
                                            • {formatMoney(currentMonthlyRate)}/mån
                                        </span>
                                    )}
                                    {goal.paymentSource === 'BALANCE' && (
                                        <span className="text-amber-400 text-xs bg-black/40 px-1.5 py-0.5 rounded flex items-center gap-1">
                                            <PiggyBank size={10} /> Saldo
                                        </span>
                                    )}
                                </>
                            )}
                        </p>
                        
                        <div className="space-y-0.5">
                            <div className="text-[10px] font-bold uppercase tracking-widest text-purple-300 drop-shadow-md">
                                {isArchived ? "Totalt Sparat" : (goal.paymentSource === 'BALANCE' ? "Tillgängligt Saldo" : "Kvar till drömmen")}
                            </div>
                            <div className="text-3xl font-bold font-mono tracking-tighter text-white drop-shadow-lg">
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
                    <div className="w-20 h-20 relative shrink-0">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={chartData}
                                    innerRadius={30}
                                    outerRadius={40}
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
                    <div className="mt-4 pt-3 border-t border-white/10">
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
    const { buckets, updateBucket, deleteBucket, archiveBucket, selectedMonth, addBucket, accounts, transactions, updateTransaction } = useApp();
    const [showArchived, setShowArchived] = useState(false);
    
    // Edit/Create Modal State
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingGoal, setEditingGoal] = useState<Bucket | null>(null);

    // Manual Linker State (Inside Edit Modal)
    const [candidateTxs, setCandidateTxs] = useState<Transaction[]>([]);
    const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<string>>(new Set());
    const [hasScanned, setHasScanned] = useState(false);

    const goals = useMemo(() => {
        return buckets
            .filter(b => b.type === 'GOAL')
            .filter(b => showArchived ? !!b.archivedDate : !b.archivedDate)
            .sort((a, b) => (a.targetDate || '') > (b.targetDate || '') ? 1 : -1);
    }, [buckets, showArchived]);

    const handleArchive = (id: string, name: string) => {
        if (confirm(`Är du säker på att du vill arkivera "${name}"? Det avslutar sparandet men sparar historiken.`)) {
            archiveBucket(id, selectedMonth);
        }
    };

    const handleDelete = (id: string, name: string) => {
        if (confirm(`VARNING: Detta tar bort "${name}" permanent. Vill du fortsätta?`)) {
            deleteBucket(id, selectedMonth, 'ALL');
        }
    };

    const openEditModal = (goal?: Bucket) => {
        // Reset Linker State
        setCandidateTxs([]);
        setSelectedCandidateIds(new Set());
        setHasScanned(false);

        if (goal) {
            setEditingGoal(goal);
        } else {
            // New Goal
            setEditingGoal({
                id: generateId(),
                accountId: accounts[0]?.id || '',
                name: '',
                type: 'GOAL',
                isSavings: true,
                paymentSource: 'INCOME',
                monthlyData: {},
                targetAmount: 0,
                targetDate: format(addMonths(new Date(), 12), 'yyyy-MM'),
                startSavingDate: selectedMonth,
                backgroundImage: DREAM_IMAGES[0]
            });
        }
        setIsEditModalOpen(true);
    };

    const handleSaveGoal = async () => {
        if (!editingGoal) return;
        
        if (buckets.find(b => b.id === editingGoal.id)) {
            await updateBucket(editingGoal);
        } else {
            await addBucket(editingGoal);
        }
        setIsEditModalOpen(false);
    };

    // --- MANUAL LINKER LOGIC ---
    const handleScanForTransactions = () => {
        if (!editingGoal?.eventStartDate || !editingGoal.eventEndDate || !editingGoal.id) return;
        
        const start = editingGoal.eventStartDate;
        const end = editingGoal.eventEndDate;

        // Find Expenses within range that are either unlinked OR linked to this specific goal
        const candidates = transactions.filter(t => {
            const inRange = t.date >= start && t.date <= end;
            // Logic: Expense usually means negative amount. 
            // Also strictly exclude transfers/incomes if typed.
            const isExpense = t.amount < 0 && t.type !== 'INCOME' && t.type !== 'TRANSFER'; 
            
            const linkedToThis = t.bucketId === editingGoal.id;
            const notLinked = !t.bucketId;

            // Note: The prompt says "show transactions from all accounts", not just the one linked to the goal.
            return inRange && isExpense && (linkedToThis || notLinked);
        }).sort((a,b) => b.date.localeCompare(a.date));

        setCandidateTxs(candidates);
        setHasScanned(true);
        
        // Pre-select those that are already linked
        const preSelected = new Set(candidates.filter(t => t.bucketId === editingGoal.id).map(t => t.id));
        setSelectedCandidateIds(preSelected);
    };

    const toggleCandidateSelection = (id: string) => {
        const next = new Set(selectedCandidateIds);
        if (next.has(id)) next.delete(id); else next.add(id);
        setSelectedCandidateIds(next);
    };

    const handleSaveLinkedTransactions = async () => {
        if (!editingGoal) return;
        
        const updates = candidateTxs.map(tx => {
            const isSelected = selectedCandidateIds.has(tx.id);
            const isCurrentlyLinked = tx.bucketId === editingGoal.id;

            if (isSelected && !isCurrentlyLinked) {
                // Link it
                return updateTransaction({
                    ...tx,
                    bucketId: editingGoal.id,
                    type: 'EXPENSE' // Ensure it is treated as expense
                });
            } else if (!isSelected && isCurrentlyLinked) {
                // Unlink it
                return updateTransaction({
                    ...tx,
                    bucketId: undefined
                });
            }
            return Promise.resolve();
        });
        
        await Promise.all(updates);
        
        // Refresh scan to show updated state (visual feedback)
        handleScanForTransactions();
        alert(`Uppdaterade kopplingar för drömmen.`);
    };

    return (
        <div className="space-y-6 pb-24 animate-in slide-in-from-right duration-300">
            <header className="flex justify-between items-start">
                <div>
                    <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">Drömmar & Mål</h1>
                    <p className="text-slate-400">Visualisera och nå dina sparmål.</p>
                </div>
                <div className="flex bg-slate-800 p-1 rounded-lg">
                    <button 
                        onClick={() => setShowArchived(false)} 
                        className={cn("px-3 py-1.5 text-xs font-bold rounded transition-all", !showArchived ? "bg-purple-600 text-white" : "text-slate-400 hover:text-white")}
                    >
                        Aktiva
                    </button>
                    <button 
                        onClick={() => setShowArchived(true)} 
                        className={cn("px-3 py-1.5 text-xs font-bold rounded transition-all", showArchived ? "bg-slate-600 text-white" : "text-slate-400 hover:text-white")}
                    >
                        Arkiverade
                    </button>
                </div>
            </header>

            <div className="space-y-6">
                {goals.map(goal => (
                    <DreamCard 
                        key={goal.id} 
                        goal={goal} 
                        isArchived={!!goal.archivedDate}
                        selectedMonth={selectedMonth}
                        transactions={transactions}
                        onArchive={handleArchive}
                        onDelete={handleDelete}
                        onEdit={openEditModal}
                    />
                ))}
                
                {goals.length === 0 && (
                    <div className="text-center py-10 text-slate-500 italic">
                        {showArchived ? "Inga arkiverade drömmar än." : "Inga aktiva drömmar. Dags att skapa en?"}
                    </div>
                )}

                {!showArchived && (
                    <Button 
                        variant="secondary" 
                        className="w-full border-dashed border-slate-700 py-6 text-slate-400 hover:text-white hover:border-purple-500/50 group"
                        onClick={() => openEditModal()}
                    >
                        <div className="flex flex-col items-center gap-2">
                            <div className="p-3 bg-slate-800 rounded-full group-hover:bg-purple-600 group-hover:text-white transition-colors">
                                <Plus className="w-6 h-6" />
                            </div>
                            <span className="font-bold">Lägg till ny dröm</span>
                        </div>
                    </Button>
                )}
            </div>

            {/* EDIT MODAL */}
            <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title={editingGoal?.name ? `Redigera ${editingGoal.name}` : "Ny Dröm"}>
                {editingGoal && (
                    <div className="space-y-4">
                        <Input label="Namn på målet" value={editingGoal.name} onChange={e => setEditingGoal({...editingGoal, name: e.target.value})} autoFocus />
                        
                        <div>
                            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider block mb-1">Kopplat Konto</label>
                            <select 
                                value={editingGoal.accountId}
                                onChange={(e) => setEditingGoal({...editingGoal, accountId: e.target.value})}
                                className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            >
                                {accounts.map(acc => (
                                    <option key={acc.id} value={acc.id}>
                                        {acc.icon} {acc.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <Input label="Målbelopp" type="number" value={editingGoal.targetAmount} onChange={e => setEditingGoal({...editingGoal, targetAmount: Number(e.target.value)})} />
                        
                        <div className="grid grid-cols-2 gap-4">
                            <Input label="Startdatum" type="month" value={editingGoal.startSavingDate} onChange={e => setEditingGoal({...editingGoal, startSavingDate: e.target.value})} />
                            <Input label="Slutdatum (Mål)" type="month" value={editingGoal.targetDate} onChange={e => setEditingGoal({...editingGoal, targetDate: e.target.value})} />
                        </div>

                        {/* Event Dates (With Manual Linker) */}
                        <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/50 space-y-3">
                            <div className="flex items-center gap-2 text-purple-300">
                                <Calendar size={16} />
                                <span className="text-xs font-bold uppercase">Resa / Event (Datum)</span>
                            </div>
                            <p className="text-[10px] text-slate-400">
                                Ange exakta datum för att automatiskt koppla korttransaktioner under resan (vid import), eller sök upp befintliga transaktioner manuellt.
                            </p>
                            <div className="grid grid-cols-2 gap-4">
                                <Input label="Start (Dag)" type="date" value={editingGoal.eventStartDate || ''} onChange={e => setEditingGoal({...editingGoal, eventStartDate: e.target.value})} />
                                <Input label="Slut (Dag)" type="date" value={editingGoal.eventEndDate || ''} onChange={e => setEditingGoal({...editingGoal, eventEndDate: e.target.value})} />
                            </div>
                            
                            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    checked={!!editingGoal.autoTagEvent} 
                                    onChange={(e) => setEditingGoal({...editingGoal, autoTagEvent: e.target.checked})}
                                    className="rounded border-slate-600 bg-slate-900 text-purple-500 focus:ring-purple-500"
                                />
                                Auto-koppla vid import
                            </label>

                            {/* MANUAL LINKER SECTION */}
                            <div className="pt-2 border-t border-slate-700/50">
                                <Button 
                                    variant="secondary" 
                                    onClick={handleScanForTransactions}
                                    disabled={!editingGoal.eventStartDate || !editingGoal.eventEndDate}
                                    className="w-full text-xs h-auto py-2"
                                >
                                    <Search size={12} className="mr-2"/> Hitta utgifter i intervallet
                                </Button>

                                {hasScanned && (
                                    <div className="mt-3 bg-slate-900 rounded-lg border border-slate-700 overflow-hidden animate-in slide-in-from-top-2">
                                        {candidateTxs.length === 0 ? (
                                            <div className="p-3 text-center text-xs text-slate-500">Inga utgifter hittades inom intervallet.</div>
                                        ) : (
                                            <>
                                                <div className="p-2 bg-slate-800 border-b border-slate-700 flex justify-between items-center">
                                                    <span className="text-[10px] font-bold uppercase text-slate-400">Hittade ({candidateTxs.length})</span>
                                                    <button 
                                                        onClick={() => {
                                                            if (selectedCandidateIds.size === candidateTxs.length) setSelectedCandidateIds(new Set());
                                                            else setSelectedCandidateIds(new Set(candidateTxs.map(t => t.id)));
                                                        }}
                                                        className="text-[10px] text-purple-300 hover:text-purple-200"
                                                    >
                                                        {selectedCandidateIds.size === candidateTxs.length ? "Avmarkera alla" : "Välj alla"}
                                                    </button>
                                                </div>
                                                <div className="max-h-40 overflow-y-auto no-scrollbar p-1 space-y-1">
                                                    {candidateTxs.map(tx => {
                                                        const account = accounts.find(a => a.id === tx.accountId);
                                                        return (
                                                        <div 
                                                            key={tx.id} 
                                                            onClick={() => toggleCandidateSelection(tx.id)}
                                                            className={cn(
                                                                "flex items-center gap-2 p-2 rounded cursor-pointer transition-colors border",
                                                                selectedCandidateIds.has(tx.id) ? "bg-purple-900/30 border-purple-500/50" : "bg-transparent border-transparent hover:bg-white/5"
                                                            )}
                                                        >
                                                            <div className={cn("w-3 h-3 rounded-sm border flex items-center justify-center", selectedCandidateIds.has(tx.id) ? "bg-purple-500 border-purple-500" : "border-slate-600")}>
                                                                {selectedCandidateIds.has(tx.id) && <CheckCircle size={8} className="text-white"/>}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="text-xs text-white truncate">{tx.description}</div>
                                                                <div className="text-[10px] text-slate-500 flex items-center gap-1">
                                                                    <span>{tx.date}</span>
                                                                    <span className="text-slate-600">•</span>
                                                                    <span>{account?.icon} {account?.name}</span>
                                                                </div>
                                                            </div>
                                                            <div className="text-xs font-mono text-slate-300">{formatMoney(tx.amount)}</div>
                                                        </div>
                                                    )})}
                                                </div>
                                                <div className="p-2 border-t border-slate-700">
                                                    <Button 
                                                        onClick={handleSaveLinkedTransactions}
                                                        className="w-full text-xs h-8 bg-purple-600 hover:bg-purple-500"
                                                    >
                                                        <Save size={12} className="mr-2"/> Spara kopplingar ({selectedCandidateIds.size})
                                                    </Button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Payment Source */}
                        <div className="space-y-3 pt-2">
                            <div className="text-xs font-medium text-slate-400 uppercase">Finansiering</div>
                            <div className="flex flex-col gap-2">
                                <button 
                                onClick={() => setEditingGoal({...editingGoal, paymentSource: 'INCOME'})}
                                className={cn("p-3 rounded-xl border text-left flex items-center gap-3", (!editingGoal.paymentSource || editingGoal.paymentSource === 'INCOME') ? "bg-purple-500/20 border-purple-500 text-white" : "border-slate-700 text-slate-400")}
                                >
                                    <Wallet className="w-5 h-5" />
                                    <div>
                                        <div className="font-bold text-sm">Från Månadslön (Budget)</div>
                                        <div className="text-[10px] opacity-70">Skapar ett månadssparande som minskar fickpengar</div>
                                    </div>
                                </button>
                                <button 
                                onClick={() => setEditingGoal({...editingGoal, paymentSource: 'BALANCE'})}
                                className={cn("p-3 rounded-xl border text-left flex items-center gap-3", editingGoal.paymentSource === 'BALANCE' ? "bg-amber-500/20 border-amber-500 text-white" : "border-slate-700 text-slate-400")}
                                >
                                    <PiggyBank className="w-5 h-5" />
                                    <div>
                                        <div className="font-bold text-sm">Från Kontosaldo / Sparade Medel</div>
                                        <div className="text-[10px] opacity-70">Påverkar ej månadens utrymme. Enbart för uppföljning av spenderande.</div>
                                    </div>
                                </button>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Välj Bild</label>
                            <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                                {DREAM_IMAGES.map((img, i) => (
                                    <button 
                                    key={i}
                                    onClick={() => setEditingGoal({...editingGoal, backgroundImage: img})}
                                    className={cn("w-16 h-16 shrink-0 rounded-lg overflow-hidden border-2 transition-all", editingGoal.backgroundImage === img ? "border-purple-500 scale-105" : "border-transparent opacity-60 hover:opacity-100")}
                                    >
                                        <img src={img} className="w-full h-full object-cover" alt="theme" />
                                    </button>
                                ))}
                            </div>
                        </div>

                        <Button onClick={handleSaveGoal} disabled={!editingGoal.name} className="w-full bg-purple-600 hover:bg-purple-500">Spara Dröm</Button>
                    </div>
                )}
            </Modal>
        </div>
    );
};
