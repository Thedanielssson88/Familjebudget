
import React, { useState, useMemo } from 'react';
import { useApp } from '../store';
import { 
  calculateDailyBucketCost, 
  calculateGoalBucketCost, 
  formatMoney, 
  getEffectiveBudgetGroupData, 
  getEffectiveSubCategoryBudget, 
  getLatestDailyDeduction, 
  getTotalFamilyIncome, 
  getUserIncome, 
  calculateReimbursementMap, 
  getEffectiveAmount, 
  getBudgetInterval, 
  getEffectiveBucketData, 
  isBucketActiveInMonth 
} from '../utils';
import { Card, cn, Modal, Button } from '../components/components';
import { ArrowDown, Sliders, Landmark, Calculator, PiggyBank, LayoutGrid, BarChart3, Receipt, ChevronRight, Info } from 'lucide-react';
import { StatsView } from './StatsView';
import { format, parseISO, isBefore, isValid, isAfter, eachDayOfInterval, getDay, startOfDay, addDays } from 'date-fns';

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
  const { users, buckets, selectedMonth, settings, budgetGroups, subCategories, budgetTemplates, monthConfigs, transactions, accounts } = useApp();
  const [scenarioAdjustment, setScenarioAdjustment] = useState(0);
  const [drillDown, setDrillDown] = useState<{ title: string, items: { name: string, amount: number, type: string }[], total: number } | null>(null);

  const reimbursementMap = useMemo(() => calculateReimbursementMap(transactions), [transactions]);

  // 1. Calculate Actual Inflow
  const totalActualIncome = useMemo(() => 
    getTotalFamilyIncome(users, selectedMonth), 
  [users, selectedMonth]);

  // 2. Calculate BUDGETED Outflow
  const budgetFlow = useMemo(() => {
    let consumption = 0;
    let savings = 0;
    
    const consumptionItems: { name: string, amount: number, type: string }[] = [];
    const savingsItems: { name: string, amount: number, type: string }[] = [];

    const { start, end } = getBudgetInterval(selectedMonth, settings.payday);

    const classifyAndAdd = (amount: number, name: string, type: string, isGroupSavings: boolean, isItemSavings: boolean) => {
        if (amount <= 0) return;
        if (isGroupSavings || isItemSavings) {
            savings += amount;
            savingsItems.push({ name, amount, type });
        } else {
            consumption += amount;
            consumptionItems.push({ name, amount, type });
        }
    };

    const assignedBucketIds = new Set<string>();
    const groupToBuckets = new Map<string, string[]>();

    budgetGroups.forEach(g => groupToBuckets.set(g.id, []));
    buckets.forEach(b => {
        if (b.budgetGroupId) {
            const list = groupToBuckets.get(b.budgetGroupId);
            if (list) {
                list.push(b.id);
                assignedBucketIds.add(b.id);
            }
        }
    });

    budgetGroups.forEach(group => {
        if (group.linkedBucketIds) {
            group.linkedBucketIds.forEach(bid => {
                if (!assignedBucketIds.has(bid)) {
                    groupToBuckets.get(group.id)?.push(bid);
                    assignedBucketIds.add(bid);
                }
            });
        }
    });

    const catchAllGroup = budgetGroups.find(g => g.isCatchAll);
    if (catchAllGroup) {
        buckets.forEach(b => {
            if (!assignedBucketIds.has(b.id)) {
                groupToBuckets.get(catchAllGroup.id)?.push(b.id);
            }
        });
    }

    budgetGroups.forEach(group => {
        const { data: explicitData } = getEffectiveBudgetGroupData(group, selectedMonth, budgetTemplates, monthConfigs);
        const manualLimit = explicitData && !explicitData.isExplicitlyDeleted ? explicitData.limit : 0;
        const isGroupSavings = group.forecastType === 'SAVINGS';

        let groupChildrenSum = 0;

        const groupSubs = subCategories.filter(s => s.budgetGroupId === group.id);
        groupSubs.forEach(sub => {
            const subBudget = getEffectiveSubCategoryBudget(sub, selectedMonth, budgetTemplates, monthConfigs);
            if (subBudget > 0) {
                groupChildrenSum += subBudget;
                classifyAndAdd(subBudget, sub.name, 'SUB', isGroupSavings, !!sub.isSavings);
            }
        });

        const groupBucketIds = groupToBuckets.get(group.id) || [];
        buckets.filter(b => groupBucketIds.includes(b.id)).forEach(b => {
            let cost = 0;

            if (b.type === 'FIXED') {
                const { data } = getEffectiveBucketData(b, selectedMonth, budgetTemplates, monthConfigs);
                cost = data ? data.amount : 0;
            } else if (b.type === 'DAILY') {
                const { data } = getEffectiveBucketData(b, selectedMonth, budgetTemplates, monthConfigs);
                if (data) {
                    const days = eachDayOfInterval({ start, end });
                    const count = days.filter(day => data.activeDays.includes(getDay(day))).length;
                    cost = count * data.dailyAmount;
                }
            } else if (b.type === 'GOAL') {
                if (b.paymentSource === 'INCOME') {
                    cost = calculateGoalBucketCost(b, selectedMonth);
                }
            }

            if (cost > 0) {
                groupChildrenSum += cost;
                classifyAndAdd(cost, b.name, 'BUCKET', isGroupSavings, !!b.isSavings);
            }
        });

        const unallocated = Math.max(0, manualLimit - groupChildrenSum);
        if (unallocated > 0) {
            classifyAndAdd(unallocated, `Buffert: ${group.name}`, 'BUFFER', isGroupSavings, false);
        }
    });

    return { 
        consumptionExpenses: consumption, 
        savingsExpenses: savings, 
        consumptionItems: consumptionItems.sort((a,b) => b.amount - a.amount),
        savingsItems: savingsItems.sort((a,b) => b.amount - a.amount)
    };
  }, [buckets, budgetGroups, subCategories, selectedMonth, settings.payday, budgetTemplates, monthConfigs]);

  const { consumptionExpenses, savingsExpenses, consumptionItems, savingsItems } = budgetFlow;

  const effectiveConsumption = consumptionExpenses + scenarioAdjustment;
  const surplus = totalActualIncome - (effectiveConsumption + savingsExpenses);
  const resultBeforeSavings = totalActualIncome - effectiveConsumption;
  const savingsRate = totalActualIncome > 0 ? (savingsExpenses / totalActualIncome) * 100 : 0;

  const { distribution } = useMemo(() => {
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

    return { distribution: dist };
  }, [users, selectedMonth, surplus]);

  // CALCULATION FOR REMAINING DAILY BUDGET
  // "beräknas som Dagliga budgetposter... från imorgon fram till och med dagen innan löning"
  const dailyRemainingNeeded = useMemo(() => {
    let total = 0;
    const { end: intervalEnd } = getBudgetInterval(selectedMonth, settings.payday);
    const todayRef = startOfDay(new Date());
    const tomorrow = addDays(todayRef, 1);

    buckets.forEach(b => {
        if (b.type === 'DAILY') {
            const { data } = getEffectiveBucketData(b, selectedMonth, budgetTemplates, monthConfigs);
            if (data && !data.isExplicitlyDeleted) {
                const { start: intervalStart } = getBudgetInterval(selectedMonth, settings.payday);
                
                // Range for calculation is tomorrow -> intervalEnd (which is day before next payday)
                const calcStart = isAfter(tomorrow, intervalStart) ? tomorrow : intervalStart;
                
                if (!isAfter(calcStart, intervalEnd)) {
                    const days = eachDayOfInterval({ start: calcStart, end: intervalEnd });
                    const count = days.filter(d => data.activeDays.includes(getDay(d))).length;
                    total += count * data.dailyAmount;
                }
            }
        }
    });
    return total;
  }, [buckets, selectedMonth, settings.payday, budgetTemplates, monthConfigs]);

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
            <div className="absolute left-1/2 -bottom-4 w-0.5 h-4 bg-emerald-600/50"></div>
        </div>
        
        <div className="flex justify-center py-1"><ArrowDown className="w-4 h-4 text-slate-600" /></div>

        {/* Step 2: Consumption Expenses */}
        <div 
            onClick={() => setDrillDown({ title: 'Räkningar & Mat (Budget)', items: consumptionItems, total: consumptionExpenses })}
            className="bg-rose-600 rounded-xl p-4 text-white relative z-10 shadow-lg shadow-rose-900/20 cursor-pointer hover:brightness-110 active:scale-[0.98] transition-all group"
        >
            <div className="flex justify-between items-center">
                <div className="flex flex-col">
                    <span className="font-medium opacity-90 flex items-center gap-1.5">
                        Räkningar & Mat (Konsumtion) <ChevronRight size={14} className="opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                    </span>
                </div>
                <span className="font-bold font-mono text-xl">-{formatMoney(effectiveConsumption)}</span>
            </div>
            {scenarioAdjustment !== 0 && (
                <div className="mt-2 text-xs bg-black/20 rounded px-2 py-1 text-rose-200 inline-block">
                    Scenario: {scenarioAdjustment > 0 ? '+' : ''}{formatMoney(scenarioAdjustment)}
                </div>
            )}
             <div className="absolute left-1/2 -bottom-4 w-0.5 h-4 bg-rose-600/50"></div>
        </div>

        <div className="flex justify-center py-1"><ArrowDown className="w-4 h-4 text-slate-600" /></div>

        {/* Step 3: Result BEFORE Savings */}
        <div className="bg-slate-700/80 rounded-xl p-3 text-slate-300 relative z-10 border border-slate-600">
             <div className="flex justify-between items-center text-sm">
                 <span className="uppercase tracking-wide font-bold text-xs">Resultat före sparande</span>
                 <span className="font-mono font-bold">{formatMoney(resultBeforeSavings)}</span>
             </div>
             <div className="absolute left-1/2 -bottom-4 w-0.5 h-4 bg-slate-600/50"></div>
        </div>

        <div className="flex justify-center py-1"><ArrowDown className="w-4 h-4 text-slate-600" /></div>

        {/* Step 4: Savings */}
        <div 
            onClick={() => setDrillDown({ title: 'Investeringar & Sparande (Budget)', items: savingsItems, total: savingsExpenses })}
            className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-4 text-white relative z-10 shadow-lg shadow-blue-900/20 border-l-4 border-l-indigo-300 cursor-pointer hover:brightness-110 active:scale-[0.98] transition-all group"
        >
             <div className="flex items-center justify-between mb-1">
                 <div className="flex items-center gap-2">
                    <PiggyBank className="w-5 h-5 text-indigo-200" />
                    <span className="font-bold text-indigo-100 uppercase tracking-wide text-xs flex items-center gap-1.5">
                        Investeringar & Sparande <ChevronRight size={14} className="opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                    </span>
                 </div>
                 <span className="font-bold font-mono text-xl">-{formatMoney(savingsExpenses)}</span>
             </div>
             <div className="text-xs text-blue-200 max-w-[70%]">
                 Budgeterad avsättning från lön till sparande och mål.
             </div>
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
        <div className="bg-slate-800 rounded-xl p-6 text-slate-300 border border-slate-700 shadow-xl">
             <div className="flex items-center gap-2 mb-3">
                 <div className="p-2 bg-indigo-500/20 rounded-lg">
                    <Calculator className="w-5 h-5 text-indigo-400" />
                 </div>
                 <span className="text-xs font-bold text-slate-200 uppercase tracking-widest">Kvar på konto efter utdelning</span>
             </div>
             <div className="flex justify-between items-end">
                 <div className="text-xs text-slate-400 max-w-[65%] leading-relaxed">
                     Detta belopp reserveras för att täcka budgeterade dagliga rörliga kostnader från imorgon fram till nästa lön.
                 </div>
                 <div className="text-right">
                    <div className="text-3xl font-bold font-mono text-white">
                        {formatMoney(dailyRemainingNeeded)}
                    </div>
                    <div className="text-[9px] text-slate-500 uppercase font-bold tracking-tighter mt-1 flex items-center justify-end gap-1">
                        <Info size={10}/> Beräknat behov
                    </div>
                 </div>
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

      {/* DRILL DOWN MODAL */}
      <Modal isOpen={!!drillDown} onClose={() => setDrillDown(null)} title={drillDown?.title || 'Detaljer'}>
          <div className="space-y-4">
              <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex justify-between items-center shadow-sm">
                  <div className="flex items-center gap-2 text-blue-400">
                      <Receipt size={18} />
                      <span className="text-sm font-bold uppercase tracking-wider">Total Budget</span>
                  </div>
                  <span className="text-2xl font-bold font-mono text-white">
                      {formatMoney(drillDown?.total || 0)}
                  </span>
              </div>
              <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1 no-scrollbar">
                  <p className="text-xs text-slate-500 uppercase font-bold tracking-wider px-1">Sammansättning</p>
                  {drillDown?.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center p-3 bg-slate-900/50 border border-slate-800 rounded-lg">
                          <div className="flex items-center gap-2 min-w-0">
                              <span className="text-white font-medium text-sm truncate">{item.name}</span>
                              {item.type === 'BUCKET' && <span className="text-[9px] bg-indigo-900/50 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-900 shrink-0">Fast/Mål/Daglig</span>}
                              {item.type === 'BUFFER' && <span className="text-[9px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded border border-slate-600 shrink-0">Buffert</span>}
                          </div>
                          <span className="font-mono font-bold text-white shrink-0 ml-2">{formatMoney(item.amount)}</span>
                      </div>
                  ))}
                  {drillDown?.items.length === 0 && (
                      <div className="text-center py-8 text-slate-500 italic">Inga budgeterade poster.</div>
                  )}
              </div>
              <div className="mt-2 flex justify-end">
                  <Button variant="secondary" onClick={() => setDrillDown(null)} className="w-full">Stäng</Button>
              </div>
          </div>
      </Modal>

    </div>
  );
};

export const DashboardView: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'waterfall' | 'stats'>('stats');

    return (
        <div className="space-y-6 pb-24">
            <div className="flex flex-col gap-4">
                <header>
                    <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">Översikt</h1>
                    <p className="text-slate-400">Totalbild av er ekonomi.</p>
                </header>

                <div className="bg-slate-800 p-1 rounded-xl flex gap-1 shadow-lg border border-slate-700">
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
                </div>
            </div>

            {activeTab === 'waterfall' ? <WaterfallOverview /> : <StatsView />}
        </div>
    );
};
