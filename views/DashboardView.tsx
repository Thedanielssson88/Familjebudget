
import React, { useState } from 'react';
import { useApp } from '../store';
import { calculateDailyBucketCost, calculateDailyBucketCostSoFar, calculateFixedBucketCost, calculateGoalBucketCost, formatMoney, getTotalFamilyIncome, getUserIncome } from '../utils';
import { Card, cn } from '../components/components';
import { ArrowDown, TrendingUp, Sliders, Landmark, Calculator } from 'lucide-react';

export const DashboardView: React.FC = () => {
  const { users, buckets, selectedMonth, settings } = useApp();
  const [scenarioAdjustment, setScenarioAdjustment] = useState(0); // Slider value

  // 1. Calculate Inflow
  const totalIncome = getTotalFamilyIncome(users, selectedMonth);

  // 2. Calculate Outflow (Expenses + Savings)
  // CRITICAL: Only include buckets where paymentSource is 'INCOME' (default) or undefined. 
  // If paymentSource is 'BALANCE', it's taken from assets, not monthly cash flow.
  let totalProjectedExpenses = 0;
  let totalFixedExpenses = 0; // Fixed + Goals
  let totalDailyExpensesSoFar = 0; // Variable up to today

  buckets.forEach(b => {
    // Skip if explicitly set to take from balance
    if (b.paymentSource === 'BALANCE') return;

    let cost = 0;
    if (b.type === 'FIXED') {
        cost = calculateFixedBucketCost(b, selectedMonth);
        totalFixedExpenses += cost;
    } else if (b.type === 'GOAL') {
        cost = calculateGoalBucketCost(b, selectedMonth);
        totalFixedExpenses += cost; // Treat goals as fixed monthly costs
    } else if (b.type === 'DAILY') {
        cost = calculateDailyBucketCost(b, selectedMonth, settings.payday);
        const soFar = calculateDailyBucketCostSoFar(b, selectedMonth, settings.payday);
        totalDailyExpensesSoFar += soFar;
    }
    
    totalProjectedExpenses += cost;
  });

  // Apply scenario
  const effectiveExpenses = totalProjectedExpenses + scenarioAdjustment;
  const surplus = totalIncome - effectiveExpenses;

  // 3. Distribution Logic
  const distribution = users.map(user => {
    const userIncome = getUserIncome(user, selectedMonth);
    const contributionShare = totalIncome > 0 ? userIncome / totalIncome : 0;
    const returnAmount = Math.max(0, surplus * contributionShare);
    return { ...user, returnAmount, contributionShare };
  });

  const totalDistributed = distribution.reduce((sum, d) => sum + d.returnAmount, 0);

  // CALCULATIONS FOR DASHBOARD STATUS
  // 1. Balance on transfer account TODAY (Income - All Fixed - Variable So Far)
  const currentAccountBalance = totalIncome - totalFixedExpenses - totalDailyExpensesSoFar;

  // 2. Remaining on account AFTER transfers (Current Balance - Distributed Surplus)
  // This represents the buffer left for the remaining days of variable expenses.
  const balanceAfterTransfers = currentAccountBalance - totalDistributed;

  return (
    <div className="space-y-8 pb-24 animate-in fade-in duration-500">
      {/* HEADER: FLOW SUMMARY */}
      <div className="text-center space-y-2 py-4">
        <div className="inline-block px-4 py-1 rounded-full bg-slate-800 text-slate-400 text-xs font-mono uppercase tracking-widest">
            Kassaflöde
        </div>
        <div className="flex items-end justify-center gap-2">
            <span className="text-5xl font-bold text-white tracking-tighter">{formatMoney(surplus)}</span>
        </div>
        <p className="text-emerald-400 text-sm font-medium">Kvar till familjen (Fickpengar)</p>
      </div>

      {/* WATERFALL VISUALIZATION */}
      <div className="relative space-y-1">
        {/* Step 1: Income */}
        <div className="bg-emerald-600 rounded-xl p-4 text-white relative z-10 shadow-lg shadow-emerald-900/20">
            <div className="flex justify-between items-center">
                <span className="font-medium opacity-90">Total Inkomst</span>
                <span className="font-bold font-mono">{formatMoney(totalIncome)}</span>
            </div>
            {/* Connector */}
            <div className="absolute left-1/2 -bottom-4 w-0.5 h-4 bg-emerald-600/50"></div>
        </div>
        
        <div className="flex justify-center py-1"><ArrowDown className="w-4 h-4 text-slate-600" /></div>

        {/* Step 2: Expenses */}
        <div className="bg-rose-600 rounded-xl p-4 text-white relative z-10 shadow-lg shadow-rose-900/20">
            <div className="flex justify-between items-center">
                <span className="font-medium opacity-90">Budget & Kostnader (Från lön)</span>
                <span className="font-bold font-mono">-{formatMoney(effectiveExpenses)}</span>
            </div>
            {/* Scenario Indicator */}
            {scenarioAdjustment !== 0 && (
                <div className="mt-2 text-xs bg-black/20 rounded px-2 py-1 text-rose-200">
                    Inkluderar scenario: {scenarioAdjustment > 0 ? '+' : ''}{formatMoney(scenarioAdjustment)}
                </div>
            )}
             {/* Connector */}
             <div className="absolute left-1/2 -bottom-4 w-0.5 h-4 bg-rose-600/50"></div>
        </div>

        <div className="flex justify-center py-1"><ArrowDown className="w-4 h-4 text-slate-600" /></div>

        {/* INTERMEDIATE CALCULATION: CURRENT BALANCE */}
        <div className="bg-blue-600/90 rounded-xl p-4 text-white relative z-10 shadow-lg shadow-blue-900/20 border-l-4 border-blue-300">
             <div className="flex items-center gap-2 mb-2">
                 <Landmark className="w-5 h-5 text-blue-200" />
                 <span className="text-sm font-bold text-blue-100 uppercase tracking-wide">Saldo på överföringskonto (Idag)</span>
             </div>
             <div className="flex justify-between items-end">
                 <div className="text-xs text-blue-200 max-w-[60%]">
                     Inkomst minus alla fasta räkningar och rörliga utgifter fram till idag.
                 </div>
                 <span className="font-bold font-mono text-xl">{formatMoney(currentAccountBalance)}</span>
             </div>
             {/* Connector */}
             <div className="absolute left-1/2 -bottom-4 w-0.5 h-4 bg-blue-600/50"></div>
        </div>

        <div className="flex justify-center py-1"><ArrowDown className="w-4 h-4 text-slate-600" /></div>

        {/* Step 3: Distribution */}
        <div className="grid grid-cols-2 gap-4 pt-2">
            {distribution.map(d => (
                <Card key={d.id} className="border-t-4 border-t-emerald-400 bg-slate-800/80">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="text-xl">{d.avatar}</span>
                        <span className="font-bold text-sm">{d.name}</span>
                    </div>
                    <div className="text-2xl font-bold text-white mb-1">
                        {formatMoney(d.returnAmount)}
                    </div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wide">
                        Baserat på {Math.round(d.contributionShare * 100)}% bidrag
                    </div>
                </Card>
            ))}
        </div>

        <div className="flex justify-center py-1"><ArrowDown className="w-4 h-4 text-slate-600" /></div>

        {/* FINAL CALCULATION: REMAINING FOR TRANSFERS */}
        <div className="bg-slate-700/90 rounded-xl p-4 text-white relative z-10 shadow-lg border border-slate-600">
             <div className="flex items-center gap-2 mb-2">
                 <Calculator className="w-5 h-5 text-emerald-400" />
                 <span className="text-sm font-bold text-slate-200 uppercase tracking-wide">Kvar på kontot efter utbetalning</span>
             </div>
             <div className="flex justify-between items-end">
                 <div className="text-xs text-slate-400 max-w-[60%]">
                     Detta belopp måste finnas kvar på kontot efter att fickpengar har delats ut för att täcka resten av månadens rörliga utgifter.
                 </div>
                 <span className={cn("font-bold font-mono text-xl", balanceAfterTransfers < 0 ? "text-red-400" : "text-emerald-400")}>
                    {formatMoney(balanceAfterTransfers)}
                 </span>
             </div>
        </div>

      </div>

      {/* SCENARIO PLAYGROUND */}
      <div className="bg-surface border border-slate-700 p-6 rounded-2xl space-y-4">
        <div className="flex items-center gap-2 text-amber-400 mb-2">
            <Sliders className="w-5 h-5" />
            <h3 className="font-bold">Scenario Simulator</h3>
        </div>
        <p className="text-sm text-slate-400">Vad händer om våra utgifter ökar?</p>
        
        <input 
            type="range" 
            min="0" 
            max="10000" 
            step="500"
            value={scenarioAdjustment}
            onChange={(e) => setScenarioAdjustment(Number(e.target.value))}
            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
        />
        <div className="flex justify-between text-xs font-mono text-slate-500">
            <span>0 kr</span>
            <span className={cn(scenarioAdjustment > 0 ? "text-amber-400 font-bold" : "")}>+{formatMoney(scenarioAdjustment)} / mån</span>
            <span>+10 000 kr</span>
        </div>
      </div>
    </div>
  );
};
