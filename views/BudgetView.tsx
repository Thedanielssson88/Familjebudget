
import React, { useState, useMemo } from 'react';
import { useApp } from '../store';
import { OperatingBudgetView } from './OperatingBudgetView';
import { IncomeView } from './IncomeView';
import { getBudgetInterval, calculateGoalBucketCost, formatMoney, getEffectiveBucketData, getEffectiveBudgetGroupData, getEffectiveSubCategoryBudget } from '../utils';
import { cn, Card, Modal, Button } from '../components/components';
import { Wallet, ArrowRightLeft, PieChart, Check, AlertTriangle, CalendarRange, ArrowRight, ChevronRight, X } from 'lucide-react';
import { useBudgetActuals } from '../hooks/useBudgetActuals';
import { BudgetProgressBar } from '../components/BudgetProgressBar';
import { BudgetPlanningView } from './BudgetPlanningView';
import { SubCategory, Bucket } from '../types';
import { eachDayOfInterval, getDay } from 'date-fns';

export const BudgetView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'income' | 'transfers' | 'operating' | 'planning'>('operating');

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
                  Flöde
              </button>
              <button 
                onClick={() => setActiveTab('planning')}
                className={cn(
                    "flex-1 py-3 px-4 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all whitespace-nowrap",
                    activeTab === 'planning' ? "bg-purple-600 text-white shadow-md" : "text-slate-400 hover:text-white hover:bg-slate-700"
                )}
              >
                  <CalendarRange size={16} />
                  Planering
              </button>
          </div>
      </div>

      {/* VIEW CONTENT */}
      <div className="min-h-[400px]">
          {activeTab === 'income' ? (
              <IncomeView />
          ) : activeTab === 'transfers' ? (
              <TransfersViewContent />
          ) : activeTab === 'planning' ? (
              <BudgetPlanningView />
          ) : (
              <OperatingBudgetView />
          )}
      </div>
    </div>
  );
};

// Internal type for drill-down items
type NeedItem = {
    id: string;
    type: 'SUB' | 'BUCKET' | 'BUFFER';
    name: string;
    categoryLabel: string; // e.g. "Boende > Hyra" or "Fast Post"
    amount: number;
    originalObj: SubCategory | Bucket | null; // Null for Buffer
};

const TransfersViewContent: React.FC = () => {
  const { accounts, buckets, budgetGroups, subCategories, mainCategories, selectedMonth, settings, budgetTemplates, monthConfigs, updateSubCategory, updateBucket } = useApp();
  
  // REAL-TIME ACTUALS HOOK
  const actuals = useBudgetActuals(selectedMonth, settings.payday);

  // UI STATE
  const [selectedNeedAccount, setSelectedNeedAccount] = useState<{ id: string, name: string, items: NeedItem[] } | null>(null);
  const [movingItem, setMovingItem] = useState<NeedItem | null>(null);

  // --- CALCULATE NEED PER ACCOUNT ---
  const { accountNeeds, unallocatedNeeds, detailedNeeds, unallocatedItems } = useMemo(() => {
      const needs: Record<string, number> = {};
      const details: Record<string, NeedItem[]> = {};
      let unallocatedSum = 0;
      const unallocatedList: NeedItem[] = [];
      const processedBucketIds = new Set<string>(); // Prevent double counting of buckets

      // Helper to add to details
      const addDetail = (accId: string | undefined, item: NeedItem) => {
          if (accId) {
              if (!details[accId]) details[accId] = [];
              details[accId].push(item);
          } else {
              unallocatedList.push(item);
          }
      };

      // Iterate ONLY over Budget Groups (The "Drift" structure).
      budgetGroups.forEach(group => {
          
          // 1. Calculate needs from Subcategories
          // Subcategories have a 1:1 relationship with groups via budgetGroupId, so no double counting risk here.
          const groupSubs = subCategories.filter(s => s.budgetGroupId === group.id);
          let sumSubBudgets = 0;

          groupSubs.forEach(sub => {
              const budget = getEffectiveSubCategoryBudget(sub, selectedMonth, budgetTemplates, monthConfigs);
              if (budget > 0) {
                  sumSubBudgets += budget;
                  // Priority: Sub Account -> Group Default Account -> Unallocated
                  const targetAcc = sub.accountId || group.defaultAccountId;
                  
                  if (targetAcc) {
                      needs[targetAcc] = (needs[targetAcc] || 0) + budget;
                  } else {
                      unallocatedSum += budget;
                  }

                  const mainCatName = mainCategories.find(m => m.id === sub.mainCategoryId)?.name || 'Okänd';
                  addDetail(targetAcc, {
                      id: sub.id,
                      type: 'SUB',
                      name: sub.name,
                      categoryLabel: `${mainCatName} / ${group.name}`,
                      amount: budget,
                      originalObj: sub
                  });
              }
          });

          // Handle "Manual Group Limit" / Buffer
          const { data: explicitData } = getEffectiveBudgetGroupData(group, selectedMonth, budgetTemplates, monthConfigs);
          const groupTotalLimit = explicitData ? explicitData.limit : 0;
          
          if (groupTotalLimit > sumSubBudgets) {
              const buffer = groupTotalLimit - sumSubBudgets;
              if (group.defaultAccountId) {
                  needs[group.defaultAccountId] = (needs[group.defaultAccountId] || 0) + buffer;
              } else {
                  unallocatedSum += buffer;
              }
              addDetail(group.defaultAccountId, {
                  id: `buffer-${group.id}`,
                  type: 'BUFFER',
                  name: 'Buffert / Ospecificerat',
                  categoryLabel: group.name,
                  amount: buffer,
                  originalObj: null
              });
          }

          // 2. Linked Buckets (Fixed costs/Goals linked to this group)
          const groupBuckets = buckets.filter(b => {
              // Strict Check: Only process if it belongs to this group.
              // If bucket has an explicit budgetGroupId, it MUST match.
              if (b.budgetGroupId) {
                  return b.budgetGroupId === group.id;
              }
              // Legacy Fallback: If bucket has NO group ID, check the group's legacy linked list
              return group.linkedBucketIds && group.linkedBucketIds.includes(b.id);
          });

          groupBuckets.forEach(bucket => {
              if (processedBucketIds.has(bucket.id)) return; // Already processed by another group (prioritized)

              let cost = 0;
              if (bucket.type === 'GOAL' && bucket.paymentSource === 'BALANCE') {
                  cost = 0; 
              } else {
                  if (bucket.type === 'FIXED') {
                      const { data } = getEffectiveBucketData(bucket, selectedMonth, budgetTemplates, monthConfigs);
                      cost = data ? data.amount : 0;
                  }
                  else if (bucket.type === 'DAILY') {
                      // Calculate accurately using active template/overrides
                      const { data } = getEffectiveBucketData(bucket, selectedMonth, budgetTemplates, monthConfigs);
                      if (data) {
                          const { start, end } = getBudgetInterval(selectedMonth, settings.payday);
                          const days = eachDayOfInterval({ start, end });
                          let count = 0;
                          days.forEach(day => {
                              if (data.activeDays.includes(getDay(day))) count++;
                          });
                          cost = count * data.dailyAmount;
                      }
                  }
                  else if (bucket.type === 'GOAL') {
                      cost = calculateGoalBucketCost(bucket, selectedMonth);
                  }
              }

              if (cost > 0) {
                  // PRIORITY: Bucket Specific Account -> Group Default Account -> Unallocated
                  const targetAcc = bucket.accountId || group.defaultAccountId;
                  
                  if (targetAcc) {
                      needs[targetAcc] = (needs[targetAcc] || 0) + cost;
                  } else {
                      unallocatedSum += cost;
                  }

                  let typeLabel = bucket.type === 'FIXED' ? 'Fast Post' : (bucket.type === 'DAILY' ? 'Rörlig Post' : 'Mål');
                  addDetail(targetAcc, {
                      id: bucket.id,
                      type: 'BUCKET',
                      name: bucket.name,
                      categoryLabel: `${typeLabel} (${group.name})`,
                      amount: cost,
                      originalObj: bucket
                  });
              }
              processedBucketIds.add(bucket.id);
          });
      });

      return { 
          accountNeeds: needs, 
          unallocatedNeeds: unallocatedSum, 
          detailedNeeds: details,
          unallocatedItems: unallocatedList
      };
  }, [budgetGroups, subCategories, buckets, selectedMonth, settings.payday, budgetTemplates, monthConfigs, mainCategories]);

  const handleOpenDetail = (accountId: string, name: string) => {
      const items = accountId === 'UNALLOCATED' ? unallocatedItems : detailedNeeds[accountId] || [];
      // Sort items by amount desc
      items.sort((a,b) => b.amount - a.amount);
      setSelectedNeedAccount({ id: accountId, name, items });
  };

  const handleMoveItem = async (targetAccountId: string) => {
      if (!movingItem) return;

      if (movingItem.type === 'SUB' && movingItem.originalObj) {
          const sub = movingItem.originalObj as SubCategory;
          await updateSubCategory({ ...sub, accountId: targetAccountId });
      } else if (movingItem.type === 'BUCKET' && movingItem.originalObj) {
          const bucket = movingItem.originalObj as Bucket;
          await updateBucket({ ...bucket, accountId: targetAccountId });
      } else if (movingItem.type === 'BUFFER') {
          alert("Buffert/Ospecificerat kan inte flyttas direkt. Ändra kontot för hela Budgetgruppen istället.");
          return;
      }

      setMovingItem(null);
      // Close the main modal as data will refresh
      setSelectedNeedAccount(null);
  };

  return (
    <div className="space-y-6 animate-in fade-in">
        
      <div className="bg-blue-900/20 border border-blue-500/30 p-4 rounded-xl text-sm text-blue-200 mb-6 flex gap-3 items-start">
         <div className="p-2 bg-blue-500/20 rounded-lg">
             <ArrowRightLeft size={18} />
         </div>
         <div>
             <h3 className="font-bold flex items-center gap-2 mb-1">Kassaflöde / Överföringsbehov</h3>
             <p className="opacity-80">Här ser du hur mycket som behöver finnas på respektive konto baserat på din totala Driftbudget.</p>
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
                                  <div 
                                    className="text-xs text-slate-400 flex items-center gap-1 cursor-pointer hover:text-blue-400 transition-colors group"
                                    onClick={() => handleOpenDetail(account.id, account.name)}
                                  >
                                      Behov: <span className="text-white font-mono font-bold group-hover:text-blue-400 group-hover:underline">{formatMoney(needed)}</span>
                                      <ChevronRight size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                                  </div>
                              </div>
                          </div>
                          <div className="text-right">
                              <div className="text-[10px] text-slate-500 uppercase font-bold">Överfört</div>
                              <div className={cn("font-mono font-bold text-lg", transfersIn >= needed ? "text-emerald-400" : "text-white")}>
                                  {formatMoney(transfersIn)}
                              </div>
                          </div>
                      </div>
                      
                      <BudgetProgressBar 
                        spent={transfersIn} 
                        total={needed} 
                        label="Täckt av överföringar" 
                        variant="funding"
                      />
                      
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
              <div 
                className="bg-rose-950/20 border border-rose-500/30 rounded-xl p-4 shadow-lg animate-pulse cursor-pointer hover:bg-rose-900/30 transition-colors"
                onClick={() => handleOpenDetail('UNALLOCATED', 'Okopplade Poster')}
              >
                  <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 bg-rose-500/20 rounded-lg text-rose-400">
                          <AlertTriangle size={20} />
                      </div>
                      <div>
                          <h3 className="font-bold text-rose-200 text-lg flex items-center gap-2">
                              Saknar Konto <ChevronRight size={16} className="opacity-50"/>
                          </h3>
                          <div className="text-xs text-rose-300">Budgeterat men ej kopplat till konto</div>
                      </div>
                      <div className="ml-auto text-right">
                          <div className="text-[10px] text-rose-400 uppercase font-bold">Behov</div>
                          <div className="font-mono font-bold text-lg text-rose-200">{formatMoney(unallocatedNeeds)}</div>
                      </div>
                  </div>
                  <p className="text-xs text-rose-300/70 mt-2">
                      Tryck här för att se vilka poster som saknar konto och tilldela dem.
                  </p>
              </div>
          )}
      </div>

      {/* DRILL DOWN MODAL (DETAIL LIST) */}
      <Modal isOpen={!!selectedNeedAccount} onClose={() => setSelectedNeedAccount(null)} title={`Behov: ${selectedNeedAccount?.name}`}>
          <div className="space-y-4">
              <p className="text-sm text-slate-400">
                  Följande poster utgör överföringsbehovet för detta konto. Klicka på en rad för att flytta den till ett annat konto.
              </p>
              <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                  {selectedNeedAccount?.items.map(item => (
                      <div 
                        key={`${item.type}-${item.id}`}
                        onClick={() => item.type !== 'BUFFER' && setMovingItem(item)}
                        className={cn(
                            "flex justify-between items-center p-3 rounded-xl border transition-all",
                            item.type === 'BUFFER' 
                                ? "bg-slate-800/50 border-slate-700 opacity-70 cursor-not-allowed" 
                                : "bg-slate-800 border-slate-700 hover:bg-slate-700 cursor-pointer group"
                        )}
                      >
                          <div className="flex-1 min-w-0 pr-2">
                              <div className="font-bold text-white truncate flex items-center gap-2">
                                  {item.name}
                                  {item.type !== 'BUFFER' && <ArrowRight size={12} className="text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" />}
                              </div>
                              <div className="text-xs text-slate-500">{item.categoryLabel}</div>
                          </div>
                          <div className="font-mono font-bold text-white">
                              {formatMoney(item.amount)}
                          </div>
                      </div>
                  ))}
                  {selectedNeedAccount?.items.length === 0 && (
                      <div className="text-center py-8 text-slate-500 italic">Inga behov posterade.</div>
                  )}
              </div>
              <div className="pt-2 flex justify-end">
                  <Button variant="secondary" onClick={() => setSelectedNeedAccount(null)}>Stäng</Button>
              </div>
          </div>
      </Modal>

      {/* MOVE ITEM MODAL */}
      <Modal isOpen={!!movingItem} onClose={() => setMovingItem(null)} title="Flytta kostnad">
          <div className="space-y-4">
              <div className="bg-slate-800 p-3 rounded-lg border border-slate-700 mb-4">
                  <div className="text-xs text-slate-400 uppercase font-bold mb-1">Du flyttar</div>
                  <div className="font-bold text-white text-lg">{movingItem?.name}</div>
                  <div className="flex justify-between items-end">
                      <div className="text-sm text-slate-400">{movingItem?.categoryLabel}</div>
                      <div className="font-mono text-emerald-400 font-bold">{movingItem && formatMoney(movingItem.amount)}</div>
                  </div>
              </div>

              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider px-1">Välj nytt konto</p>
              <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                  {accounts.map(acc => (
                      <button
                        key={acc.id}
                        onClick={() => handleMoveItem(acc.id)}
                        className="w-full flex items-center gap-3 p-3 rounded-xl bg-slate-800 border border-slate-700 hover:bg-blue-600 hover:border-blue-500 hover:text-white transition-all group text-left"
                      >
                          <span className="text-2xl group-hover:scale-110 transition-transform">{acc.icon}</span>
                          <span className="font-bold text-sm">{acc.name}</span>
                          <ArrowRight size={16} className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                  ))}
              </div>
              <div className="pt-2 border-t border-slate-700">
                  <Button variant="secondary" onClick={() => setMovingItem(null)} className="w-full">Avbryt</Button>
              </div>
          </div>
      </Modal>

    </div>
  );
};
