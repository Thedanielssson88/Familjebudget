
import React, { useEffect, useState } from 'react';
import { useApp } from '../store';
import { calculateSavedAmount, formatMoney } from '../utils';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { format, parseISO, differenceInDays, isValid } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Plus } from 'lucide-react';

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
    const { buckets, selectedMonth } = useApp();
    const goals = buckets.filter(b => b.type === 'GOAL');

    return (
        <div className="space-y-6 pb-24 animate-in slide-in-from-right duration-300">
            <header>
                <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">Drömmar & Mål</h1>
                <p className="text-slate-400">Följ era sparmål mot verklighet</p>
            </header>

            <div className="grid gap-6">
                {goals.length === 0 && (
                    <div className="text-center py-10 opacity-50">
                        <p>Inga drömmar tillagda ännu.</p>
                        <p className="text-sm">Gå till Budget och lägg till en "Dröm & Målsparande" post.</p>
                    </div>
                )}

                {goals.map(goal => {
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
                    
                    return (
                        <div key={goal.id} className="relative w-full h-64 rounded-3xl overflow-hidden shadow-2xl group bg-slate-800">
                            {/* Background Image */}
                            <div 
                                className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
                                style={{ 
                                    backgroundImage: `url(${goal.backgroundImage || 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?q=80&w=2021&auto=format&fit=crop'})` 
                                }}
                            />
                            
                            {/* Dark Gradient Overlay */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />

                            {/* Content */}
                            <div className="absolute inset-0 p-6 flex flex-col justify-end text-white">
                                <div className="flex items-end justify-between">
                                    <div className="flex-1">
                                        <h2 className="text-2xl font-bold mb-1 leading-none shadow-black drop-shadow-lg">{goal.name}</h2>
                                        <p className="text-sm text-slate-300 mb-4 font-medium drop-shadow-md">
                                            Mål: {dateLabel}
                                        </p>
                                        
                                        <div className="space-y-1">
                                            <div className="text-xs font-bold uppercase tracking-widest text-purple-300">Kvar till drömmen</div>
                                            <div className="text-4xl font-bold font-mono tracking-tighter text-white drop-shadow-lg">
                                                <AnimatedNumber value={remaining} />
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
                                                    <Cell fill="#a855f7" /> {/* Purple for saved */}
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