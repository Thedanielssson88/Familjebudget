import React from 'react';
import { useApp } from '../store';
import { calculateGoalBucketCost, calculateFixedBucketCost, calculateDailyBucketCost, formatMoney } from '../utils';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis } from 'recharts';
import { format, addMonths } from 'date-fns';
import { sv } from 'date-fns/locale';

export const StatsView: React.FC = () => {
  const { buckets, selectedMonth, accounts, settings } = useApp();

  // 1. Prepare Data for Pie Chart (Expenses by Account)
  const pieData = accounts.map(acc => {
    const accBuckets = buckets.filter(b => b.accountId === acc.id);
    const value = accBuckets.reduce((sum, b) => {
        let cost = 0;
        if (b.type === 'FIXED') cost = calculateFixedBucketCost(b, selectedMonth);
        else if (b.type === 'DAILY') cost = calculateDailyBucketCost(b, selectedMonth, settings.payday);
        else if (b.type === 'GOAL') cost = calculateGoalBucketCost(b, selectedMonth);
        return sum + cost;
    }, 0);
    return { name: acc.name, value };
  }).filter(d => d.value > 0);

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  // 2. Future Projection (Next 6 months of savings goals)
  const savingsGoals = buckets.filter(b => b.type === 'GOAL');
  const projectionData = Array.from({ length: 6 }).map((_, i) => {
    const month = format(addMonths(new Date(selectedMonth), i), 'yyyy-MM');
    const totalSavingLoad = savingsGoals.reduce((sum, b) => sum + calculateGoalBucketCost(b, month), 0);
    return {
        month: format(addMonths(new Date(selectedMonth), i), 'MMM', { locale: sv }),
        belopp: Math.round(totalSavingLoad)
    };
  });

  return (
    <div className="space-y-8 pb-24 animate-in slide-in-from-right duration-300">
      <header>
        <h1 className="text-3xl font-bold text-white">Ekonomisk Översikt</h1>
        <p className="text-slate-400">Var tar pengarna vägen?</p>
      </header>

      {/* PIE CHART */}
      <div className="bg-surface border border-slate-700 p-4 rounded-2xl h-80">
        <h3 className="text-sm font-bold text-slate-300 mb-4 uppercase tracking-wider">Utgifter per Konto ({format(new Date(selectedMonth), 'MMM', {locale: sv})})</h3>
        {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                    <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                    >
                        {pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                    </Pie>
                    <Tooltip 
                        contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                        itemStyle={{ color: '#fff' }}
                        formatter={(value: number) => formatMoney(value)}
                    />
                </PieChart>
            </ResponsiveContainer>
        ) : (
            <div className="flex items-center justify-center h-full text-slate-500 text-sm">Inga utgifter registrerade denna månad.</div>
        )}
        <div className="flex flex-wrap justify-center gap-3 mt-[-20px]">
            {pieData.map((d, i) => (
                <div key={i} className="flex items-center gap-1 text-xs text-slate-400">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }}></div>
                    {d.name}
                </div>
            ))}
        </div>
      </div>

      {/* BAR CHART: Future Savings Load */}
      {savingsGoals.length > 0 && (
          <div className="bg-surface border border-slate-700 p-4 rounded-2xl h-80">
            <h3 className="text-sm font-bold text-slate-300 mb-4 uppercase tracking-wider">Kommande Sparbelastning</h3>
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={projectionData}>
                    <XAxis dataKey="month" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => `${val/1000}k`} />
                    <Tooltip 
                        cursor={{fill: '#334155', opacity: 0.2}}
                        contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                        itemStyle={{ color: '#fff' }}
                        formatter={(value: number) => formatMoney(value)}
                    />
                    <Bar dataKey="belopp" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
            </ResponsiveContainer>
            <p className="text-xs text-slate-500 mt-2 text-center">Visar hur mycket som måste sparas till era mål de kommande månaderna.</p>
          </div>
      )}
    </div>
  );
};