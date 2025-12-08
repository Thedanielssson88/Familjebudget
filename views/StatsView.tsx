import React, { useMemo, useState } from 'react';
import { useApp } from '../store';
import { formatMoney, getEffectiveBudgetGroupData } from '../utils';
import { 
    PieChart, Pie, Cell, Tooltip, ResponsiveContainer, 
    ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Area
} from 'recharts';
import { ChevronRight, ChevronDown, Edit2, Check, AlertTriangle, TrendingUp, TrendingDown, Calendar, BarChart3, PieChart as PieIcon, Filter } from 'lucide-react';
import { BudgetProgressBar } from '../components/BudgetProgressBar';
import { cn, Button } from '../components/components';
import { BudgetGroup } from '../types';
import { format, subMonths, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';

// --- SUB-COMPONENT: MONTHLY SNAPSHOT (Existing View) ---
const MonthlySnapshot = ({ selectedMonth }: { selectedMonth: string }) => {
    const { budgetGroups, subCategories, transactions, updateBudgetGroup } = useApp();
    
    const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
    const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
    const [tempLimit, setTempLimit] = useState<string>('');

    // Logic from original StatsView to calculate monthly stats
    const data = useMemo(() => {
        const txForMonth = transactions.filter(t => t.date.startsWith(selectedMonth));
        
        // Only count EXPENSES (Consumption)
        const expenseTx = txForMonth.filter(t => t.type === 'EXPENSE' || (!t.type && t.amount < 0)); 

        const catchAllGroup = budgetGroups.find(g => g.isCatchAll);

        const groupStats = budgetGroups.map(group => {
            const assignedSubs = subCategories.filter(s => s.budgetGroupId === group.id);
            const assignedSubIds = new Set(assignedSubs.map(s => s.id));
            
            const groupTxs = expenseTx.filter(t => {
                if (t.categorySubId && assignedSubIds.has(t.categorySubId)) return true;
                if (group.isCatchAll && (!t.categorySubId || !subCategories.find(s => s.id === t.categorySubId)?.budgetGroupId)) return true;
                return false;
            });
            
            const spent = groupTxs.reduce((sum, t) => sum + Math.abs(t.amount), 0);
            
            // Breakdown
            const breakdown = assignedSubs.map(sub => {
                const subSpent = groupTxs
                    .filter(t => t.categorySubId === sub.id)
                    .reduce((sum, t) => sum + Math.abs(t.amount), 0);
                return { ...sub, spent: subSpent };
            }).sort((a,b) => b.spent - a.spent);

            const totalSubSpent = breakdown.reduce((sum, s) => sum + s.spent, 0);
            const unclassifiedSpent = spent - totalSubSpent;

            const { data } = getEffectiveBudgetGroupData(group, selectedMonth);
            const limit = data ? data.limit : 0;

            return {
                ...group,
                spent,
                limit,
                remaining: limit - spent,
                breakdown,
                unclassifiedSpent
            };
        }).sort((a, b) => {
            if (a.isCatchAll) return 1;
            if (b.isCatchAll) return -1;
            return b.spent - a.spent;
        });

        const totalLimit = groupStats.reduce((sum, g) => sum + g.limit, 0);
        const totalSpent = groupStats.reduce((sum, g) => sum + g.spent, 0);
        const totalRemaining = totalLimit - totalSpent;

        return { groupStats, totalLimit, totalSpent, totalRemaining };
    }, [budgetGroups, subCategories, transactions, selectedMonth]);

    const handleStartEdit = (group: BudgetGroup) => {
        setEditingGroupId(group.id);
        const { data } = getEffectiveBudgetGroupData(group, selectedMonth);
        setTempLimit((data ? data.limit : 0).toString());
    };
  
    const handleSaveLimit = async (group: BudgetGroup) => {
        const amount = parseInt(tempLimit) || 0;
        const updatedGroup: BudgetGroup = {
            ...group,
            monthlyData: {
                ...group.monthlyData,
                [selectedMonth]: { limit: amount, isExplicitlyDeleted: false }
            }
        };
        await updateBudgetGroup(updatedGroup);
        setEditingGroupId(null);
    };

    const pieData = data.groupStats.filter(g => g.spent > 0).map(g => ({ name: g.name, value: g.spent }));
    const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6', '#f43f5e', '#8b5cf6'];

    return (
        <div className="space-y-6 animate-in fade-in">
             {/* SUMMARY DASHBOARD */}
            <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700/50 flex flex-col justify-center text-center">
                    <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">Budget</div>
                    <div className="text-lg md:text-xl font-mono text-white font-bold truncate">{formatMoney(data.totalLimit)}</div>
                </div>
                <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700/50 flex flex-col justify-center text-center">
                    <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">Utfall</div>
                    <div className="text-lg md:text-xl font-mono text-white font-bold truncate">{formatMoney(data.totalSpent)}</div>
                </div>
                <div className={cn("p-3 rounded-xl border flex flex-col justify-center text-center", data.totalRemaining >= 0 ? "bg-emerald-950/30 border-emerald-500/30" : "bg-rose-950/30 border-rose-500/30")}>
                    <div className={cn("text-[10px] uppercase font-bold tracking-wider mb-1", data.totalRemaining >= 0 ? "text-emerald-400" : "text-rose-400")}>Resultat</div>
                    <div className={cn("text-lg md:text-xl font-mono font-bold truncate", data.totalRemaining >= 0 ? "text-emerald-300" : "text-rose-300")}>
                        {data.totalRemaining > 0 && "+"}{formatMoney(data.totalRemaining)}
                    </div>
                </div>
            </div>

            {/* TOTAL PROGRESS */}
            <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700">
                <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold text-slate-400 uppercase">Totalt nyttjande</span>
                    <span className="text-xs font-mono text-slate-500">{Math.round((data.totalSpent / (data.totalLimit || 1)) * 100)}%</span>
                </div>
                <BudgetProgressBar spent={data.totalSpent} total={data.totalLimit} />
            </div>

            {/* PIE CHART */}
            <div className="h-64 relative bg-slate-900/30 rounded-xl border border-slate-700/50 p-2">
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
                                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#fff' }}
                                itemStyle={{ color: '#fff' }}
                                formatter={(value: number) => formatMoney(value)}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="flex items-center justify-center h-full text-slate-500 text-sm">Inga utgifter registrerade denna månad.</div>
                )}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-center opacity-50">
                        <div className="text-xs text-slate-400 uppercase">Totalt</div>
                        <div className="text-xl font-bold text-white">{formatMoney(data.totalSpent)}</div>
                    </div>
                </div>
            </div>

            {/* BUDGET GROUPS LIST */}
            <div className="space-y-4">
                <div className="flex justify-between items-center px-2">
                    <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Budgetgrupper</h2>
                </div>
                
                {data.groupStats.map(group => {
                    const isExpanded = expandedGroup === group.id;
                    const hasOverspend = group.remaining < 0;

                    return (
                        <div key={group.id} className={cn("bg-surface border rounded-xl overflow-hidden transition-all duration-300", group.isCatchAll ? "border-dashed border-slate-600" : "border-slate-700")}>
                            {/* GROUP HEADER */}
                            <div 
                                className="p-4 cursor-pointer hover:bg-slate-800/50 transition-colors"
                                onClick={() => setExpandedGroup(isExpanded ? null : group.id)}
                            >
                                <div className="flex justify-between items-center mb-2">
                                    <div className="flex items-center gap-3">
                                        {isExpanded ? <ChevronDown size={18} className="text-blue-400"/> : <ChevronRight size={18} className="text-slate-500"/>}
                                        <div>
                                            <div className="font-bold text-lg text-white flex items-center gap-2">
                                                <span>{group.icon} {group.name}</span>
                                                {hasOverspend && <AlertTriangle size={14} className="text-rose-500" />}
                                            </div>
                                            {group.isCatchAll && <div className="text-[10px] text-orange-400 uppercase font-bold">Obudgeterat / Övrigt</div>}
                                        </div>
                                    </div>
                                    
                                    <div className="text-right">
                                        {/* INLINE EDITING OF LIMIT */}
                                        {editingGroupId === group.id ? (
                                            <div onClick={e => e.stopPropagation()} className="flex items-center justify-end gap-1 mb-1">
                                                <input 
                                                    autoFocus
                                                    type="number"
                                                    className="w-20 bg-slate-950 border border-blue-500 rounded px-2 py-1 text-right text-sm text-white outline-none font-mono"
                                                    value={tempLimit}
                                                    onChange={(e) => setTempLimit(e.target.value)}
                                                    onKeyDown={(e) => e.key === 'Enter' && handleSaveLimit(group)}
                                                />
                                                <button onClick={() => handleSaveLimit(group)} className="p-1 bg-blue-600 text-white rounded hover:bg-blue-500"><Check size={14}/></button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-end gap-2 group/edit">
                                                <div className="text-sm font-mono font-bold text-white">
                                                    {formatMoney(group.spent)}
                                                    <span className="text-slate-500 font-normal text-xs mx-1">/</span>
                                                    <span className="text-slate-400 text-xs">{formatMoney(group.limit)}</span>
                                                </div>
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); handleStartEdit(group); }}
                                                    className="p-1 text-slate-600 hover:text-blue-400 opacity-0 group-hover/edit:opacity-100 transition-opacity"
                                                >
                                                    <Edit2 size={12} />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <BudgetProgressBar spent={group.spent} total={group.limit} compact />
                            </div>

                            {/* BREAKDOWN (Expanded) */}
                            {isExpanded && (
                                <div className="bg-slate-900/30 border-t border-slate-700/50 animate-in slide-in-from-top-2">
                                    {group.breakdown.map(sub => (
                                        <div key={sub.id} className="p-3 border-b border-slate-700/30 last:border-0 hover:bg-slate-800/30 transition-colors flex justify-between items-center">
                                            <span className="text-sm text-slate-300">{sub.name}</span>
                                            <span className="text-sm font-mono text-white">{formatMoney(sub.spent)}</span>
                                        </div>
                                    ))}
                                    {group.unclassifiedSpent > 0 && (
                                        <div className="p-3 border-b border-slate-700/30 flex justify-between items-center bg-slate-800/20">
                                            <span className="text-sm text-slate-400 italic">Ospecificerat / Saknar underkategori</span>
                                            <span className="text-sm font-mono text-slate-400">{formatMoney(group.unclassifiedSpent)}</span>
                                        </div>
                                    )}
                                    {group.breakdown.length === 0 && group.unclassifiedSpent === 0 && (
                                        <div className="p-4 text-center text-xs text-slate-500 italic">Inga utgifter här än.</div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// --- SUB-COMPONENT: TRENDS ANALYSIS (New View) ---
const TrendsAnalysis = () => {
    const { budgetGroups, transactions, subCategories } = useApp();
    const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('ALL');

    // Generate 12 months of history
    const historyData = useMemo(() => {
        const today = new Date();
        const months = [];

        for (let i = 11; i >= 0; i--) {
            const date = subMonths(today, i);
            const monthKey = format(date, 'yyyy-MM');
            const monthLabel = format(date, 'MMM', { locale: sv });

            // Find transactions for this month
            const monthTxs = transactions.filter(t => 
                t.date.startsWith(monthKey) && 
                (t.type === 'EXPENSE' || (!t.type && t.amount < 0))
            );

            // Calculate spent vs budget
            let spent = 0;
            let budget = 0;

            if (selectedGroupFilter === 'ALL') {
                spent = monthTxs.reduce((sum, t) => sum + Math.abs(t.amount), 0);
                budget = budgetGroups.reduce((sum, g) => {
                    const { data } = getEffectiveBudgetGroupData(g, monthKey);
                    return sum + (data?.limit || 0);
                }, 0);
            } else {
                // Filter for specific group
                const group = budgetGroups.find(g => g.id === selectedGroupFilter);
                if (group) {
                    const { data } = getEffectiveBudgetGroupData(group, monthKey);
                    budget = data?.limit || 0;
                    
                    const assignedSubs = subCategories.filter(s => s.budgetGroupId === group.id);
                    const assignedSubIds = new Set(assignedSubs.map(s => s.id));
                    
                    const groupTxs = monthTxs.filter(t => {
                        if (t.categorySubId && assignedSubIds.has(t.categorySubId)) return true;
                        if (group.isCatchAll && (!t.categorySubId || !subCategories.find(s => s.id === t.categorySubId)?.budgetGroupId)) return true;
                        return false;
                    });
                    spent = groupTxs.reduce((sum, t) => sum + Math.abs(t.amount), 0);
                }
            }

            months.push({
                name: monthLabel,
                key: monthKey,
                Budget: budget,
                Utfall: spent,
                Diff: budget - spent
            });
        }
        return months;
    }, [transactions, budgetGroups, selectedGroupFilter, subCategories]);

    // Calculate KPIs
    const stats = useMemo(() => {
        const totalSpent = historyData.reduce((sum, m) => sum + m.Utfall, 0);
        const avgSpent = Math.round(totalSpent / historyData.length);
        const totalBudget = historyData.reduce((sum, m) => sum + m.Budget, 0);
        const health = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;
        
        // Trend (Last 3m vs Previous 3m)
        const recent = historyData.slice(-3).reduce((sum, m) => sum + m.Utfall, 0);
        const previous = historyData.slice(-6, -3).reduce((sum, m) => sum + m.Utfall, 0);
        const trend = previous > 0 ? ((recent - previous) / previous) * 100 : 0;

        return { avgSpent, health, trend };
    }, [historyData]);

    return (
        <div className="space-y-6 animate-in slide-in-from-right">
            
            {/* FILTERING */}
            <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                <button 
                    onClick={() => setSelectedGroupFilter('ALL')}
                    className={cn("px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all", selectedGroupFilter === 'ALL' ? "bg-white text-slate-900 shadow" : "bg-slate-800 text-slate-400")}
                >
                    Alla Utgifter
                </button>
                {budgetGroups.map(g => (
                    <button 
                        key={g.id}
                        onClick={() => setSelectedGroupFilter(g.id)}
                        className={cn("px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2", selectedGroupFilter === g.id ? "bg-indigo-600 text-white shadow" : "bg-slate-800 text-slate-400")}
                    >
                        <span>{g.icon}</span> {g.name}
                    </button>
                ))}
            </div>

            {/* KPI CARDS */}
            <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-800 p-3 rounded-xl border border-slate-700 shadow-lg">
                    <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Snitt / Mån</div>
                    <div className="text-lg font-mono font-bold text-white">{formatMoney(stats.avgSpent)}</div>
                </div>
                <div className="bg-slate-800 p-3 rounded-xl border border-slate-700 shadow-lg">
                    <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Budgethälsa</div>
                    <div className={cn("text-lg font-mono font-bold", stats.health > 100 ? "text-rose-400" : "text-emerald-400")}>
                        {stats.health}%
                    </div>
                </div>
                <div className="bg-slate-800 p-3 rounded-xl border border-slate-700 shadow-lg">
                    <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Trend (3m)</div>
                    <div className={cn("text-lg font-mono font-bold flex items-center gap-1", stats.trend > 0 ? "text-rose-400" : "text-emerald-400")}>
                        {stats.trend > 0 ? <TrendingUp size={16}/> : <TrendingDown size={16}/>}
                        {Math.abs(Math.round(stats.trend))}%
                    </div>
                </div>
            </div>

            {/* MAIN CHART */}
            <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700 shadow-lg">
                <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-indigo-400" />
                    Utveckling: {selectedGroupFilter === 'ALL' ? 'Total' : budgetGroups.find(g => g.id === selectedGroupFilter)?.name}
                </h3>
                <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={historyData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                            <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                            <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => `${val/1000}k`} />
                            <Tooltip 
                                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px', color: '#fff' }}
                                itemStyle={{ color: '#fff' }}
                                formatter={(value: number) => formatMoney(value)}
                            />
                            
                            {/* Budget Line/Area */}
                            <Area type="monotone" dataKey="Budget" stroke="#6366f1" fill="url(#colorBudget)" fillOpacity={0.1} strokeWidth={2} />
                            
                            {/* Actuals Bar */}
                            <Bar dataKey="Utfall" radius={[4, 4, 0, 0]} barSize={12}>
                                {historyData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.Utfall > entry.Budget ? '#f43f5e' : '#10b981'} />
                                ))}
                            </Bar>
                            
                            <defs>
                                <linearGradient id="colorBudget" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
                
                {/* Legend */}
                <div className="flex justify-center gap-4 mt-4 text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                    <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-indigo-500"></div> Budgettak</div>
                    <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> Inom ram</div>
                    <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-rose-500"></div> Över budget</div>
                </div>
            </div>
        </div>
    );
};

// --- MAIN VIEW ---
export const StatsView: React.FC = () => {
  const { selectedMonth } = useApp();
  const [activeTab, setActiveTab] = useState<'snapshot' | 'trends'>('snapshot');

  return (
    <div className="space-y-6 pb-24 animate-in slide-in-from-right duration-300">
      <header>
          <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-indigo-400">Statistik</h1>
          <p className="text-slate-400">Följ upp din ekonomi och se trender.</p>
      </header>

      {/* TABS */}
      <div className="flex p-1 bg-slate-800 rounded-xl shadow-lg border border-slate-700/50">
          <button 
            onClick={() => setActiveTab('snapshot')}
            className={cn("flex-1 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all", 
                activeTab === 'snapshot' ? "bg-indigo-600 text-white shadow-lg" : "text-slate-400 hover:text-white"
            )}
          >
              <PieIcon size={16} /> Månad
          </button>
          <button 
            onClick={() => setActiveTab('trends')}
            className={cn("flex-1 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all", 
                activeTab === 'trends' ? "bg-purple-600 text-white shadow-lg" : "text-slate-400 hover:text-white"
            )}
          >
              <TrendingUp size={16} /> Trender (12 mån)
          </button>
      </div>

      {/* CONTENT */}
      {activeTab === 'snapshot' ? (
          <MonthlySnapshot selectedMonth={selectedMonth} />
      ) : (
          <TrendsAnalysis />
      )}
    </div>
  );
};