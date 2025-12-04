import React, { useState, useMemo } from 'react';
import { useApp } from '../store';
import { calculateDailyBucketCost, calculateDailyBucketCostSoFar, calculateFixedBucketCost, calculateGoalBucketCost, formatMoney, getLatestDailyDeduction, getTotalFamilyIncome, getUserIncome } from '../utils';
import { Card, cn } from '../components/components';
import { ArrowDown, TrendingUp, Sliders, Landmark, Calculator, ShieldCheck } from 'lucide-react';

export const DashboardView: React.FC = () => {
  const { users, buckets, selectedMonth, settings } = useApp();
  const [scenarioAdjustment, setScenarioAdjustment] = useState(0); // Slider value

  // 1. Calculate Actual Inflow (Cash that really exists)
  // Memoized: Only recalculates when users or month changes
  const totalActualIncome = useMemo(() => 
    getTotalFamilyIncome(users, selectedMonth), 
  [users, selectedMonth]);

  // 2. Calculate Outflow (Expenses + Savings)
  // Memoized: Heavy iteration over buckets
  const { totalProjectedExpenses, totalFixedExpenses, totalDailyExpensesSoFar } = useMemo(() => {
    let projected = 0;
    let fixed = 0; // Fixed + Goals
    let dailySoFar = 0; // Variable up to today

    buckets.forEach(b => {
        // Skip if explicitly set to take from balance
        if (b.paymentSource === 'BALANCE') return;

        let cost = 0;
        if (b.type === 'FIXED') {
            cost = calculateFixedBucketCost(b, selectedMonth);
            fixed += cost;
        } else if (b.type === 'GOAL') {
            cost = calculateGoalBucketCost(b, selectedMonth);
            fixed += cost; // Treat goals as fixed monthly costs
        } else if (b.type === 'DAILY') {
            cost = calculateDailyBucketCost(b, selectedMonth, settings.payday);
            const soFar = calculateDailyBucketCostSoFar(b, selectedMonth, settings.payday);
            dailySoFar += soFar;
        }
        
        projected += cost;
    });

    return { totalProjectedExpenses: projected, totalFixedExpenses: fixed, totalDailyExpensesSoFar: dailySoFar };
  }, [buckets, selectedMonth, settings.payday]);

  // 3. CALCULATE SURPLUS (From Actual Income)
  // This is the real pot of money available to distribute
  const effectiveExpenses = totalProjectedExpenses + scenarioAdjustment;
  const surplus = totalActualIncome - effectiveExpenses;

  // 4. CALCULATE THEORETICAL INCOME & DISTRIBUTION
  // Memoized to avoid re-calculating distribution on simple renders
  const { distribution, totalDistributed } = useMemo(() => {
    // 4a. Theoretical Income Calculation
    const userCalculations = users.map(user => {
        const data = user.incomeData[selectedMonth] || {};
        const actualIncome = getUserIncome(user, selectedMonth);
        
        // Calculate loss: Days * (Daily Rate OR Last Known Daily Rate)
        const days = data.vabDays || 0;
        const rate = data.dailyDeduction !== undefined ? data.dailyDeduction : getLatestDailyDeduction(user, selectedMonth);
        const incomeLoss = days * rate;
        
        // Theoretical Income = What they brought home + What they lost
        const theoreticalIncome = actualIncome + incomeLoss;
    
        return {
            ...user,
            actualIncome,
            incomeLoss,
            theoreticalIncome
        };
    });

    const totalTheoreticalIncome = userCalculations.reduce((sum, u) => sum + u.theoreticalIncome, 0);

    // 4b. Distribution Logic
    const dist = userCalculations.map(user => {
        // The share is based on the Theoretical Income
        const contributionShare = totalTheoreticalIncome > 0 ? user.theoreticalIncome / totalTheoreticalIncome : 0;
        
        // The payout comes from the Actual Surplus
        const returnAmount = Math.max(0, surplus * contributionShare);
        
        return { ...user, returnAmount, contributionShare };
    });

    const totalDist = dist.reduce((sum, d) => sum + d.returnAmount, 0);

    return { distribution: dist, totalDistributed: totalDist };
  }, [users, selectedMonth, surplus]);
  
  // Total cash surplus (visually displayed at top)
  const displaySurplus = surplus;

  // CALCULATIONS FOR DASHBOARD STATUS
  // 1. Balance on transfer account TODAY (Income - All Fixed - Variable So Far)
  const currentAccountBalance = totalActualIncome - totalFixedExpenses - totalDailyExpensesSoFar;

  // 2. Remaining on account AFTER transfers (Current Balance - Distributed Surplus)
  const balanceAfterTransfers = currentAccountBalance - totalDistributed;

  return (
    <div className="space-y-8 pb-24 animate-in fade-in duration-500">
      {/* HEADER: FLOW SUMMARY */}
      <div className="text-center space-y-2 py-4">
        <div className="inline-block px-4 py-1 rounded-full bg-slate-800 text-slate-400 text-xs font-mono uppercase tracking-widest">
            Kassaflöde (Överskott)
        </div>
        <div className="flex items-end justify-center gap-2">
            <span className="text-5xl font-bold text-white tracking-tighter">{formatMoney(displaySurplus)}</span>
        </div>
        <p className="text-emerald-400 text-sm font-medium">Totalt kvar efter räkningar</p>
      </div>

      {/* WATERFALL VISUALIZATION */}
      <div className="relative space-y-1">
        {/* Step 1: Income */}
        <div className="bg-emerald-600 rounded-xl p-4 text-white relative z-10 shadow-lg shadow-emerald-900/20">
            <div className="flex justify-between items-center">
                <span className="font-medium opacity-90">Total Inkomst (Faktisk)</span>
                <span className="font-bold font-mono">{formatMoney(totalActualIncome)}</span>
            </div>
            {/* Connector */}
            <div className="absolute left-1/2 -bottom-4 w-0.5 h-4 bg-emerald-600/50"></div>
        </div>
        
        <div className="flex justify-center py-1"><ArrowDown className="w-4 h-4 text-slate-600" /></div>

        {/* Step 2: Expenses */}
        <div className="bg-rose-600 rounded-xl p-4 text-white relative z-10 shadow-lg shadow-rose-900/20">
            <div className="flex justify-between items-center">
                <span className="font-medium opacity-90">Budget & Kostnader</span>
                <span className="font-bold font-mono">-{formatMoney(totalProjectedExpenses + scenarioAdjustment)}</span>
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
                    
                    <div className="text-[10px] text-slate-500 uppercase tracking-wide mt-2">
                        Andel: {Math.round(d.contributionShare * 100)}%
                    </div>
                    
                    {d.incomeLoss > 0 && (
                        <div className="mt-1 text-[10px] text-rose-300 bg-rose-500/10 px-1 py-0.5 rounded inline-block">
                             Kompenserad för {formatMoney(d.incomeLoss)}
                        </div>
                    )}
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