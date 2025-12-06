
import React, { useEffect, useState, useMemo } from 'react';
import { useApp } from '../store';
import { calculateSavedAmount, calculateGoalBucketCost, formatMoney } from '../utils';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { format, parseISO, isValid, addMonths, differenceInMonths } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Archive, CheckCircle, Pause, Play, Rocket, TrendingUp, Calendar } from 'lucide-react';
import { cn, Button } from '../components/components';
import { Bucket } from '../types';

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
    onArchive: (id: string, name: string) => void;
}

// Sub-component for individual dream card to handle simulation/pause state
const DreamCard: React.FC<DreamCardProps> = ({ goal, isArchived, selectedMonth, onArchive }) => {
    const { updateBucket } = useApp();
    const [isSimulating, setIsSimulating] = useState(false);
    const [simulatedExtra, setSimulatedExtra] = useState(0);

    // Calculate core metrics
    const saved = calculateSavedAmount(goal, selectedMonth);
    const remaining = Math.max(0, goal.targetAmount - saved);
    const progress = goal.targetAmount > 0 ? Math.min(100, (saved / goal.targetAmount) * 100) : 0;
    
    // Check if paused this specific month
    const isPaused = goal.monthlyData[selectedMonth]?.isExplicitlyDeleted;

    // Calculate current monthly rate
    // If paused, the calculator returns 0. For simulation base, we might want the "unpaused" rate.
    // We get the cost as it is configured now.
    const currentMonthlyRate = calculateGoalBucketCost(goal, selectedMonth);
    
    // For simulation baseline: If rate is 0 (because paused or finished), assume a theoretical rate based on remaining months
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
    
    let dateLabel = 'Ej satt';
    if (goal.targetDate) {
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
                {!isArchived && (
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
                )}

                {!isArchived && (
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
                )}
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
                                    <span>Mål: {dateLabel}</span>
                                    {!isPaused && simulatedExtra === 0 && (
                                        <span className="text-slate-500 text-xs bg-black/40 px-1.5 py-0.5 rounded">
                                            {formatMoney(currentMonthlyRate)}/mån
                                        </span>
                                    )}
                                </>
                            )}
                        </p>
                        
                        <div className="space-y-1">
                            <div className="text-xs font-bold uppercase tracking-widest text-purple-300 drop-shadow-md">
                                {isArchived ? "Totalt Sparat" : "Kvar till drömmen"}
                            </div>
                            <div className="text-4xl font-bold font-mono tracking-tighter text-white drop-shadow-lg">
                                {isArchived ? (
                                    <span>{formatMoney(saved)}</span>
                                ) : (
                                    <AnimatedNumber value={remaining} />
                                )}
                            </div>
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
                {!isArchived && !isPaused && (
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
        </div>
    );
};

export const DreamsView: React.FC = () => {
    const { buckets, selectedMonth, archiveBucket } = useApp();
    const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');

    const allGoals = buckets.filter(b => b.type === 'GOAL');
    const activeGoals = allGoals.filter(b => !b.archivedDate);
    const archivedGoals = allGoals.filter(b => !!b.archivedDate);

    const goalsToShow = activeTab === 'active' ? activeGoals : archivedGoals;

    const handleArchive = (id: string, name: string) => {
        if (confirm(`Vill du arkivera "${name}"? Detta avslutar sparandet från och med denna månad, men sparar historiken.`)) {
            archiveBucket(id, selectedMonth);
        }
    };

    return (
        <div className="space-y-6 pb-24 animate-in slide-in-from-right duration-300">
            <header>
                <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">Drömmar & Mål</h1>
                <p className="text-slate-400">Följ era sparmål mot verklighet</p>
            </header>

            {/* TABS */}
            <div className="flex p-1 bg-slate-800 rounded-xl">
                <button 
                    onClick={() => setActiveTab('active')}
                    className={cn(
                        "flex-1 py-2 text-sm font-medium rounded-lg transition-all",
                        activeTab === 'active' ? "bg-purple-600 text-white shadow-lg" : "text-slate-400 hover:text-white"
                    )}
                >
                    Aktiva ({activeGoals.length})
                </button>
                <button 
                    onClick={() => setActiveTab('archived')}
                    className={cn(
                        "flex-1 py-2 text-sm font-medium rounded-lg transition-all",
                        activeTab === 'archived' ? "bg-slate-600 text-white shadow-lg" : "text-slate-400 hover:text-white"
                    )}
                >
                    Arkiv ({archivedGoals.length})
                </button>
            </div>

            <div className="grid gap-6">
                {goalsToShow.length === 0 && (
                    <div className="text-center py-10 opacity-50">
                        {activeTab === 'active' ? (
                            <>
                                <p>Inga aktiva drömmar.</p>
                                <p className="text-sm">Gå till Budget och lägg till en "Dröm & Målsparande" post.</p>
                            </>
                        ) : (
                            <p>Inga arkiverade drömmar än.</p>
                        )}
                    </div>
                )}

                {goalsToShow.map(goal => (
                    <DreamCard 
                        key={goal.id} 
                        goal={goal} 
                        isArchived={activeTab === 'archived'} 
                        selectedMonth={selectedMonth} 
                        onArchive={handleArchive} 
                    />
                ))}
            </div>
        </div>
    );
};
