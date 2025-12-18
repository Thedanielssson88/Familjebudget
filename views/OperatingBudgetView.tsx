
import React, { useMemo, useState } from 'react';
import { useApp } from '../store';
import { useBudgetMonth } from '../hooks/useBudgetMonth';
import { formatMoney, getEffectiveBudgetGroupData, getEffectiveSubCategoryBudget, calculateFixedBucketCost, calculateDailyBucketCost, calculateGoalBucketCost, calculateReimbursementMap, getEffectiveAmount, getSubCategoryAverage, generateId, getEffectiveBucketData, isBucketActiveInMonth, getBudgetInterval } from '../utils';
import { ChevronRight, ChevronDown, Check, AlertTriangle, Edit2, Plus, Trash2, Settings, ArrowRightLeft, Calendar, RefreshCw, Lock, Unlock, BarChart3, Wallet, PiggyBank, Target, Save, RotateCcw } from 'lucide-react';
import { BudgetProgressBar } from '../components/BudgetProgressBar';
import { cn, Button, Modal, Input } from '../components/components';
import { BudgetGroup, SubCategory, Bucket, BucketData, Transaction } from '../types';
import { parseISO, addMonths, format, eachDayOfInterval, getDay, isBefore, isAfter, isSameMonth, isValid } from 'date-fns';
import { EmojiPickerModal } from '../components/EmojiPicker';

const DREAM_IMAGES = [
  "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=2073&auto=format&fit=crop", 
  "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?q=80&w=2021&auto=format&fit=crop", 
  "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?q=80&w=2070&auto=format&fit=crop", 
  "https://images.unsplash.com/photo-1560518883-ce09059eeffa?q=80&w=1973&auto=format&fit=crop", 
  "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?q=80&w=2070&auto=format&fit=crop", 
  "https://images.unsplash.com/photo-1523275335684-37898b6baf30?q=80&w=1999&auto=format&fit=crop", 
  "https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=2070&auto=format&fit=crop",
];

interface DisplayBucket extends Bucket {
    cost: number;
    spent: number;
    transactions: Transaction[];
    displayMode: 'STANDARD' | 'SAVING' | 'SPENDING'; 
    displayName: string;
    isOverridden: boolean;
}

export const OperatingBudgetView: React.FC = () => {
  const { 
      selectedMonth, budgetGroups, subCategories, transactions, 
      buckets, accounts, settings, addBudgetGroup, updateBudgetGroup, 
      updateSubCategory, addBucket, updateBucket,
      budgetTemplates, monthConfigs, setBudgetLimit, toggleMonthLock, assignTemplateToMonth, clearBudgetOverride
  } = useApp();
  
  const { startStr, endStr, intervalLabel, start, end } = useBudgetMonth(selectedMonth);

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [iconPickerTarget, setIconPickerTarget] = useState<{ type: 'GROUP'|'SUB'|'BUCKET', id: string, name: string } | null>(null);
  
  // State for interactive editing
  const [editingItem, setEditingItem] = useState<{ type: 'GROUP' | 'SUB' | 'BUCKET', id: string, name: string, amount: number | BucketData, bucketType?: string } | null>(null);
  const [editAmount, setEditAmount] = useState('');
  
  // State for moving items
  const [movingSubCategory, setMovingSubCategory] = useState<SubCategory | null>(null);
  const [movingBucket, setMovingBucket] = useState<Bucket | null>(null);

  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [editingGroupObj, setEditingGroupObj] = useState<BudgetGroup | null>(null);
  const [editingLimit, setEditingLimit] = useState<number>(0);

  const [isBucketModalOpen, setIsBucketModalOpen] = useState(false);
  const [editingBucketObj, setEditingBucketObj] = useState<Bucket | null>(null);
  const [editingBucketData, setEditingBucketData] = useState<BucketData>({ amount: 0, dailyAmount: 0, activeDays: [] });
  const [showBucketDetails, setShowBucketDetails] = useState(false);

  const [isTemplatePickerOpen, setIsTemplatePickerOpen] = useState(false);
  const [drillDownData, setDrillDownData] = useState<{ title: string, transactions: Transaction[] } | null>(null);
  const [isTotalBreakdownOpen, setIsTotalBreakdownOpen] = useState(false);

  const reimbursementMap = useMemo(() => calculateReimbursementMap(transactions), [transactions]);

  const isMonthLocked = useMemo(() => {
      const config = monthConfigs.find(c => c.monthKey === selectedMonth);
      return config?.isLocked || false;
  }, [monthConfigs, selectedMonth]);

  const activeTemplateId = useMemo(() => {
      const config = monthConfigs.find(c => c.monthKey === selectedMonth);
      if (config?.templateId) return config.templateId;
      return budgetTemplates.find(t => t.isDefault)?.id || '';
  }, [selectedMonth, monthConfigs, budgetTemplates]);

  const activeTemplate = useMemo(() => budgetTemplates.find(t => t.id === activeTemplateId), [activeTemplateId, budgetTemplates]);

  const getSubCategoryTxs = (subId: string) => {
      return transactions.filter(t => 
          !t.isHidden && 
          t.categorySubId === subId && 
          !t.bucketId && 
          t.date >= startStr && 
          t.date <= endStr &&
          (t.type === 'EXPENSE' || (!t.type && t.amount < 0))
      );
  };

  const getBucketTxs = (bucketId: string) => {
      return transactions.filter(t => 
          !t.isHidden &&
          t.bucketId === bucketId &&
          t.date >= startStr &&
          t.date <= endStr &&
          (t.type === 'EXPENSE' || (!t.type && t.amount < 0))
      );
  };

  const data = useMemo(() => {
      let dreamsSavingTotal = 0;
      let dreamsSpendingTotal = 0;
      let savingsTotal = 0;
      let operationsTotal = 0;

      const config = monthConfigs.find(c => c.monthKey === selectedMonth);

      const groups = budgetGroups.map(group => {
          const isGroupSavings = group.forecastType === 'SAVINGS';

          const linkedSubs = subCategories.filter(s => s.budgetGroupId === group.id).map(sub => {
              const txs = getSubCategoryTxs(sub.id);
              const spent = txs.reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);
              const budget = getEffectiveSubCategoryBudget(sub, selectedMonth, budgetTemplates, monthConfigs);
              const isOverridden = config?.subCategoryOverrides?.[sub.id] !== undefined;

              if (isGroupSavings || sub.isSavings) savingsTotal += budget;
              else operationsTotal += budget;

              return {
                  ...sub,
                  spent,
                  transactions: txs,
                  avgSpend: getSubCategoryAverage(sub.id, selectedMonth, transactions, reimbursementMap),
                  budget,
                  isOverridden
              };
          });

          const subTotalBudget = linkedSubs.reduce((sum, s) => sum + s.budget, 0);
          const subTotalSpent = linkedSubs.reduce((sum, s) => sum + s.spent, 0);

          const assignedBucketIds = new Set<string>();
          const groupToBuckets = new Map<string, string[]>();
          budgetGroups.forEach(g => groupToBuckets.set(g.id, []));
          buckets.forEach(b => {
              if (b.budgetGroupId) {
                  const list = groupToBuckets.get(b.budgetGroupId);
                  if (list) { list.push(b.id); assignedBucketIds.add(b.id); }
              }
          });
          budgetGroups.forEach(g => {
              if (g.linkedBucketIds) {
                  g.linkedBucketIds.forEach(bid => { if (!assignedBucketIds.has(bid)) { groupToBuckets.get(g.id)?.push(bid); assignedBucketIds.add(bid); } });
              }
          });
          if (group.isCatchAll) {
              buckets.forEach(b => { if (!assignedBucketIds.has(b.id)) groupToBuckets.get(group.id)?.push(b.id); });
          }

          const groupBucketIds = groupToBuckets.get(group.id) || [];
          const displayBuckets: DisplayBucket[] = [];

          buckets.filter(b => groupBucketIds.includes(b.id)).forEach(b => {
              const txs = getBucketTxs(b.id);
              const spent = txs.reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);
              let isOverridden = false;
              
              if (b.type === 'GOAL') {
                  isOverridden = b.monthlyData[selectedMonth]?.amount !== undefined && b.monthlyData[selectedMonth]?.amount > 0;
                  let savingAmount = 0;
                  if (b.paymentSource === 'INCOME' && b.startSavingDate && b.targetDate) {
                      const current = parseISO(`${selectedMonth}-01`);
                      const startSave = parseISO(`${b.startSavingDate}-01`);
                      const target = parseISO(`${b.targetDate}-01`);
                      if (isValid(current) && isValid(startSave) && isValid(target)) {
                          if (!isBefore(current, startSave) && isBefore(current, target)) {
                              savingAmount = calculateGoalBucketCost(b, selectedMonth);
                          }
                      }
                  }

                  if (savingAmount > 0) {
                      dreamsSavingTotal += savingAmount;
                      displayBuckets.push({
                          ...b,
                          cost: savingAmount,
                          spent: 0,
                          transactions: [],
                          displayMode: 'SAVING',
                          displayName: `Spara: ${b.name}`,
                          isOverridden
                      });
                  }

                  let showSpending = false;
                  if (spent > 0) showSpending = true;
                  else if (b.targetDate && isSameMonth(parseISO(`${selectedMonth}-01`), parseISO(`${b.targetDate}-01`))) showSpending = true;
                  else if (b.eventStartDate && b.eventEndDate) {
                      const evtStart = parseISO(b.eventStartDate);
                      const evtEnd = parseISO(b.eventEndDate);
                      if (isValid(evtStart) && isValid(evtEnd) && !isAfter(start, evtEnd) && !isBefore(end, evtStart)) showSpending = true;
                  }

                  if (showSpending) {
                      const { start: bStart } = getBudgetInterval(selectedMonth, settings.payday);
                      const pastSpent = transactions
                        .filter(t => !t.isHidden && t.bucketId === b.id && t.date < format(bStart, 'yyyy-MM-dd') && (t.type === 'EXPENSE' || t.amount < 0))
                        .reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);
                      const cost = Math.max(0, b.targetAmount - pastSpent);
                      
                      if (cost > 0) {
                          dreamsSpendingTotal += cost;
                          displayBuckets.push({ ...b, cost, spent, transactions: txs, displayMode: 'SPENDING', displayName: b.name, isOverridden: false });
                      }
                  }
              } else {
                  isOverridden = config?.bucketOverrides?.[b.id] !== undefined;
                  let cost = 0;
                  if (b.type === 'FIXED') {
                      const { data: bData } = getEffectiveBucketData(b, selectedMonth, budgetTemplates, monthConfigs);
                      cost = bData ? bData.amount : 0;
                  } else if (b.type === 'DAILY') {
                      const { data: bData } = getEffectiveBucketData(b, selectedMonth, budgetTemplates, monthConfigs);
                      if (bData) {
                          const count = eachDayOfInterval({ start, end }).filter(d => bData.activeDays.includes(getDay(d))).length;
                          cost = count * bData.dailyAmount;
                      }
                  }

                  if (cost > 0 || spent > 0 || isBucketActiveInMonth(b, selectedMonth)) {
                      if (isGroupSavings || b.isSavings) savingsTotal += cost;
                      else operationsTotal += cost;
                      displayBuckets.push({ ...b, cost, spent, transactions: txs, displayMode: 'STANDARD', displayName: b.name, isOverridden });
                  }
              }
          });

          const bucketTotalCost = displayBuckets.reduce((sum, b) => sum + b.cost, 0);
          const { data: explicitData, templateName } = getEffectiveBudgetGroupData(group, selectedMonth, budgetTemplates, monthConfigs);
          const manualLimit = explicitData ? explicitData.limit : 0;
          const isOverridden = config?.groupOverrides?.[group.id] !== undefined;

          const calculatedTotal = subTotalBudget + bucketTotalCost;
          const totalBudget = Math.max(calculatedTotal, manualLimit);
          
          if (manualLimit > calculatedTotal) {
              const buffer = manualLimit - calculatedTotal;
              if (isGroupSavings) savingsTotal += buffer;
              else operationsTotal += buffer;
          }

          return {
              ...group,
              totalBudget,
              totalSpent: subTotalSpent + displayBuckets.reduce((s,b) => s + b.spent, 0),
              isAuto: linkedSubs.length > 0 || displayBuckets.length > 0,
              templateName,
              subs: linkedSubs,
              customPosts: displayBuckets,
              allTransactions: [...linkedSubs.flatMap(s => s.transactions), ...displayBuckets.flatMap(b => b.transactions)],
              isOverridden
          };
      });

      const totalIncome = transactions
        .filter(t => !t.isHidden && t.type === 'INCOME' && t.date >= startStr && t.date <= endStr)
        .reduce((sum, t) => sum + t.amount, 0);

      const totalBudget = operationsTotal + savingsTotal + dreamsSavingTotal + dreamsSpendingTotal;

      return { groups, totalBudget, totalSpent: groups.reduce((s,g) => s + g.totalSpent, 0), totalIncome, operationsTotal, savingsTotal, dreamsSavingTotal, dreamsSpendingTotal };
  }, [budgetGroups, subCategories, buckets, transactions, selectedMonth, settings.payday, startStr, endStr, reimbursementMap, budgetTemplates, monthConfigs, start, end]);

  const handleIconSelect = async (emoji: string) => {
      if (!iconPickerTarget) return;
      
      if (iconPickerTarget.type === 'GROUP') {
          const group = budgetGroups.find(g => g.id === iconPickerTarget.id);
          if (group) await updateBudgetGroup({ ...group, icon: emoji });
      } else if (iconPickerTarget.type === 'SUB') {
          const sub = subCategories.find(s => s.id === iconPickerTarget.id);
          if (sub) await updateSubCategory({ ...sub, icon: emoji });
      } else if (iconPickerTarget.type === 'BUCKET') {
          const bucket = buckets.find(b => b.id === iconPickerTarget.id);
          if (bucket) await updateBucket({ ...bucket, icon: emoji });
      }
      
      setIconPickerTarget(null);
  };

  const handleEdit = (type: 'GROUP' | 'SUB' | 'BUCKET', id: string, name: string, amount: number | BucketData, bucketType?: string) => {
    if (isMonthLocked) { alert("Månaden är låst."); return; }
    setEditingItem({ type, id, name, amount, bucketType });
    if (type === 'BUCKET' && typeof amount !== 'number') {
        const bd = amount as BucketData;
        const bucket = buckets.find(b => b.id === id);
        setEditAmount(bucket?.type === 'DAILY' ? bd.dailyAmount.toString() : bd.amount.toString());
    } else {
        setEditAmount(amount.toString());
    }
  };

  const saveBudget = async (mode: 'TEMPLATE' | 'OVERRIDE') => {
    if (!editingItem) return;
    const val = parseFloat(editAmount) || 0;
    
    // Check if it's a Goal Dream contribution - these only have "Confirm" logic (mode = 'OVERRIDE')
    if (editingItem.type === 'BUCKET' && editingItem.bucketType === 'GOAL') {
        const bucket = buckets.find(b => b.id === editingItem.id);
        if (bucket) {
            const nextData = { ...bucket.monthlyData };
            nextData[selectedMonth] = { ...(nextData[selectedMonth] || { dailyAmount: 0, activeDays: [] }), amount: val, isExplicitlyDeleted: false };
            await updateBucket({ ...bucket, monthlyData: nextData });
        }
        setEditingItem(null);
        return;
    }

    let finalAmount: number | BucketData = val;
    if (editingItem.type === 'BUCKET' && typeof editingItem.amount !== 'number') {
        const bucket = buckets.find(b => b.id === editingItem.id);
        const bd = { ...(editingItem.amount as BucketData) };
        if (bucket?.type === 'DAILY') bd.dailyAmount = val;
        else bd.amount = val;
        finalAmount = bd;
    }

    await setBudgetLimit(editingItem.type, editingItem.id, finalAmount, selectedMonth, mode);
    setEditingItem(null);
  };

  const handleReset = async (type: 'GROUP' | 'SUB' | 'BUCKET', id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const bucket = buckets.find(b => b.id === id);
      if (type === 'BUCKET' && bucket?.type === 'GOAL') {
          const nextData = { ...bucket.monthlyData };
          if (nextData[selectedMonth]) {
              const { amount, ...rest } = nextData[selectedMonth];
              if (Object.keys(rest).length === 0 || (Object.keys(rest).length === 1 && rest.isExplicitlyDeleted === false)) {
                  delete nextData[selectedMonth];
              } else {
                  nextData[selectedMonth] = { ...rest };
              }
          }
          await updateBucket({ ...bucket, monthlyData: nextData });
      } else {
          await clearBudgetOverride(type, id, selectedMonth);
      }
  };

  const toggleGroupExpand = (id: string) => {
      const next = new Set(expandedGroups);
      if (next.has(id)) next.delete(id); else next.add(id);
      setExpandedGroups(next);
  };

  const handleMoveSub = async (targetId: string) => {
    if (!movingSubCategory) return;
    await updateSubCategory({ ...movingSubCategory, budgetGroupId: targetId });
    setMovingSubCategory(null);
  };

  const handleMoveBucket = async (targetId: string) => {
    if (!movingBucket) return;
    await updateBucket({ ...movingBucket, budgetGroupId: targetId });
    setMovingBucket(null);
  };

  return (
    <div className="space-y-6 pb-24 animate-in slide-in-from-right duration-300">
      
      {/* HEADER STATS */}
      <div className="grid grid-cols-2 gap-4">
          <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Total Inkomst</div>
              <div className="text-2xl font-mono font-bold text-emerald-400">{formatMoney(data.totalIncome)}</div>
          </div>
          <div 
            onClick={() => setIsTotalBreakdownOpen(true)}
            className="bg-slate-800 p-4 rounded-2xl border border-slate-700 relative cursor-pointer group hover:bg-slate-750 transition-all"
          >
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 group-hover:text-blue-400 transition-colors flex items-center gap-1">
                  Total Budget <ChevronRight size={10} />
              </div>
              <div className="text-2xl font-mono font-bold text-blue-400">{formatMoney(data.totalBudget)}</div>
              
              <button 
                onClick={(e) => { e.stopPropagation(); toggleMonthLock(selectedMonth); }}
                className={cn(
                    "absolute top-4 right-4 p-2 rounded-lg transition-all",
                    isMonthLocked ? "bg-amber-500/20 text-amber-400" : "bg-slate-700/50 text-slate-400 hover:text-white"
                )}
              >
                  {isMonthLocked ? <Lock size={16} /> : <Unlock size={16} />}
              </button>
          </div>
      </div>

      {/* LIST OF GROUPS */}
      <div className="space-y-4">
          {data.groups.map(group => {
              const isExpanded = expandedGroups.has(group.id);
              const isOver = group.totalSpent > group.totalBudget && group.totalBudget > 0;
              return (
                  <div key={group.id} className={cn("bg-surface rounded-xl overflow-hidden border transition-all shadow-md", group.isCatchAll ? "border-dashed border-slate-600" : "border-slate-700")}>
                      <div className="p-4 cursor-pointer hover:bg-slate-800/80 transition-colors" onClick={() => toggleGroupExpand(group.id)}>
                          <div className="flex justify-between items-start mb-2">
                              <div className="flex items-center gap-3">
                                  {isExpanded ? <ChevronDown className="w-5 h-5 text-blue-400"/> : <ChevronRight className="w-5 h-5 text-slate-500"/>}
                                  <div className="bg-slate-700 p-2 rounded-xl text-2xl" onClick={(e) => { e.stopPropagation(); setIconPickerTarget({ type: 'GROUP', id: group.id, name: group.name }); }}>{group.icon}</div>
                                  <div>
                                      <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                          {group.name}
                                          {isOver && <AlertTriangle className="w-4 h-4 text-rose-500" />}
                                      </h3>
                                  </div>
                              </div>
                              <div className="text-right">
                                  <div 
                                    className={cn("font-mono font-bold text-lg flex items-center justify-end gap-2 transition-colors", group.isOverridden ? "text-yellow-400" : "text-white")}
                                    onClick={(e) => { e.stopPropagation(); handleEdit('GROUP', group.id, group.name, group.totalBudget); }}
                                  >
                                    {formatMoney(group.totalBudget)}
                                    {group.isOverridden && <button onClick={(e) => handleReset('GROUP', group.id, e)} className="p-1 hover:bg-slate-600 rounded text-slate-400 hover:text-white"><RotateCcw size={12} /></button>}
                                  </div>
                                  <div className="text-slate-500 text-xs hover:text-blue-400 hover:underline" onClick={(e) => { e.stopPropagation(); setDrillDownData({ title: group.name, transactions: group.allTransactions }); }}>Utfall: {formatMoney(group.totalSpent)}</div>
                              </div>
                          </div>
                          <BudgetProgressBar spent={group.totalSpent} total={group.totalBudget} />
                      </div>

                      {isExpanded && (
                          <div className="bg-slate-900/30 border-t border-slate-700/50 p-3 space-y-6 animate-in slide-in-from-top-2">
                              <div className="space-y-3">
                                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Kategorier</h4>
                                  {group.subs.map(sub => (
                                      <div key={sub.id} className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/50 flex justify-between items-center group/sub">
                                          <div className="flex items-center gap-3">
                                              <button className="p-2 bg-slate-900 rounded-lg shrink-0 text-slate-400 hover:bg-slate-700 transition-all active:scale-90" onClick={() => setIconPickerTarget({ type: 'SUB', id: sub.id, name: sub.name })}>{sub.icon || (sub.isSavings ? "💰" : "💳")}</button>
                                              <div>
                                                  <div className="font-medium text-base text-slate-200 flex items-center gap-2">
                                                    {sub.name}
                                                    <button onClick={() => setMovingSubCategory(sub)} className="opacity-0 group-hover/sub:opacity-100 p-1 text-slate-500 hover:text-blue-400 transition-all"><ArrowRightLeft size={12} /></button>
                                                  </div>
                                                  <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-2">
                                                      <span>Snitt: {formatMoney(sub.avgSpend)}</span>
                                                      <span>•</span>
                                                      <span className="cursor-pointer hover:underline" onClick={() => setDrillDownData({ title: sub.name, transactions: sub.transactions })}>Utfall: {formatMoney(sub.spent)}</span>
                                                  </div>
                                              </div>
                                          </div>
                                          <div className="text-right">
                                              <div 
                                                className={cn("text-2xl font-mono font-bold cursor-pointer transition-colors flex items-center justify-end gap-2", sub.isOverridden ? "text-yellow-400" : "text-white hover:text-blue-400")} 
                                                onClick={() => handleEdit('SUB', sub.id, sub.name, sub.budget)}
                                              >
                                                {formatMoney(sub.budget)}
                                                {sub.isOverridden && <button onClick={(e) => handleReset('SUB', sub.id, e)} className="p-1 hover:bg-slate-600 rounded text-slate-400 hover:text-white"><RotateCcw size={12} /></button>}
                                              </div>
                                          </div>
                                      </div>
                                  ))}
                              </div>

                              <div className="space-y-3">
                                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1 mt-4">Fasta Poster / Mål</h4>
                                  {group.customPosts.map(bucket => {
                                      const { data: bd } = getEffectiveBucketData(bucket, selectedMonth, budgetTemplates, monthConfigs);
                                      return (
                                      <div key={`${bucket.id}-${bucket.displayMode}`} className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/50 flex justify-between items-center group/bucket">
                                          <div className="flex items-center gap-3">
                                              <button className="p-2 bg-slate-900 rounded-lg text-slate-400 shrink-0 hover:bg-slate-700 active:scale-90" onClick={(e) => { e.stopPropagation(); setIconPickerTarget({ type: 'BUCKET', id: bucket.id, name: bucket.name }); }}>{bucket.icon || (bucket.displayMode === 'SAVING' ? "💰" : "🎯")}</button>
                                              <div>
                                                  <div className="text-base font-medium text-slate-200 flex items-center gap-2">
                                                    {bucket.displayName}
                                                    {bucket.displayMode !== 'SPENDING' && <button onClick={() => setMovingBucket(bucket)} className="opacity-0 group-hover/bucket:opacity-100 p-1 text-slate-500 hover:text-blue-400 transition-all"><ArrowRightLeft size={12} /></button>}
                                                  </div>
                                                  <div className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-wider">{bucket.displayMode === 'SAVING' ? 'Månadssparande' : (bucket.displayMode === 'SPENDING' ? 'Förbrukning' : (bucket.type === 'FIXED' ? 'Fast' : 'Daglig'))}</div>
                                              </div>
                                          </div>
                                          <div className="text-right">
                                              <div 
                                                className={cn("font-mono text-lg font-bold flex items-center justify-end gap-2 cursor-pointer transition-colors", bucket.isOverridden ? "text-yellow-400" : "text-white hover:text-blue-400")}
                                                onClick={() => bucket.displayMode !== 'SPENDING' && handleEdit('BUCKET', bucket.id, bucket.name, bd || 0, bucket.type)}
                                              >
                                                {formatMoney(bucket.cost)}
                                                {bucket.isOverridden && <button onClick={(e) => handleReset('BUCKET', bucket.id, e)} className="p-1 hover:bg-slate-600 rounded text-slate-400 hover:text-white"><RotateCcw size={12} /></button>}
                                              </div>
                                              {bucket.spent > 0 && <div className="text-[10px] text-rose-400 hover:text-rose-300 hover:underline" onClick={(e) => { e.stopPropagation(); setDrillDownData({ title: bucket.name, transactions: bucket.transactions }); }}>-{formatMoney(bucket.spent)}</div>}
                                          </div>
                                      </div>
                                      );
                                  })}
                              </div>
                          </div>
                      )}
                  </div>
              );
          })}
      </div>

      <EmojiPickerModal isOpen={!!iconPickerTarget} onClose={() => setIconPickerTarget(null)} onSelect={handleIconSelect} title={iconPickerTarget ? `Ikon för ${iconPickerTarget.name}` : undefined} />

      {/* EDIT MODAL */}
      <Modal isOpen={!!editingItem} onClose={() => setEditingItem(null)} title={`Ändra budget: ${editingItem?.name}`}>
          <div className="space-y-6">
              <div className="bg-slate-800 p-4 rounded-xl text-center border border-slate-700">
                  <label className="text-xs text-slate-400 uppercase font-bold mb-2 block">Nytt Belopp</label>
                  <Input 
                      type="number" 
                      value={editAmount} 
                      onChange={(e) => setEditAmount(e.target.value)}
                      className="text-center text-3xl font-mono"
                      autoFocus
                  />
                  {editingItem?.bucketType === 'GOAL' && (
                    <p className="text-[10px] text-slate-500 mt-2 italic leading-relaxed">
                        Ändring av drömsparande justerar framtida behov automatiskt för att nå totalbeloppet.
                    </p>
                  )}
              </div>

              {editingItem?.bucketType === 'GOAL' ? (
                <Button variant="primary" onClick={() => saveBudget('OVERRIDE')} className="w-full">Bekräfta</Button>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <Button variant="secondary" onClick={() => saveBudget('OVERRIDE')}>
                      <span className="flex flex-col items-center py-1">
                          <span className="font-bold">Bara denna månad</span>
                          <span className="text-[10px] opacity-70">Avvikelse</span>
                      </span>
                  </Button>
                  <Button variant="primary" onClick={() => saveBudget('TEMPLATE')}>
                      <span className="flex flex-col items-center py-1">
                          <span className="font-bold">Uppdatera Mallen</span>
                          <span className="text-[10px] opacity-70">Permanent ändring</span>
                      </span>
                  </Button>
                </div>
              )}
          </div>
      </Modal>

      {/* MOVE MODAL (SUB) */}
      <Modal isOpen={!!movingSubCategory} onClose={() => setMovingSubCategory(null)} title="Flytta kategori">
          <div className="space-y-4">
              <p className="text-sm text-slate-300">Välj ny grupp för <span className="font-bold text-white">{movingSubCategory?.name}</span>:</p>
              <div className="grid gap-2">
                  {budgetGroups.map(bg => (
                      <button 
                        key={bg.id} 
                        onClick={() => handleMoveSub(bg.id)}
                        disabled={bg.id === movingSubCategory?.budgetGroupId}
                        className={cn("p-3 rounded-xl border text-left flex items-center gap-3 transition-all", bg.id === movingSubCategory?.budgetGroupId ? "bg-slate-900 border-slate-800 opacity-50" : "bg-slate-800 border-slate-700 hover:bg-blue-600 hover:border-blue-500 hover:text-white")}
                      >
                          <span className="text-xl">{bg.icon}</span>
                          <span className="font-bold">{bg.name}</span>
                      </button>
                  ))}
              </div>
          </div>
      </Modal>

      {/* MOVE MODAL (BUCKET) */}
      <Modal isOpen={!!movingBucket} onClose={() => setMovingBucket(null)} title="Flytta post">
          <div className="space-y-4">
              <p className="text-sm text-slate-300">Välj ny grupp för <span className="font-bold text-white">{movingBucket?.name}</span>:</p>
              <div className="grid gap-2">
                  {budgetGroups.map(bg => (
                      <button 
                        key={bg.id} 
                        onClick={() => handleMoveBucket(bg.id)}
                        disabled={bg.id === movingBucket?.budgetGroupId}
                        className={cn("p-3 rounded-xl border text-left flex items-center gap-3 transition-all", bg.id === movingBucket?.budgetGroupId ? "bg-slate-900 border-slate-800 opacity-50" : "bg-slate-800 border-slate-700 hover:bg-blue-600 hover:border-blue-500 hover:text-white")}
                      >
                          <span className="text-xl">{bg.icon}</span>
                          <span className="font-bold">{bg.name}</span>
                      </button>
                  ))}
              </div>
          </div>
      </Modal>

      {/* TOTAL BREAKDOWN MODAL */}
      <Modal isOpen={isTotalBreakdownOpen} onClose={() => setIsTotalBreakdownOpen(false)} title="Budgetfördelning">
          <div className="space-y-6">
              <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex justify-between items-center shadow-lg">
                  <div className="flex items-center gap-2 text-blue-400">
                      <BarChart3 size={20} />
                      <span className="text-sm font-bold uppercase tracking-wider">Total Kapacitet</span>
                  </div>
                  <span className="text-3xl font-bold font-mono text-white">{formatMoney(data.totalBudget)}</span>
              </div>
              <div className="space-y-3">
                  <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 flex justify-between items-center group hover:bg-slate-800 transition-colors">
                      <div className="flex items-center gap-3">
                          <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400"><Calendar size={18} /></div>
                          <div><div className="font-bold text-white">Drift</div><div className="text-[10px] text-slate-500 uppercase tracking-widest">Fasta & Rörliga Kostnader</div></div>
                      </div>
                      <div className="text-right">
                          <div className="font-mono font-bold text-white text-lg">{formatMoney(data.operationsTotal)}</div>
                          <div className="text-[10px] text-slate-500">{Math.round((data.operationsTotal / data.totalBudget) * 100)}% av total</div>
                      </div>
                  </div>
                  <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 flex justify-between items-center group hover:bg-slate-800 transition-colors">
                      <div className="flex items-center gap-3">
                          <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400"><PiggyBank size={18} /></div>
                          <div><div className="font-bold text-white">Löpande Sparande</div><div className="text-[10px] text-slate-500 uppercase tracking-widest">Buffert & Investeringar</div></div>
                      </div>
                      <div className="text-right">
                          <div className="font-mono font-bold text-emerald-400 text-lg">{formatMoney(data.savingsTotal)}</div>
                          <div className="text-[10px] text-slate-500">{Math.round((data.savingsTotal / data.totalBudget) * 100)}% av total</div>
                      </div>
                  </div>
                  <div className="border-t border-slate-700 pt-4 mt-2">
                      <h4 className="text-[10px] font-bold text-purple-400 uppercase tracking-widest mb-3 pl-1">Drömmar & Mål</h4>
                      
                      <div className="space-y-2">
                          <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 flex justify-between items-center group hover:bg-slate-800 transition-colors">
                              <div className="flex items-center gap-3">
                                  <div className="p-2 bg-purple-500/10 rounded-lg text-purple-400"><Target size={18} /></div>
                                  <div>
                                      <div className="font-bold text-white">Månadssparande</div>
                                      <div className="text-[10px] text-slate-500 uppercase tracking-widest">Avsättning från lön</div>
                                  </div>
                              </div>
                              <div className="text-right">
                                  <div className="font-mono font-bold text-purple-400 text-lg">{formatMoney(data.dreamsSavingTotal)}</div>
                                  <div className="text-[10px] text-slate-500">{Math.round((data.dreamsSavingTotal / data.totalBudget) * 100)}% av total</div>
                              </div>
                          </div>

                          <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 flex justify-between items-center group hover:bg-slate-800 transition-colors">
                              <div className="flex items-center gap-3">
                                  <div className="p-2 bg-orange-500/10 rounded-lg text-orange-400"><RefreshCw size={18} /></div>
                                  <div>
                                      <div className="font-bold text-white">Förbrukningsbudget</div>
                                      <div className="text-[10px] text-slate-500 uppercase tracking-widest">Från sparade medel (Saldo)</div>
                                  </div>
                              </div>
                              <div className="text-right">
                                  <div className="font-mono font-bold text-orange-400 text-lg">{formatMoney(data.dreamsSpendingTotal)}</div>
                                  <div className="text-[10px] text-slate-500">{Math.round((data.dreamsSpendingTotal / data.totalBudget) * 100)}% av total</div>
                              </div>
                          </div>
                      </div>
                  </div>
              </div>

              <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50 text-[10px] text-slate-400 leading-relaxed italic">
                Månadssparande dras från lönen för att bygga upp drömmen. Förbrukningsbudget är pengar du redan sparat (på ett konto) som du planerar att spendera denna månad.
              </div>

              <div className="pt-2 flex justify-end">
                  <Button variant="secondary" onClick={() => setIsTotalBreakdownOpen(false)} className="w-full">Stäng</Button>
              </div>
          </div>
      </Modal>

      <Modal isOpen={!!drillDownData} onClose={() => setDrillDownData(null)} title={drillDownData?.title || 'Transaktioner'}>
          <div className="space-y-4">
              <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                  {drillDownData?.transactions.map(t => (
                      <div key={t.id} className="flex justify-between items-center p-3 bg-slate-900/50 border border-slate-800 rounded-lg">
                          <div className="flex-1 mr-4 overflow-hidden"><div className="text-white font-medium truncate">{t.description}</div><div className="text-xs text-slate-500">{t.date}</div></div>
                          <div className="font-mono font-bold text-white whitespace-nowrap">{formatMoney(Math.abs(getEffectiveAmount(t, reimbursementMap)))}</div>
                      </div>
                  ))}
              </div>
          </div>
          <div className="mt-4 border-t border-slate-700 pt-4 flex justify-end"><Button variant="secondary" onClick={() => setDrillDownData(null)}>Stäng</Button></div>
      </Modal>
    </div>
  );
};
