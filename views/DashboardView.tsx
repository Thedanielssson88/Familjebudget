
import React, { useState, useMemo } from 'react';
import { useApp } from '../store';
import { calculateDailyBucketCost, calculateDailyBucketCostSoFar, calculateFixedBucketCost, calculateGoalBucketCost, formatMoney, getEffectiveBudgetGroupData, getEffectiveSubCategoryBudget, getLatestDailyDeduction, getTotalFamilyIncome, getUserIncome } from '../utils';
import { Card, cn } from '../components/components';
import { ArrowDown, Sliders, Landmark, Calculator, PiggyBank, LayoutGrid, BarChart3 } from 'lucide-react';
import { StatsView } from './StatsView';

// Simple SVG Gauge Component
const SavingsGauge = ({ percentage }: { percentage: number }) => {
  const p = Math.min(Math.max(percentage, 0), 100);
  const radius = 35;
  const circumference = 2 * Math.PI * radius;
  // We only use half circle (180deg), so max offset corresponds to half circumference
  const arcLength = circumference / 2;
  const strokeDashoffset = arcLength - ((p / 100) * arcLength);
  
  let colorClass = "text-rose-400";
  let message = "Kom igen!";
  if (p >= 5) { colorClass = "text-orange-400"; message = "Bra start!"; }
  if (p >= 10) { colorClass = "text-yellow-400"; message = "Bra jobbat!"; }
  if (p >= 20) { colorClass = "text-emerald-400"; message = "Fantastiskt!"; }
  if (p >= 50) { colorClass = "text-blue-400"; message = "Super!"; }

  return (
    <div className="flex flex-col items-center justify-center">
        <div className="relative w-32 h-16 overflow-hidden">
        <svg className="w-32 h-32 absolute top-0 rotate-[180deg]" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="35" fill="none" stroke="#334155" strokeWidth="8" strokeDasharray={`${arcLength} ${circumference}`} />
            <circle cx="50" cy="50" r="35" fill="none" stroke="currentColor" strokeWidth="8"
                strokeDasharray={`${arcLength} ${circumference}`}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                className={cn("transition-all duration-1000 ease-out", colorClass)}
            />
        </svg>
        <div className="absolute bottom-0 w-full text-center pb-1">
            <span className={cn("text-2xl font-bold leading-none", colorClass)}>{Math.round(p)}%</span>
        </div>
        </div>
        <div className="text-[10px] uppercase tracking-widest text-slate-400 mt-1">Sparkvot</div>
        <div className={cn("text-xs font-medium mt-1", colorClass)}>{message}</div>
    </div>
  );
};

const WaterfallOverview: React.FC = () => {
  const { users, buckets, selectedMonth, settings, budgetGroups, subCategories, budgetTemplates, monthConfigs } = useApp();
  const [scenarioAdjustment, setScenarioAdjustment] = useState(0);

  // 1. Calculate Actual Inflow
  const totalActualIncome = useMemo(() => 
    getTotalFamilyIncome(users, selectedMonth), 
  [users, selectedMonth]);

  // 2. Calculate BUDGETED Outflow (Split by Consumption vs Savings)
  const { consumptionExpenses, savingsExpenses, totalDailySoFar, totalFixedForBalance } = useMemo(() => {
    let consumption = 0;
    let savings = 0;
    let dailySoFar = 0;
    let fixedForBalance = 0; // Tracks actual expected cash outflow for balance calc

    // A. BUCKETS (Fixed, Daily, Goals)
    buckets.forEach(b => {
        if (b.paymentSource === 'BALANCE') return;

        let cost = 0;
        let isDaily = false;

        if (b.type === 'FIXED') {
            cost = calculateFixedBucketCost(b, selectedMonth);
        } else if (b.type === 'GOAL') {
            cost = calculateGoalBucketCost(b, selectedMonth);
        } else if (b.type === 'DAILY') {
            isDaily = true;
            cost = calculateDailyBucketCost(b, selectedMonth, settings.payday);
            dailySoFar += calculateDailyBucketCostSoFar(b, selectedMonth, settings.payday);
        }

        // Logic for balance calculation (money leaving account)
        if (!isDaily) {
            fixedForBalance += cost;
        }

        // Logic for Waterfall (Classification)
        if (b.isSavings) {
            savings += cost;
        } else {
            consumption += cost;
        }
    });

    // B. BUDGET GROUPS (Variable Categories)
    // Iterate budget groups to find their effective budget.
    // Split subcategories based on 'isSavings' flag.
    budgetGroups.forEach(group => {
        // Get effective total limit for the group
        const { data } = getEffectiveBudgetGroupData(group, selectedMonth, budgetTemplates, monthConfigs);
        const groupLimit = data ? data.limit : 0;

        // Get subcategories for this group
        const groupSubs = subCategories.filter(s => s.budgetGroupId === group.id);
        
        let sumSubBudgets = 0;
        
        // Sum up specific subcategory budgets
        groupSubs.forEach(sub => {
            const subBudget = getEffectiveSubCategoryBudget(sub, selectedMonth, budgetTemplates, monthConfigs);
            sumSubBudgets += subBudget;
            
            if (sub.isSavings) {
                savings += subBudget;
            } else {
                consumption += subBudget;
            }
        });

        // Handle "Unallocated" / Buffer within the group limit
        // Typically, unallocated budget in a group is considered consumption (buffer for overspending)
        const unallocated = Math.max(0, groupLimit - sumSubBudgets);
        consumption += unallocated;
    });

    return { 
        consumptionExpenses: consumption, 
        savingsExpenses: savings, 
        totalDailySoFar: dailySoFar,
        totalFixedForBalance: fixedForBalance
    };
  }, [buckets, budgetGroups, subCategories, selectedMonth, settings.payday, budgetTemplates, monthConfigs]);

  // 3. Totals and Surplus
  // Scenario adjustment is assumed to be extra CONSUMPTION (bills/food increasing)
  const totalProjectedExpenses = consumptionExpenses + savingsExpenses;
  const effectiveConsumption = consumptionExpenses + scenarioAdjustment;
  const surplus = totalActualIncome - (effectiveConsumption + savingsExpenses);

  // Intermediate Waterfall Step: Result before Savings
  const resultBeforeSavings = totalActualIncome - effectiveConsumption;

  // Savings Rate
  const savingsRate = totalActualIncome > 0 ? (savingsExpenses / totalActualIncome) * 100 : 0;

  // 4. Distribution Logic
  const { distribution, totalDistributed } = useMemo(() => {
    const userCalculations = users.map(user => {
        const data = user.incomeData[selectedMonth];
        const actualIncome = getUserIncome(user, selectedMonth);
        const days = data?.vabDays || 0;
        const rate = data?.dailyDeduction !== undefined ? data.dailyDeduction : getLatestDailyDeduction(user, selectedMonth);
        const incomeLoss = days * rate;
        const theoreticalIncome = actualIncome + incomeLoss;
    
        return { ...user, actualIncome, incomeLoss, theoreticalIncome };
    });

    const totalTheoreticalIncome = userCalculations.reduce((sum, u) => sum + u.theoreticalIncome, 0);

    const dist = userCalculations.map(user => {
        const contributionShare = totalTheoreticalIncome > 0 ? user.theoreticalIncome / totalTheoreticalIncome : 0;
        const returnAmount = Math.max(0, surplus * contributionShare);
        return { ...user, returnAmount, contributionShare };
    });

    const totalDist = dist.reduce((sum, d) => sum + d.returnAmount, 0);

    return { distribution: dist, totalDistributed: totalDist };
  }, [users, selectedMonth, surplus]);

  // Balance Calculations
  // Note: This calculation mixes actual income with BUDGETED fixed costs.
  // Ideally, for "Current Account Balance", we should use actuals, but the request focuses on the Waterfall (Budget) flow.
  // We keep this calculation consistent with the waterfall figures derived above.
  const currentAccountBalance = totalActualIncome - totalFixedForBalance - totalDailySoFar;
  const balanceAfterTransfers = currentAccountBalance - totalDistributed;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      {/* HEADER: FLOW SUMMARY */}
      <div className="text-center space-y-2 py-4">
        <div className="inline-block px-4 py-1 rounded-full bg-slate-800 text-slate-400 text-xs font-mono uppercase tracking-widest">
            Kvar till nöje/fördelning
        </div>
        <div className="flex items-end justify-center gap-2">
            <span className="text-5xl font-bold text-white tracking-tighter">{formatMoney(surplus)}</span>
        </div>
      </div>

      {/* WATERFALL VISUALIZATION */}
      <div className="relative space-y-1">
        
        {/* Step 1: Income & Gauge */}
        <div className="bg-emerald-600 rounded-xl p-4 text-white relative z-10 shadow-lg shadow-emerald-900/20 overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
                <Landmark className="w-32 h-32" />
            </div>
            <div className="flex justify-between items-center relative z-10">
                <div>
                    <div className="text-xs text-emerald-200 uppercase font-bold tracking-wider mb-1">Total Inkomst</div>
                    <div className="text-3xl font-bold font-mono">{formatMoney(totalActualIncome)}</div>
                    <div className="text-sm opacity-80 mt-1">Lön + Bidrag + Ersättningar</div>
                </div>
                <div className="bg-emerald-800/50 rounded-xl p-2 backdrop-blur-sm border border-emerald-500/30">
                    <SavingsGauge percentage={savingsRate} />
                </div>
            </div>
            {/* Connector */}
            <div className="absolute left-1/2 -bottom-4 w-0.5 h-4 bg-emerald-600/50"></div>
        </div>
        
        <div className="flex justify-center py-1"><ArrowDown className="w-4 h-4 text-slate-600" /></div>

        {/* Step 2: Consumption Expenses */}
        <div className="bg-rose-600 rounded-xl p-4 text-white relative z-10 shadow-lg shadow-rose-900/20">
            <div className="flex justify-between items-center">
                <span className="font-medium opacity-90">Räkningar & Mat (Konsumtion)</span>
                <span className="font-bold font-mono">-{formatMoney(effectiveConsumption)}</span>
            </div>
            {scenarioAdjustment !== 0 && (
                <div className="mt-2 text-xs bg-black/20 rounded px-2 py-1 text-rose-200 inline-block">
                    Scenario: {scenarioAdjustment > 0 ? '+' : ''}{formatMoney(scenarioAdjustment)}
                </div>
            )}
             {/* Connector */}
             <div className="absolute left-1/2 -bottom-4 w-0.5 h-4 bg-rose-600/50"></div>
        </div>

        <div className="flex justify-center py-1"><ArrowDown className="w-4 h-4 text-slate-600" /></div>

        {/* Step 3: Result BEFORE Savings (Grey/Neutral) */}
        <div className="bg-slate-700/80 rounded-xl p-3 text-slate-300 relative z-10 border border-slate-600">
             <div className="flex justify-between items-center text-sm">
                 <span className="uppercase tracking-wide font-bold text-xs">Resultat före sparande</span>
                 <span className="font-mono font-bold">{formatMoney(resultBeforeSavings)}</span>
             </div>
             {/* Connector */}
             <div className="absolute left-1/2 -bottom-4 w-0.5 h-4 bg-slate-600/50"></div>
        </div>

        <div className="flex justify-center py-1"><ArrowDown className="w-4 h-4 text-slate-600" /></div>

        {/* Step 4: Savings (Blue/Purple - Investment) */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-4 text-white relative z-10 shadow-lg shadow-blue-900/20 border-l-4 border-l-indigo-300">
             <div className="flex items-center gap-2 mb-1">
                 <PiggyBank className="w-5 h-5 text-indigo-200" />
                 <span className="font-bold text-indigo-100 uppercase tracking-wide text-xs">Investeringar & Sparande</span>
             </div>
             <div className="flex justify-between items-end">
                 <div className="text-xs text-blue-200 max-w-[70%]">
                     Drömmar, buffert och långsiktigt sparande (Budgeterat).
                 </div>
                 <span className="font-bold font-mono text-xl">-{formatMoney(savingsExpenses)}</span>
             </div>
             {/* Connector */}
             <div className="absolute left-1/2 -bottom-4 w-0.5 h-4 bg-indigo-600/50"></div>
        </div>

        <div className="flex justify-center py-1"><ArrowDown className="w-4 h-4 text-slate-600" /></div>

        {/* Step 5: Final Surplus Distribution */}
        <div className="bg-gradient-to-r from-amber-500/20 to-yellow-500/20 border border-amber-500/30 rounded-xl p-4 relative z-10">
            <div className="text-center mb-4">
                 <h3 className="text-amber-400 font-bold uppercase tracking-widest text-xs mb-1">Slutgiltigt Överskott</h3>
                 <div className="text-2xl font-bold text-white font-mono">{formatMoney(surplus)}</div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                {distribution.map(d => (
                    <Card key={d.id} className="border-t-4 border-t-emerald-400 bg-slate-800/90">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-xl">{d.avatar}</span>
                            <span className="font-bold text-sm">{d.name}</span>
                        </div>
                        <div className="text-xl font-bold text-white mb-1">
                            {formatMoney(d.returnAmount)}
                        </div>
                        <div className="text-[10px] text-slate-500 uppercase tracking-wide mt-1">
                            Andel: {Math.round(d.contributionShare * 100)}%
                        </div>
                        {d.incomeLoss > 0 && (
                            <div className="mt-2 text-[10px] text-rose-300 bg-rose-500/10 px-1.5 py-0.5 rounded inline-block border border-rose-500/20">
                                Inkl. kompensation
                            </div>
                        )}
                    </Card>
                ))}
            </div>
        </div>

      </div>

      {/* BALANCES SECTION */}
      <div className="grid gap-4 pt-4">
        {/* INTERMEDIATE CALCULATION: CURRENT BALANCE */}
        <div className="bg-blue-900/30 rounded-xl p-4 text-slate-300 border border-blue-500/20">
             <div className="flex items-center gap-2 mb-2">
                 <Landmark className="w-4 h-4 text-blue-400" />
                 <span className="text-xs font-bold text-blue-200 uppercase tracking-wide">Saldo på överföringskonto (Just Nu)</span>
             </div>
             <div className="flex justify-between items-end">
                 <div className="text-[10px] text-slate-400 max-w-[60%]">
                     Inkomst minus alla budgeterade fasta utgifter och upplupna dagliga utgifter fram till idag.
                 </div>
                 <span className="font-bold font-mono text-lg text-blue-100">{formatMoney(currentAccountBalance)}</span>
             </div>
        </div>

        {/* FINAL CALCULATION: REMAINING FOR TRANSFERS */}
        <div className="bg-slate-800 rounded-xl p-4 text-slate-300 border border-slate-600">
             <div className="flex items-center gap-2 mb-2">
                 <Calculator className="w-4 h-4 text-emerald-400" />
                 <span className="text-xs font-bold text-slate-200 uppercase tracking-wide">Kvar på kontot efter utdelning</span>
             </div>
             <div className="flex justify-between items-end">
                 <div className="text-[10px] text-slate-400 max-w-[60%]">
                     Detta belopp ska finnas kvar efter att fickpengarna delats ut för att täcka resten av månaden.
                 </div>
                 <span className={cn("font-bold font-mono text-lg", balanceAfterTransfers < 0 ? "text-red-400" : "text-emerald-400")}>
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

export const DashboardView: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'waterfall' | 'stats'>('waterfall');

    return (
        <div className="space-y-6 pb-24">
             {/* Header */}
            <div className="flex flex-col gap-4">
                <header>
                    <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">Översikt</h1>
                    <p className="text-slate-400">Totalbild av er ekonomi.</p>
                </header>

                <div className="bg-slate-800 p-1 rounded-xl flex gap-1 shadow-lg border border-slate-700">
                    <button 
                        onClick={() => setActiveTab('waterfall')}
                        className={cn(
                            "flex-1 py-3 px-4 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all",
                            activeTab === 'waterfall' ? "bg-blue-600 text-white shadow-md" : "text-slate-400 hover:text-white hover:bg-slate-700"
                        )}
                    >
                        <LayoutGrid size={16} />
                        Kassaflöde (Vattenfall)
                    </button>
                    <button 
                        onClick={() => setActiveTab('stats')}
                        className={cn(
                            "flex-1 py-3 px-4 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all",
                            activeTab === 'stats' ? "bg-indigo-600 text-white shadow-md" : "text-slate-400 hover:text-white hover:bg-slate-700"
                        )}
                    >
                        <BarChart3 size={16} />
                        Statistik & Trender
                    </button>
                </div>
            </div>

            {activeTab === 'waterfall' ? <WaterfallOverview /> : <StatsView />}
        </div>
    );
};
