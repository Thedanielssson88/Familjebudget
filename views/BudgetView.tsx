
import React, { useState, useMemo } from 'react';
import { useApp } from '../store';
import { OperatingBudgetView } from './OperatingBudgetView';
import { IncomeView } from './IncomeView';
import { getBudgetInterval, calculateFixedBucketCost, calculateDailyBucketCost, calculateGoalBucketCost, formatMoney, getEffectiveBucketData } from '../utils';
import { cn, Card } from '../components/components';
import { Wallet, ArrowRightLeft, PieChart, Check, AlertTriangle } from 'lucide-react';
import { useBudgetActuals } from '../hooks/useBudgetActuals';
import { BudgetProgressBar } from '../components/BudgetProgressBar';

export const BudgetView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'income' | 'transfers' | 'operating'>('operating'); // Default to Operating now as it is the main edit view

  return (
    <div className="space-y-6 pb-24 animate-in slide-in-from-right duration-300">
      
      {/* HEADER & TABS */}
      <div className="flex flex-col gap-4">
          <header>
            <h1 className="text-3xl font-bold text-white mb-1">Budget & Ekonomi</h1>
            <p className="text-slate-400 text-sm">Hantera inkomster, drift och överföringar.</p>
          </header>

          <div className="bg-slate-800 p-1 rounded-xl flex gap-1 shadow-lg border border-slate-700 overflow-x-auto no-scrollbar">
              <button 
                onClick={() => setActiveTab('income')}
                className={cn(
                    "flex-1 py-3 px-4 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all whitespace-nowrap",
                    activeTab === 'income' ? "bg-emerald-600 text-white shadow-md" : "text-slate-400 hover:text-white hover:bg-slate-700"
                )}
              >
                  <Wallet size={16} />
                  Inkomst
              </button>
              <button 
                onClick={() => setActiveTab('operating')}
                className={cn(
                    "flex-1 py-3 px-4 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all whitespace-nowrap",
                    activeTab === 'operating' ? "bg-indigo-600 text-white shadow-md" : "text-slate-400 hover:text-white hover:bg-slate-700"
                )}
              >
                  <PieChart size={16} />
                  Drift
              </button>
              <button 
                onClick={() => setActiveTab('transfers')}
                className={cn(
                    "flex-1 py-3 px-4 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all whitespace-nowrap",
                    activeTab === 'transfers' ? "bg-blue-600 text-white shadow-md" : "text-slate-400 hover:text-white hover:bg-slate-700"
                )}
              >
                  <ArrowRightLeft size={16} />
                  Kassaflöde
              </button>
          </div>
      </div>

      {/* VIEW CONTENT */}
      <div className="min-h-[400px]">
          {activeTab === 'income' ? (
              <IncomeView />
          ) : activeTab === 'transfers' ? (
              <TransfersViewContent />
          ) : (
              <OperatingBudgetView />
          )}
      </div>
    </div>
  );
};

const TransfersViewContent: React.FC = () => {
  const { accounts, buckets, budgetGroups, subCategories, selectedMonth, settings } = useApp();
  
  // REAL-TIME ACTUALS HOOK
  const actuals = useBudgetActuals(selectedMonth, settings.payday);

  // --- CALCULATE NEED PER ACCOUNT ---
  const { accountNeeds, unallocatedNeeds } = useMemo(() => {
      const needs: Record<string, number> = {};
      let unallocated = 0;

      // Iterate ONLY over Budget Groups (The "Drift" structure).
      budgetGroups.forEach(group => {
          
          // 1. Subcategories (Variable costs linked to this group)
          const subs = subCategories.filter(s => s.budgetGroupId === group.id);
          const subTotal = subs.reduce((sum, s) => sum + (s.monthlyBudget || 0), 0);

          // 2. Linked Buckets (Fixed costs/Goals linked to this group)
          const groupBuckets = buckets.filter(b => 
              b.budgetGroupId === group.id || 
              (group.linkedBucketIds && group.linkedBucketIds.includes(b.id))
          );

          // Calculate Bucket Costs
          groupBuckets.forEach(bucket => {
              let cost = 0;
              if (bucket.type === 'GOAL' && bucket.paymentSource === 'BALANCE') {
                  cost = 0; 
              } else {
                  if (bucket.type === 'FIXED') cost = calculateFixedBucketCost(bucket, selectedMonth);
                  else if (bucket.type === 'DAILY') cost = calculateDailyBucketCost(bucket, selectedMonth, settings.payday);
                  else if (bucket.type === 'GOAL') cost = calculateGoalBucketCost(bucket, selectedMonth);
              }

              if (cost > 0) {
                  if (bucket.accountId) {
                      needs[bucket.accountId] = (needs[bucket.accountId] || 0) + cost;
                  } else if (group.defaultAccountId) {
                      needs[group.defaultAccountId] = (needs[group.defaultAccountId] || 0) + cost;
                  } else {
                      unallocated += cost;
                  }
              }
          });

          // 3. Group Budget Logic (The "Total Budget" Logic)
          // We determine the Effective Group Budget. This is either the sum of subcategories
          // OR the manually set limit on the group, whichever is HIGHER (or simply the manual limit if set).
          // This ensures "Uncategorized" buffers are counted.
          
          let effectiveGroupBudget = subTotal;
          const explicit = group.monthlyData?.[selectedMonth];
          
          if (explicit && !explicit.isExplicitlyDeleted) {
              // If a manual limit exists, we use MAX(Manual, SubTotal) to ensure we cover the plan.
              // For "Catch-All" groups with 0 subcategories but 5000 manual limit, this returns 5000.
              effectiveGroupBudget = Math.max(subTotal, explicit.limit);
          }

          // Assign the Group's general budget (Variable part) to the Group's default account
          if (effectiveGroupBudget > 0) {
              if (group.defaultAccountId) {
                  needs[group.defaultAccountId] = (needs[group.defaultAccountId] || 0) + effectiveGroupBudget;
              } else {
                  unallocated += effectiveGroupBudget;
              }
          }
      });

      return { accountNeeds: needs, unallocatedNeeds: unallocated };
  }, [budgetGroups, subCategories, buckets, selectedMonth, settings.payday]);

  return (
    <div className="space-y-6 animate-in fade-in">
        
      <div className="bg-blue-900/20 border border-blue-500/30 p-4 rounded-xl text-sm text-blue-200 mb-6 flex gap-3 items-start">
         <div className="p-2 bg-blue-500/20 rounded-lg">
             <ArrowRightLeft size={18} />
         </div>
         <div>
             <h3 className="font-bold flex items-center gap-2 mb-1">Kassaflöde / Överföringsbehov</h3>
             <p className="opacity-80">Här ser du hur mycket som behöver finnas på respektive konto baserat på din totala Driftbudget (inklusive poster och manuella gränser).</p>
         </div>
      </div>

      <div className="space-y-4">
          {accounts.map(account => {
              const needed = accountNeeds[account.id] || 0;
              
              // Filter actual transactions to find transfers INTO this account
              const transfersIn = (actuals?.transactions || [])
                .filter(t => t.accountId === account.id && (t.type === 'TRANSFER' || t.type === 'INCOME') && t.amount > 0)
                .reduce((sum, t) => sum + t.amount, 0);

              return (
                  <div key={account.id} className="bg-slate-800 rounded-xl border border-slate-700 p-4 shadow-lg">
                      <div className="flex justify-between items-center mb-2">
                          <div className="flex items-center gap-3">
                              <span className="text-2xl">{account.icon}</span>
                              <div>
                                  <h3 className="font-bold text-white text-lg">{account.name}</h3>
                                  <div className="text-xs text-slate-400">Behov: <span className="text-white font-mono font-bold">{formatMoney(needed)}</span></div>
                              </div>
                          </div>
                          <div className="text-right">
                              <div className="text-[10px] text-slate-500 uppercase font-bold">Överfört</div>
                              <div className={cn("font-mono font-bold text-lg", transfersIn >= needed ? "text-emerald-400" : "text-white")}>
                                  {formatMoney(transfersIn)}
                              </div>
                          </div>
                      </div>
                      
                      <BudgetProgressBar spent={transfersIn} total={needed} label="Täckt av överföringar" />
                      
                      {transfersIn >= needed && needed > 0 && (
                          <div className="mt-2 text-xs text-emerald-400 flex items-center justify-end gap-1">
                              <Check size={12} /> Klart
                          </div>
                      )}
                  </div>
              );
          })}

          {/* UNALLOCATED WARNING */}
          {unallocatedNeeds > 0 && (
              <div className="bg-rose-950/20 border border-rose-500/30 rounded-xl p-4 shadow-lg animate-pulse">
                  <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 bg-rose-500/20 rounded-lg text-rose-400">
                          <AlertTriangle size={20} />
                      </div>
                      <div>
                          <h3 className="font-bold text-rose-200 text-lg">Saknar Konto</h3>
                          <div className="text-xs text-rose-300">Budgeterat men ej kopplat till konto</div>
                      </div>
                      <div className="ml-auto text-right">
                          <div className="text-[10px] text-rose-400 uppercase font-bold">Behov</div>
                          <div className="font-mono font-bold text-lg text-rose-200">{formatMoney(unallocatedNeeds)}</div>
                      </div>
                  </div>
                  <p className="text-xs text-rose-300/70 mt-2">
                      Vissa budgetgrupper eller poster saknar ett valt "Finansierande Konto". Gå till Inställningar på gruppen för att välja konto.
                  </p>
              </div>
          )}
      </div>
    </div>
  );
};
