
import React, { useEffect, useState } from 'react';
import { useApp } from '../store';
import { calculateSavedAmount, formatMoney } from '../utils';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { format, parseISO, isValid } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Archive, CheckCircle } from 'lucide-react';
import { cn } from '../components/components';

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

export const DreamsView: React.FC = () => {
    const { buckets, selectedMonth, archiveBucket } = useApp();
    const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');

    // Filter goals based on buckets
    // A goal is "archived" if it has an archivedDate.
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

                {goalsToShow.map(goal => {
                    // Calculate progress
                    const saved = calculateSavedAmount(goal, selectedMonth);
                    const remaining = Math.max(0, goal.targetAmount - saved);
                    const progress = goal.targetAmount > 0 ? Math.min(100, (saved / goal.targetAmount) * 100) : 0;
                    
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

                    // Visuals for archived state
                    const isArchived = activeTab === 'archived';
                    const grayscale = isArchived ? "grayscale opacity-80" : "";
                    
                    return (
                        <div key={goal.id} className={cn("relative w-full h-64 rounded-3xl overflow-hidden shadow-2xl group bg-slate-800 transition-all", grayscale)}>
                            {/* Background Image */}
                            <div 
                                className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
                                style={{ 
                                    backgroundImage: `url(${goal.backgroundImage || 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?q=80&w=2021&auto=format&fit=crop'})` 
                                }}
                            />
                            
                            {/* Dark Gradient Overlay */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />

                            {/* Archive Button (Only on Active) */}
                            {!isArchived && (
                                <button 
                                    onClick={(e) => { 
                                        e.preventDefault();
                                        e.stopPropagation(); 
                                        handleArchive(goal.id, goal.name); 
                                    }}
                                    className="absolute top-4 right-4 z-50 bg-black/40 hover:bg-black/80 text-white/80 hover:text-white p-3 rounded-full transition-all backdrop-blur-md shadow-lg border border-white/10"
                                    title="Arkivera / Avsluta sparande"
                                >
                                    <Archive className="w-5 h-5" />
                                </button>
                            )}

                            {/* Content */}
                            <div className="absolute inset-0 p-6 flex flex-col justify-end text-white z-10 pointer-events-none">
                                <div className="flex items-end justify-between pointer-events-auto">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h2 className="text-2xl font-bold leading-none shadow-black drop-shadow-lg">{goal.name}</h2>
                                            {isArchived && <CheckCircle className="w-5 h-5 text-emerald-400" />}
                                        </div>
                                        <p className="text-sm text-slate-300 mb-4 font-medium drop-shadow-md">
                                            {isArchived ? `Avslutad: ${goal.archivedDate}` : `Mål: ${dateLabel}`}
                                        </p>
                                        
                                        <div className="space-y-1">
                                            <div className="text-xs font-bold uppercase tracking-widest text-purple-300">
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
                                                    <Cell fill={isArchived ? "#64748b" : "#a855f7"} /> {/* Color for saved */}
                                                    <Cell fill="#ffffff" fillOpacity={0.2} /> {/* White/Transparent for remaining */}
                                                </Pie>
                                            </PieChart>
                                        </ResponsiveContainer>
                                        {/* Centered Percentage */}
                                        <div className="absolute inset-0 flex items-center justify-center font-bold text-sm shadow-black drop-shadow-md">
                                            {Math.round(progress)}%
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
