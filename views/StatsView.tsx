import React, { useMemo, useState } from 'react';
import { useApp } from '../store';
import { formatMoney, getEffectiveBudgetGroupData } from '../utils';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { ChevronRight, ChevronDown, Edit2, Check, AlertTriangle, Save, X, Plus, Wallet } from 'lucide-react';
import { BudgetProgressBar } from '../components/BudgetProgressBar';
import { cn, Button, Input, Modal } from '../components/components';
import { BudgetGroup } from '../types';

export const StatsView: React.FC = () => {
  const { selectedMonth, budgetGroups, subCategories, transactions, updateBudgetGroup } = useApp();
  
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [tempLimit, setTempLimit] = useState<string>('');
  
  // 1. Calculate Actuals vs Budget Groups
  const data = useMemo(() => {
    const txForMonth = transactions.filter(t => t.date.startsWith(selectedMonth));
    
    // Only count EXPENSES (Consumption)
    const expenseTx = txForMonth.filter(t => t.type === 'EXPENSE' || (!t.type && t.amount < 0)); 

    // Find the Catch-All group (fallback)
    const catchAllGroup = budgetGroups.find(g => g.isCatchAll);
    
    // Helper to find which group a transaction belongs to
    const getGroupIdForTx = (tx: { categorySubId?: string }) => {
        if (!tx.categorySubId) return catchAllGroup?.id || 'unknown';
        const sub = subCategories.find(s => s.id === tx.categorySubId);
        return sub?.budgetGroupId || catchAllGroup?.id || 'unknown';
    };

    const groupStats = budgetGroups.map(group => {
        // Find all subcategories belonging to this group
        const assignedSubs = subCategories.filter(s => s.budgetGroupId === group.id);
        const assignedSubIds = new Set(assignedSubs.map(s => s.id));
        
        // Find transactions matching this group
        // Match logic: 
        // 1. Transaction has a SubCategory that belongs to this Group
        // 2. OR Transaction has NO SubCategory (or unknown) and this is the Catch-All group
        
        const groupTxs = expenseTx.filter(t => {
            if (t.categorySubId && assignedSubIds.has(t.categorySubId)) return true;
            if (group.isCatchAll && (!t.categorySubId || !subCategories.find(s => s.id === t.categorySubId)?.budgetGroupId)) return true;
            return false;
        });
        
        const spent = groupTxs.reduce((sum, t) => sum + Math.abs(t.amount), 0);
        
        // Breakdown by SubCategory for the expanded view
        const breakdown = assignedSubs.map(sub => {
            const subSpent = groupTxs
                .filter(t => t.categorySubId === sub.id)
                .reduce((sum, t) => sum + Math.abs(t.amount), 0);
            return { ...sub, spent: subSpent };
        }).sort((a,b) => b.spent - a.spent);

        // Calculate "Other/Uncategorized" inside this group (only relevant for CatchAll really)
        const totalSubSpent = breakdown.reduce((sum, s) => sum + s.spent, 0);
        const unclassifiedSpent = spent - totalSubSpent;

        // Get effective limit for the month
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
        // Sort Catch-All last, others by name
        if (a.isCatchAll) return 1;
        if (b.isCatchAll) return -1;
        return b.spent - a.spent; // Highest spent first
    });

    // Totals
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
  
  // Prepare Pie Data
  const pieData = data.groupStats
      .filter(g => g.spent > 0)
      .map(g => ({ name: g.name, value: g.spent }));
      
  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6', '#f43f5e', '#8b5cf6'];

  return (
    <div className="space-y-8 pb-24 animate-in slide-in-from-right duration-300">
      <header className="flex flex-col gap-2">
        <div>
            <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-400">Driftbudget</h1>
            <p className="text-slate-400">Uppföljning per budgetgrupp (Kostnadsställe).</p>
        </div>
      </header>

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
          <BudgetProgressBar 
             spent={data.totalSpent} 
             total={data.totalLimit} 
          />
      </div>

      {/* PIE CHART */}
      <div className="h-64 relative">
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
              const percent = Math.min((group.spent / (group.limit || 1)) * 100, 100);
              
              // Only show if budget exists OR money spent
              // if (group.limit === 0 && group.spent === 0 && !group.isCatchAll) return null;

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
                              {/* Subcategories Breakdown */}
                              {group.breakdown.map(sub => (
                                  <div key={sub.id} className="p-3 border-b border-slate-700/30 last:border-0 hover:bg-slate-800/30 transition-colors flex justify-between items-center">
                                      <span className="text-sm text-slate-300">{sub.name}</span>
                                      <span className="text-sm font-mono text-white">{formatMoney(sub.spent)}</span>
                                  </div>
                              ))}

                              {/* Unclassified (if direct match to CatchAll without subcategory) */}
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
