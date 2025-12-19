
import React, { useMemo, useState } from 'react';
import { useApp } from '../store';
import { useBudgetMonth } from '../hooks/useBudgetMonth';
import { formatMoney, getEffectiveBudgetGroupData, getEffectiveSubCategoryBudget, calculateFixedBucketCost, calculateDailyBucketCost, calculateGoalBucketCost, calculateReimbursementMap, getEffectiveAmount, getSubCategoryAverage, generateId, getEffectiveBucketData, isBucketActiveInMonth, getBudgetInterval } from '../utils';
import { ChevronRight, ChevronDown, Check, AlertTriangle, PieChart, Edit2, Plus, Trash2, Settings, ArrowRightLeft, Rocket, Calendar, Plane, RefreshCw, Lock, Unlock, ChevronUp, BarChart3, Wallet, Link2, X, PiggyBank, FolderInput, ArrowRight, Link, Save, Copy, LayoutTemplate, Activity, RotateCcw, CreditCard, Target, Info, Landmark } from 'lucide-react';
import { BudgetProgressBar } from '../components/BudgetProgressBar';
import { cn, Button, Modal, Input } from '../components/components';
import { BudgetGroup, SubCategory, Bucket, BucketData, Transaction } from '../types';
import { parseISO, addMonths, format, eachDayOfInterval, getDay, isBefore, isAfter, isSameMonth, isValid } from 'date-fns';
import { sv } from 'date-fns/locale';
import { EmojiPickerModal } from '../components/EmojiPicker';

const DREAM_IMAGES = [
  "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=2073&auto=format&fit=crop", 
  "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?q=80&w=2021&auto=format&fit=crop", 
  "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?q=80&w=2070&auto=format&fit=crop", 
  "https://images.unsplash.com/photo-1560518883-ce09059eeffa?q=80&w=1973&auto=crop", 
  "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?q=80&w=2070&auto=format&fit=crop", 
  "https://images.unsplash.com/photo-1523275335684-37898b6baf30?q=80&w=1999&auto=format&fit=crop", 
  "https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=2070&auto=format&fit=crop",
];

const DAYS_SHORT = ["Sö", "Må", "Ti", "On", "To", "Fr", "Lö"];

interface DisplayBucket extends Bucket {
    cost: number;
    spent: number;
    transactions: Transaction[];
    displayMode: 'STANDARD' | 'SAVING' | 'SPENDING';
    displayName: string;
}

export const OperatingBudgetView: React.FC = () => {
  const { 
      selectedMonth, budgetGroups, subCategories, mainCategories, transactions, 
      buckets, accounts, settings, addBudgetGroup, updateBudgetGroup, 
      deleteBudgetGroup, updateSubCategory, addSubCategory, addBucket, updateBucket, deleteBucket,
      budgetTemplates, monthConfigs, setBudgetLimit, toggleMonthLock, unlockMonth, assignTemplateToMonth, clearBudgetOverride, resetMonthToTemplate
  } = useApp();
  
  const { startStr, endStr, intervalLabel, start, end } = useBudgetMonth(selectedMonth);

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  
  const [iconPickerTarget, setIconPickerTarget] = useState<{ type: 'GROUP'|'SUB'|'BUCKET', id: string, name: string } | null>(null);

  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<BudgetGroup | null>(null);
  const [editingLimit, setEditingLimit] = useState<number>(0);

  const [amountModalData, setAmountModalData] = useState<{
      type: 'SUB' | 'BUCKET' | 'DREAM_SAVING';
      id: string;
      name: string;
      currentValue: number;
      tempValue: string;
  } | null>(null);

  const [resetTarget, setResetTarget] = useState<{ type: 'GROUP'|'SUB'|'BUCKET', id: string, name: string, currentValue: string, templateValue: string } | null>(null);
  const [unlockTarget, setUnlockTarget] = useState<string | null>(null);
  const [isCatPickerOpen, setIsCatPickerOpen] = useState(false);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  
  const [isSubModalOpen, setIsSubModalOpen] = useState(false);
  const [editingSubCategory, setEditingSubCategory] = useState<SubCategory | null>(null);
  const [editingSubBudget, setEditingSubBudget] = useState<number>(0);

  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [movingSubCategory, setMovingSubCategory] = useState<SubCategory | null>(null);
  const [movingBucket, setMovingBucket] = useState<Bucket | null>(null);

  const [isBucketModalOpen, setIsBucketModalOpen] = useState(false);
  const [editingBucket, setEditingBucket] = useState<Bucket | null>(null);
  const [editingBucketData, setEditingBucketData] = useState<BucketData>({ amount: 0, dailyAmount: 0, activeDays: [] });

  const [isTemplatePickerOpen, setIsTemplatePickerOpen] = useState(false);
  const [isTotalBreakdownOpen, setIsTotalBreakdownOpen] = useState(false);
  const [drillDownData, setDrillDownData] = useState<{ title: string, transactions: Transaction[] } | null>(null);

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
  const currentMonthConfig = useMemo(() => monthConfigs.find(c => c.monthKey === selectedMonth), [monthConfigs, selectedMonth]);

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
      let dreamSpending = 0;
      let dreamSaving = 0;
      let generalSaving = 0;
      let fixedOps = 0;
      let variableOps = 0;

      const groups = budgetGroups.map(group => {
          const linkedSubs = subCategories.filter(s => s.budgetGroupId === group.id).map(sub => {
              const txs = getSubCategoryTxs(sub.id);
              const spent = txs.reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);
              const budget = getEffectiveSubCategoryBudget(sub, selectedMonth, budgetTemplates, monthConfigs);
              if (sub.isSavings || group.forecastType === 'SAVINGS') generalSaving += budget;
              else if (group.forecastType === 'FIXED') fixedOps += budget;
              else variableOps += budget;
              return { ...sub, spent, transactions: txs, avgSpend: getSubCategoryAverage(sub.id, selectedMonth, transactions, reimbursementMap), budget };
          });

          const subTotalBudget = linkedSubs.reduce((sum, s) => sum + s.budget, 0);
          const subTotalSpent = linkedSubs.reduce((sum, s) => sum + s.spent, 0);

          const linkedBuckets = buckets.filter(b => b.budgetGroupId === group.id || (group.isCatchAll && !b.budgetGroupId && (!group.linkedBucketIds || !group.linkedBucketIds.includes(b.id))) || (group.linkedBucketIds && group.linkedBucketIds.includes(b.id)));
          const displayBuckets: DisplayBucket[] = [];

          linkedBuckets.forEach(b => {
              const txs = getBucketTxs(b.id);
              const spent = txs.reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);
              if (b.type === 'GOAL') {
                  let showSaving = false;
                  let savingAmount = 0;
                  if (b.paymentSource === 'INCOME' && b.startSavingDate && b.targetDate) {
                      const current = parseISO(`${selectedMonth}-01`);
                      const startSave = parseISO(`${b.startSavingDate}-01`);
                      const target = parseISO(`${b.targetDate}-01`);
                      const archived = b.archivedDate ? parseISO(`${b.archivedDate}-01`) : null;
                      if (isValid(current) && isValid(startSave) && isValid(target)) {
                          const isSavingRange = !isBefore(current, startSave) && isBefore(current, target);
                          const isNotArchivedYet = !archived || !isAfter(current, archived);
                          if (isSavingRange && isNotArchivedYet) {
                              showSaving = true;
                              savingAmount = calculateGoalBucketCost(b, selectedMonth);
                              dreamSaving += savingAmount;
                          }
                      }
                  }
                  if (showSaving) displayBuckets.push({ ...b, cost: savingAmount, spent: 0, transactions: [], displayMode: 'SAVING', displayName: `Spara: ${b.name}` });
                  let showSpending = false;
                  if (spent > 0) showSpending = true;
                  else {
                      const current = parseISO(`${selectedMonth}-01`);
                      if (b.targetDate) { const target = parseISO(`${b.targetDate}-01`); if (isValid(target) && isSameMonth(current, target)) showSpending = true; }
                      if (b.eventStartDate && b.eventEndDate) { const evtStart = parseISO(b.eventStartDate); const evtEnd = parseISO(b.eventEndDate); if (isValid(evtStart) && isValid(evtEnd) && !isAfter(start, evtEnd) && !isBefore(end, evtStart)) showSpending = true; }
                  }
                  if (showSpending) {
                      const { start: iStart } = getBudgetInterval(selectedMonth, settings.payday);
                      const currentStartStr = format(iStart, 'yyyy-MM-dd');
                      const pastSpent = transactions.filter(t => !t.isHidden && t.bucketId === b.id && t.date < currentStartStr && (t.type === 'EXPENSE' || (!t.type && t.amount < 0))).reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);
                      const projectBudget = Math.max(0, b.targetAmount - pastSpent);
                      dreamSpending += projectBudget;
                      displayBuckets.push({ ...b, cost: projectBudget, spent, transactions: txs, displayMode: 'SPENDING', displayName: b.name });
                  }
              } else {
                  let cost = 0;
                  const { data: bData } = getEffectiveBucketData(b, selectedMonth, budgetTemplates, monthConfigs);
                  if (b.type === 'FIXED') cost = bData ? bData.amount : 0;
                  else if (b.type === 'DAILY' && bData) { const days = eachDayOfInterval({ start, end }); const count = days.filter(d => bData.activeDays.includes(getDay(d))).length; cost = count * bData.dailyAmount; }
                  if (cost > 0 || spent > 0 || isBucketActiveInMonth(b, selectedMonth)) {
                      if (b.isSavings || group.forecastType === 'SAVINGS') generalSaving += cost;
                      else if (group.forecastType === 'FIXED') fixedOps += cost;
                      else variableOps += cost;
                      displayBuckets.push({ ...b, cost, spent, transactions: txs, displayMode: 'STANDARD', displayName: b.name });
                  }
              }
          });

          const { data: explicitData, templateName } = getEffectiveBudgetGroupData(group, selectedMonth, budgetTemplates, monthConfigs);
          const manualLimit = explicitData ? explicitData.limit : 0;
          const calculatedTotal = subTotalBudget + displayBuckets.reduce((sum, b) => sum + b.cost, 0);
          const totalBudget = Math.max(calculatedTotal, manualLimit);
          const buffer = totalBudget - calculatedTotal;
          if (buffer > 0) { if (group.forecastType === 'SAVINGS') generalSaving += buffer; else if (group.forecastType === 'FIXED') fixedOps += buffer; else variableOps += buffer; }

          let extraSpent = 0;
          let catchAllTxs: Transaction[] = [];
          if (group.isCatchAll) {
              catchAllTxs = transactions.filter(t => !t.isHidden && t.date >= startStr && t.date <= endStr && (t.type === 'EXPENSE' || (!t.type && t.amount < 0)) && t.type !== 'TRANSFER' && t.type !== 'INCOME' && !t.bucketId && (!t.categorySubId || !subCategories.find(s => s.id === t.categorySubId)?.budgetGroupId));
              extraSpent = catchAllTxs.reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);
          }

          return { ...group, totalBudget, totalSpent: subTotalSpent + displayBuckets.reduce((sum, b) => sum + b.spent, 0) + extraSpent, isAuto: linkedSubs.length > 0 || displayBuckets.length > 0, templateName, subs: linkedSubs, customPosts: displayBuckets, allTransactions: [...linkedSubs.flatMap(s => s.transactions), ...displayBuckets.flatMap(b => b.transactions), ...catchAllTxs], catchAllTransactions: catchAllTxs, extraSpent };
      });

      return { groups, totalBudget: groups.reduce((sum, g) => sum + g.totalBudget, 0), totalSpent: groups.reduce((sum, g) => sum + g.totalSpent, 0), totalIncome: transactions.filter(t => !t.isHidden && t.type === 'INCOME' && t.date >= startStr && t.date <= endStr).reduce((sum, t) => sum + t.amount, 0), breakdown: { dreamSpending, dreamSaving, generalSaving, fixedOps, variableOps } };
  }, [budgetGroups, subCategories, buckets, transactions, selectedMonth, settings.payday, startStr, endStr, reimbursementMap, budgetTemplates, monthConfigs, start, end]);

  const toggleGroup = (id: string) => { const next = new Set(expandedGroups); if (next.has(id)) next.delete(id); else next.add(id); setExpandedGroups(next); };

  const handleStartEditingAmount = (item: SubCategory | DisplayBucket) => {
      if (isMonthLocked) { alert("Månaden är låst. Lås upp för att ändra budgeten."); return; }

      let type: 'SUB' | 'BUCKET' | 'DREAM_SAVING' = 'SUB';
      let currentValue = 0;
      let name = item.name;

      if ('displayMode' in item) {
          if (item.displayMode === 'SAVING') {
              type = 'DREAM_SAVING';
              currentValue = item.cost;
              name = item.displayName;
          } else if (item.displayMode === 'SPENDING') {
              return;
          } else {
              type = 'BUCKET';
              const { data } = getEffectiveBucketData(item, selectedMonth, budgetTemplates, monthConfigs);
              currentValue = item.type === 'DAILY' ? (data?.dailyAmount || 0) : (data?.amount || 0);
          }
      } else {
          type = 'SUB';
          currentValue = getEffectiveSubCategoryBudget(item, selectedMonth, budgetTemplates, monthConfigs);
      }

      setAmountModalData({
          type,
          id: item.id,
          name,
          currentValue,
          tempValue: currentValue > 0 ? currentValue.toString() : ''
      });
  };

  const handleSaveAmount = async (mode: 'TEMPLATE' | 'OVERRIDE') => {
      if (!amountModalData) return;
      const val = parseFloat(amountModalData.tempValue);
      const amount = isNaN(val) ? 0 : val;

      if (amountModalData.type === 'DREAM_SAVING') {
          const bucket = buckets.find(b => b.id === amountModalData.id);
          if (bucket) {
              const newData = { ...bucket.monthlyData };
              newData[selectedMonth] = { ...newData[selectedMonth], amount, isExplicitlyDeleted: false };
              await updateBucket({ ...bucket, monthlyData: newData });
          }
      } else if (amountModalData.type === 'BUCKET') {
          const bucket = buckets.find(b => b.id === amountModalData.id);
          if (bucket) {
              const { data: bData } = getEffectiveBucketData(bucket, selectedMonth, budgetTemplates, monthConfigs);
              const newBucketData = { ...(bData || { amount: 0, dailyAmount: 0, activeDays: [1,2,3,4,5] }) };
              if (bucket.type === 'DAILY') newBucketData.dailyAmount = amount;
              else newBucketData.amount = amount;
              await setBudgetLimit('BUCKET', bucket.id, newBucketData, selectedMonth, mode);
          }
      } else {
          await setBudgetLimit('SUB', amountModalData.id, amount, selectedMonth, mode);
      }

      setAmountModalData(null);
  };

  const handleResetOverride = (type: 'GROUP'|'SUB'|'BUCKET', id: string, name: string, currentVal: number, templateVal: number) => { setResetTarget({ type, id, name, currentValue: formatMoney(currentVal), templateValue: formatMoney(templateVal) }); };
  const confirmReset = async () => { if (!resetTarget) return; if (resetTarget.type === 'BUCKET') { const bucket = buckets.find(b => b.id === resetTarget.id); if (bucket && bucket.type === 'GOAL') { const newData = { ...bucket.monthlyData }; if (newData[selectedMonth]) { delete newData[selectedMonth]; await updateBucket({ ...bucket, monthlyData: newData }); } setResetTarget(null); return; } } await clearBudgetOverride(resetTarget.type, resetTarget.id, selectedMonth); setResetTarget(null); };
  
  const handleToggleLock = (month: string) => {
    if (isMonthLocked) {
        setUnlockTarget(month);
    } else {
        toggleMonthLock(month);
    }
  };

  const confirmUnlock = async (shouldReset: boolean) => {
      if (!unlockTarget) return;
      // Use the new atomic unlock operation from store to avoid race conditions
      await unlockMonth(unlockTarget, shouldReset);
      setUnlockTarget(null);
  };

  const handleIconSelect = async (emoji: string) => { if (!iconPickerTarget) return; const { type, id } = iconPickerTarget; if (type === 'GROUP') { const group = budgetGroups.find(g => g.id === id); if (group) await updateBudgetGroup({ ...group, icon: emoji }); } else if (type === 'SUB') { const sub = subCategories.find(s => s.id === id); if (sub) await updateSubCategory({ ...sub, icon: emoji }); } else if (type === 'BUCKET') { const bucket = buckets.find(b => b.id === id); if (bucket) await updateBucket({ ...bucket, icon: emoji }); } setIconPickerTarget(null); };
  const handleMoveSubCategory = async (sub: SubCategory, newGroupId: string) => { await updateSubCategory({ ...sub, budgetGroupId: newGroupId }); };
  const handleUnlinkSubCategory = async (sub: SubCategory) => { await updateSubCategory({ ...sub, budgetGroupId: undefined }); };
  const handleMoveBucket = async (bucket: Bucket, newGroupId: string) => { await updateBucket({ ...bucket, budgetGroupId: newGroupId }); };
  const handleUnlinkBucket = async (bucket: Bucket) => { await updateBucket({ ...bucket, budgetGroupId: undefined }); };
  
  const saveSubCategory = async (mode: 'TEMPLATE' | 'OVERRIDE') => {
    if (!editingSubCategory) return;
    await setBudgetLimit('SUB', editingSubCategory.id, editingSubBudget, selectedMonth, mode);
    await updateSubCategory(editingSubCategory);
    setIsSubModalOpen(false);
  };

  const openSubCategorySettings = (sub: SubCategory) => { 
      setEditingSubCategory(sub); 
      setEditingSubBudget(getEffectiveSubCategoryBudget(sub, selectedMonth, budgetTemplates, monthConfigs));
      setIsSubModalOpen(true); 
  };
  const openMoveModalSub = (sub: SubCategory) => { setMovingSubCategory(sub); setMovingBucket(null); setIsMoveModalOpen(true); };
  const openMoveModalBucket = (bucket: Bucket) => { setMovingBucket(bucket); setMovingSubCategory(null); setIsMoveModalOpen(true); };

  const openGroupModal = (group?: BudgetGroup) => {
      if (group) { setEditingGroup(group); const { data: gData } = getEffectiveBudgetGroupData(group, selectedMonth, budgetTemplates, monthConfigs); setEditingLimit(gData ? gData.limit : 0); }
      else { setEditingGroup({ id: '', name: '', icon: '📁', monthlyData: {}, forecastType: 'VARIABLE' }); setEditingLimit(0); }
      setIsGroupModalOpen(true);
  };

  const saveGroup = async () => {
      if (!editingGroup) return;
      if (!editingGroup.id) { await addBudgetGroup(editingGroup.name, editingLimit, editingGroup.icon || '📁', editingGroup.forecastType || 'VARIABLE'); setIsGroupModalOpen(false); }
      else {
          const { data: gData } = getEffectiveBudgetGroupData(editingGroup, selectedMonth, budgetTemplates, monthConfigs);
          const currentLimit = gData ? gData.limit : 0;
          if (editingLimit !== currentLimit) {
              if (isMonthLocked) { alert("Månaden är låst. Lås upp för att ändra beloppet."); return; }
              await setBudgetLimit('GROUP', editingGroup.id, editingLimit, selectedMonth, 'OVERRIDE');
          } else { await updateBudgetGroup(editingGroup); }
          setIsGroupModalOpen(false);
      }
  };

  const openBucketModal = (group: BudgetGroup, bucket?: DisplayBucket) => {
      setActiveGroupId(group.id);
      if (bucket) {
          setEditingBucket(bucket);
          const { data: bData } = getEffectiveBucketData(bucket, selectedMonth, budgetTemplates, monthConfigs);
          setEditingBucketData(bData || { amount: 0, dailyAmount: 0, activeDays: [1,2,3,4,5] });
      } else {
          setEditingBucket({ id: generateId(), accountId: '', name: '', type: 'FIXED', isSavings: false, paymentSource: 'INCOME', monthlyData: {}, targetAmount: 0, targetDate: format(addMonths(new Date(), 12), 'yyyy-MM'), startSavingDate: selectedMonth, budgetGroupId: group.id, backgroundImage: DREAM_IMAGES[0] });
          setEditingBucketData({ amount: 0, dailyAmount: 0, activeDays: [1,2,3,4,5] });
      }
      setIsBucketModalOpen(true);
  };

  const saveBucketSettings = async (mode: 'TEMPLATE' | 'OVERRIDE') => {
      if (!editingBucket) return;
      
      const isNew = !buckets.find(b => b.id === editingBucket.id);
      
      if (!isNew) {
          await updateBucket(editingBucket);
          await setBudgetLimit('BUCKET', editingBucket.id, editingBucketData, selectedMonth, mode);
      } else {
          const bucketWithId = { ...editingBucket };
          await addBucket(bucketWithId);
          await setBudgetLimit('BUCKET', bucketWithId.id, editingBucketData, selectedMonth, mode);
      }
      
      setIsBucketModalOpen(false);
  };

  const deleteBucketHandler = async () => { if (editingBucket) { await deleteBucket(editingBucket.id, selectedMonth, 'ALL'); setIsBucketModalOpen(false); } };
  const openDrillDown = (title: string, txs: Transaction[]) => { if (txs.length > 0) setDrillDownData({ title, transactions: txs }); };

  const activeTemplateName = useMemo(() => { if (activeTemplate) return activeTemplate.name; const def = budgetTemplates.find(t => t.isDefault); return def?.name || 'Standard'; }, [activeTemplate, budgetTemplates]);

  const toggleEditingDay = (day: number) => {
      const next = editingBucketData.activeDays.includes(day) 
        ? editingBucketData.activeDays.filter(d => d !== day)
        : [...editingBucketData.activeDays, day];
      setEditingBucketData({ ...editingBucketData, activeDays: next });
  };

  return (
    <div className="space-y-6 pb-24 animate-in slide-in-from-right duration-300">
      
      <div className="grid grid-cols-2 gap-4">
          <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Total Inkomst (Period)</div>
              <div className="text-2xl font-mono font-bold text-emerald-400">{formatMoney(data.totalIncome)}</div>
          </div>
          <div onClick={() => setIsTotalBreakdownOpen(true)} className="bg-slate-800 p-4 rounded-2xl border border-slate-700 relative cursor-pointer hover:bg-slate-750 group transition-all">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 group-hover:text-blue-400 flex items-center gap-1.5 transition-colors">Total Budget <Info size={10} /></div>
              <div className="text-2xl font-mono font-bold text-blue-400">{formatMoney(data.totalBudget)}</div>
              <button onClick={(e) => { e.stopPropagation(); handleToggleLock(selectedMonth); }} className={cn("absolute top-4 right-4 p-2 rounded-lg transition-all", isMonthLocked ? "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30" : "bg-slate-700/50 text-slate-400 hover:text-white hover:bg-slate-700")}>{isMonthLocked ? <Lock size={16} /> : <Unlock size={16} />}</button>
          </div>
      </div>

      <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/50 flex justify-between items-center">
          <div className="flex items-center gap-2 text-slate-400"><LayoutTemplate size={16} /><span className="text-xs font-bold uppercase tracking-wider">Budgetmall</span></div>
          <button onClick={() => !isMonthLocked && setIsTemplatePickerOpen(true)} disabled={isMonthLocked} className={cn("flex items-center gap-2 text-sm font-medium transition-colors px-2 py-1 rounded", isMonthLocked ? "text-slate-500 cursor-not-allowed" : "text-white hover:text-blue-400 hover:bg-white/5 cursor-pointer")}>{isMonthLocked ? <Lock size={12} className="text-amber-500"/> : <Edit2 size={12} className="text-slate-500"/>}<span>{activeTemplateName}</span></button>
      </div>

      <div className="space-y-4">
          {data.groups.map(group => {
              const isExpanded = expandedGroups.has(group.id);
              const isOver = group.totalSpent > group.totalBudget && group.totalBudget > 0;
              return (
                  <div key={group.id} className={cn("bg-surface rounded-xl overflow-hidden border transition-all shadow-md", group.isCatchAll ? "border-dashed border-slate-600" : "border-slate-700")}>
                      <div className="p-4 cursor-pointer hover:bg-slate-800/80 transition-colors relative" onClick={() => toggleGroup(group.id)}>
                          <div className="flex justify-between items-start mb-2">
                              <div className="flex items-center gap-3">
                                  {isExpanded ? <ChevronDown size={20} className="text-blue-400"/> : <ChevronRight size={20} className="text-slate-500"/>}
                                  <div>
                                      <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                          <span className="hover:bg-slate-700/50 p-1 rounded transition-colors" onClick={(e) => { e.stopPropagation(); setIconPickerTarget({ type: 'GROUP', id: group.id, name: group.name }); }}>{group.icon}</span> 
                                          {group.name}
                                          {isOver && <AlertTriangle className="w-4 h-4 text-rose-500" />}
                                      </h3>
                                      <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">{group.isAuto ? `Auto (${group.subs.length} kat)` : "Manuell"}<span className="text-slate-600">•</span><span className="text-slate-500">{group.templateName}</span>{group.forecastType === 'FIXED' && <span className="text-[10px] bg-slate-700 text-slate-300 px-1 rounded ml-1">Fast</span>}{group.forecastType === 'SAVINGS' && <span className="text-[10px] bg-emerald-900 text-emerald-300 px-1 rounded ml-1 flex items-center gap-0.5"><PiggyBank size={8}/> Sparande</span>}{isMonthLocked && <Lock size={10} className="text-amber-500 ml-1" />}</div>
                                  </div>
                              </div>
                              <div className="text-right">
                                  <div className="font-mono font-bold text-white text-lg">{formatMoney(group.totalBudget)}</div>
                                  <div className="text-slate-500 text-xs hover:text-blue-400 hover:underline cursor-pointer mt-0.5" onClick={(e) => { e.stopPropagation(); openDrillDown(`${group.name} - Totalt Utfall`, group.allTransactions); }}>Utfall: {formatMoney(group.totalSpent)}</div>
                              </div>
                          </div>
                          <BudgetProgressBar spent={group.totalSpent} total={group.totalBudget} />
                      </div>

                      {isExpanded && (
                          <div className="bg-slate-900/30 border-t border-slate-700/50 p-3 space-y-6 animate-in slide-in-from-top-2">
                              <div className="flex justify-between items-center">
                                  <button onClick={() => openGroupModal(group)} className="text-xs flex items-center gap-1 px-3 py-1.5 rounded-full border text-slate-400 hover:text-white bg-slate-800 border-slate-700"><Settings size={12} /> Inställningar & Konto</button>
                              </div>
                              <div className="space-y-3">
                                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Kategorier</h4>
                                  {group.subs.map(sub => {
                                      const isOverridden = !!currentMonthConfig?.subCategoryOverrides?.[sub.id];
                                      const templateValue = activeTemplate?.subCategoryBudgets[sub.id] || 0;
                                      return (
                                          <div key={sub.id} className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/50 flex flex-col gap-3">
                                              <div className="flex justify-between items-start">
                                                  <div className="flex items-center gap-3">
                                                      <button className="p-2 bg-slate-900 rounded-lg shrink-0 text-slate-400 hover:bg-slate-700 transition-colors active:scale-90" onClick={() => setIconPickerTarget({ type: 'SUB', id: sub.id, name: sub.name })}>{sub.icon ? <span className="text-xl leading-none">{sub.icon}</span> : sub.isSavings ? <PiggyBank size={16} className="text-emerald-400" /> : <CreditCard size={16} className="text-blue-400" />}</button>
                                                      <div>
                                                          <div className="font-medium text-base text-slate-200 flex items-center gap-2 cursor-pointer hover:text-blue-400 transition-colors" onClick={() => openSubCategorySettings(sub)}>{sub.name}{sub.accountId && <span className="text-[9px] bg-indigo-500/20 text-indigo-300 px-1 rounded flex items-center gap-0.5"><Wallet size={8}/> Eget konto</span>}</div>
                                                          <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-2"><span>Snitt: {formatMoney(sub.avgSpend)}</span><span>•</span><span className={cn("cursor-pointer hover:underline", sub.spent > 0 ? "text-slate-300 hover:text-blue-400" : "text-slate-500")} onClick={() => openDrillDown(sub.name, sub.transactions)}>Utfall: {formatMoney(sub.spent)}</span></div>
                                                      </div>
                                                  </div>
                                                  <div className="text-right">
                                                      <div className="text-[10px] uppercase font-bold text-slate-500 mb-0.5">Budget</div>
                                                      <div className="flex items-center justify-end gap-1.5">
                                                          {isOverridden && !isMonthLocked && <button onClick={(e) => { e.stopPropagation(); handleResetOverride('SUB', sub.id, sub.name, sub.budget, templateValue); }} className="p-1 rounded-full text-amber-400 hover:bg-amber-900/30 transition-colors"><RotateCcw size={12} /></button>}
                                                          <div className={cn("text-2xl font-mono font-bold cursor-pointer transition-colors", isMonthLocked ? "text-slate-400 cursor-not-allowed" : (isOverridden ? "text-amber-400 hover:text-amber-300" : "text-white hover:text-blue-400"))} onClick={() => handleStartEditingAmount(sub)}>{formatMoney(sub.budget)}</div>
                                                      </div>
                                                  </div>
                                              </div>
                                          </div>
                                      );
                                  })}
                                  <Button variant="ghost" onClick={() => { setActiveGroupId(group.id); setIsCatPickerOpen(true); }} className="w-full border border-dashed border-slate-700 text-slate-500 text-xs py-2 h-auto"><Plus size={12} className="mr-1"/> Koppla Kategori</Button>
                              </div>
                              <div className="space-y-3">
                                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1 mt-4">Fasta Poster / Mål</h4>
                                  {group.customPosts.map(bucket => {
                                      const isOverridden = bucket.type === 'GOAL' ? (!!buckets.find(b => b.id === bucket.id)?.monthlyData[selectedMonth]) : (!!currentMonthConfig?.bucketOverrides?.[bucket.id]);
                                      const tVal = activeTemplate?.bucketValues?.[bucket.id];
                                      const templateValue = bucket.type === 'DAILY' ? (tVal?.dailyAmount || 0) : (tVal?.amount || 0);
                                      const currentValue = bucket.type === 'DAILY' ? (getEffectiveBucketData(bucket, selectedMonth).data?.dailyAmount || 0) : bucket.cost;
                                      const isSpendingPhase = bucket.displayMode === 'SPENDING';
                                      return (
                                          <div key={`${bucket.id}-${bucket.displayMode}`} className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/50 flex flex-col gap-3">
                                              <div className="flex justify-between items-center">
                                                  <div className="flex items-center gap-3">
                                                      <button className="p-2 bg-slate-900 rounded-lg text-slate-400 shrink-0 hover:bg-slate-700 transition-colors active:scale-90" onClick={(e) => { e.stopPropagation(); setIconPickerTarget({ type: 'BUCKET', id: bucket.id, name: bucket.name }); }}>{bucket.icon ? <span className="text-xl leading-none">{bucket.icon}</span> : bucket.displayMode === 'SAVING' || bucket.isSavings ? <PiggyBank size={16} className="text-emerald-400" /> : bucket.displayMode === 'SPENDING' || bucket.type === 'GOAL' ? <Target size={16} className="text-purple-400" /> : bucket.type === 'DAILY' ? <RefreshCw size={16} className="text-orange-400" /> : <Calendar size={16} className="text-blue-400" />}</button>
                                                      <div>
                                                          <div className="text-base font-medium text-slate-200 flex items-center gap-2 cursor-pointer hover:text-blue-400 transition-colors" onClick={() => openBucketModal(group, bucket)}>{bucket.displayName}<button onClick={(e) => { e.stopPropagation(); openMoveModalBucket(bucket); }} className="text-slate-500 hover:text-blue-400"><ArrowRight size={12} /></button></div>
                                                          <div className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-wider">{bucket.displayMode === 'SAVING' ? 'Månadssparande' : (bucket.displayMode === 'SPENDING' ? 'Förbrukning / Projekt' : (bucket.type === 'FIXED' ? 'Fast' : 'Daglig'))}</div>
                                                      </div>
                                                  </div>
                                                  <div className="text-right">
                                                      <div className="flex items-center justify-end gap-1.5">
                                                          {isOverridden && !isMonthLocked && !isSpendingPhase && <button onClick={(e) => { e.stopPropagation(); handleResetOverride('BUCKET', bucket.id, bucket.name, currentValue, templateValue); }} className="p-1 rounded-full text-amber-400 hover:bg-amber-900/30 transition-colors"><RotateCcw size={12} /></button>}
                                                          <div className={cn("font-mono text-xl font-bold transition-colors", isSpendingPhase ? "text-slate-400 cursor-default" : (isMonthLocked ? "text-slate-400 cursor-not-allowed" : (isOverridden ? "text-amber-400 hover:text-amber-300 cursor-pointer" : "text-white hover:text-blue-400 cursor-pointer")))} onClick={() => !isSpendingPhase && handleStartEditingAmount(bucket)}>{formatMoney(bucket.cost)}</div>
                                                      </div>
                                                      {bucket.spent > 0 && <div className="text-[10px] text-rose-400 hover:text-rose-300 hover:underline cursor-pointer mt-0.5" onClick={(e) => { e.stopPropagation(); openDrillDown(bucket.name, bucket.transactions); }}>Utfall: -{formatMoney(bucket.spent)}</div>}
                                                  </div>
                                              </div>
                                          </div>
                                      );
                                  })}
                                  <Button variant="ghost" onClick={() => openBucketModal(group)} className="w-full border border-dashed border-slate-700 text-slate-500 text-xs py-2 h-auto"><Plus size={12} className="mr-1"/> Skapa Fast Post / Mål</Button>
                              </div>
                          </div>
                      )}
                  </div>
              );
          })}
          <Button variant="secondary" onClick={() => openGroupModal()} className="w-full border-dashed border-slate-700 py-4 text-slate-400 hover:text-white mt-8"><Plus className="w-5 h-5 mr-2" /> Skapa ny budgetgrupp</Button>
      </div>

      <Modal isOpen={!!amountModalData} onClose={() => setAmountModalData(null)} title={`Ändra belopp: ${amountModalData?.name}`}>
          {amountModalData && (
              <div className="space-y-6">
                  <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-inner">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 block">Ange nytt belopp</label>
                      <div className="flex items-center gap-3">
                          <input 
                              type="number"
                              className="bg-transparent text-5xl font-mono font-bold text-white w-full outline-none border-b-2 border-slate-700 focus:border-blue-500 pb-2 transition-colors"
                              placeholder="0"
                              value={amountModalData.tempValue}
                              onChange={(e) => setAmountModalData({ ...amountModalData, tempValue: e.target.value })}
                              autoFocus
                          />
                          <span className="text-slate-500 text-3xl font-bold">kr</span>
                      </div>
                      <div className="text-xs text-slate-500 mt-4 italic">Befintligt: {formatMoney(amountModalData.currentValue)}</div>
                  </div>

                  <div className="space-y-3">
                      {amountModalData.type === 'DREAM_SAVING' ? (
                          <Button onClick={() => handleSaveAmount('OVERRIDE')} className="w-full bg-emerald-600 hover:bg-emerald-500 h-14 text-lg">Bekräfta ändring</Button>
                      ) : (
                          <div className="grid gap-3">
                              <button onClick={() => handleSaveAmount('TEMPLATE')} className="flex items-center gap-3 p-4 rounded-xl border border-blue-500/30 bg-blue-900/10 hover:bg-blue-900/20 text-left transition-colors">
                                  <div className="p-2 bg-blue-600 rounded-lg text-white"><Save size={18}/></div>
                                  <div>
                                      <div className="font-bold text-white">Uppdatera Mallen ({activeTemplateName})</div>
                                      <div className="text-xs text-slate-400">Påverkar alla månader som använder denna mall.</div>
                                  </div>
                              </button>
                              <button onClick={() => handleSaveAmount('OVERRIDE')} className="flex items-center gap-3 p-4 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-left transition-colors">
                                  <div className="p-2 bg-slate-700 rounded-lg text-white"><Calendar size={18}/></div>
                                  <div>
                                      <div className="font-bold text-white">Bara denna månad</div>
                                      <div className="text-xs text-slate-400">Gör ett undantag för {intervalLabel}.</div>
                                  </div>
                              </button>
                          </div>
                      )}
                      <Button variant="secondary" onClick={() => setAmountModalData(null)} className="w-full">Avbryt</Button>
                  </div>
              </div>
          )}
      </Modal>

      <Modal isOpen={isTotalBreakdownOpen} onClose={() => setIsTotalBreakdownOpen(false)} title="Budgetuppdelning"><div className="space-y-6"><div className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex justify-between items-center"><span className="text-slate-400 text-sm font-bold uppercase tracking-wider">Total Budget</span><span className="text-2xl font-bold text-white font-mono">{formatMoney(data.totalBudget)}</span></div><div className="space-y-3"><div className="flex justify-between items-center p-3 bg-purple-900/20 border border-purple-500/30 rounded-xl"><div className="flex items-center gap-3"><div className="p-2 bg-purple-500/20 rounded-lg text-purple-400"><Target size={16} /></div><div><div className="text-sm font-bold text-white">Drömmar: Förbrukning</div><div className="text-[10px] text-slate-500">Målprojekt under månaden</div></div></div><div className="font-mono font-bold text-white">{formatMoney(data.breakdown.dreamSpending)}</div></div><div className="flex justify-between items-center p-3 bg-emerald-900/20 border border-emerald-500/30 rounded-xl"><div className="flex items-center gap-3"><div className="p-2 bg-emerald-500/20 rounded-lg text-emerald-400"><Rocket size={16} /></div><div><div className="text-sm font-bold text-white">Drömmar: Månadssparande</div><div className="text-[10px] text-slate-500">Avsättning till mål</div></div></div><div className="font-mono font-bold text-white">{formatMoney(data.breakdown.dreamSaving)}</div></div><div className="flex justify-between items-center p-3 bg-indigo-900/20 border border-indigo-500/30 rounded-xl"><div className="flex items-center gap-3"><div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400"><PiggyBank size={16} /></div><div><div className="text-sm font-bold text-white">Investeringar & Sparande</div><div className="text-[10px] text-slate-500">Allmänt buffertsparande</div></div></div><div className="font-mono font-bold text-white">{formatMoney(data.breakdown.generalSaving)}</div></div><div className="flex justify-between items-center p-3 bg-blue-900/20 border border-blue-500/30 rounded-xl"><div className="flex items-center gap-3"><div className="p-2 bg-blue-500/20 rounded-lg text-blue-400"><Calendar size={16} /></div><div><div className="text-sm font-bold text-white">Drift: Fasta kostnader</div><div className="text-[10px] text-slate-500">Hyra, el, försäkring etc.</div></div></div><div className="font-mono font-bold text-white">{formatMoney(data.breakdown.fixedOps)}</div></div><div className="flex justify-between items-center p-3 bg-orange-900/20 border border-orange-500/30 rounded-xl"><div className="flex items-center gap-3"><div className="p-2 bg-orange-500/20 rounded-lg text-orange-400"><Activity size={16} /></div><div><div className="text-sm font-bold text-white">Drift: Rörliga kostnader</div><div className="text-[10px] text-slate-500">Mat, shopping, nöje</div></div></div><div className="font-mono font-bold text-white">{formatMoney(data.breakdown.variableOps)}</div></div></div><Button variant="secondary" onClick={() => setIsTotalBreakdownOpen(false)} className="w-full">Stäng</Button></div></Modal>
      <EmojiPickerModal isOpen={!!iconPickerTarget} onClose={() => setIconPickerTarget(null)} onSelect={handleIconSelect} title={iconPickerTarget ? `Ikon för ${iconPickerTarget.name}` : undefined} />
      
      <Modal isOpen={!!resetTarget} onClose={() => setResetTarget(null)} title="Återställ till mall">
          {resetTarget && (
              <div className="space-y-4">
                  <p className="text-sm text-slate-300">Posten <span className="font-bold text-white">{resetTarget.name}</span> avviker från budgetmallen. Vill du återställa värdet?</p>
                  <div className="flex justify-between items-center bg-slate-800 p-4 rounded-xl border border-slate-700">
                      <div>
                          <div className="text-[10px] text-slate-500 uppercase font-bold">Nuvarande</div>
                          <div className="text-xl font-bold text-amber-400 line-through">{resetTarget.currentValue}</div>
                      </div>
                      <div className="text-slate-500"><ArrowRight size={20}/></div>
                      <div className="text-right">
                          <div className="text-[10px] text-slate-500 uppercase font-bold">Mallvärde</div>
                          <div className="text-xl font-bold text-white">{resetTarget.templateValue}</div>
                      </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                      <Button variant="secondary" className="flex-1" onClick={() => setResetTarget(null)}>Avbryt</Button>
                      <Button className="flex-1 bg-blue-600 hover:bg-blue-500" onClick={confirmReset}>Återställ</Button>
                  </div>
              </div>
          )}
      </Modal>

      <Modal isOpen={!!unlockTarget} onClose={() => setUnlockTarget(null)} title="Lås upp månad">
          <div className="space-y-6">
              <div className="bg-amber-500/10 p-4 rounded-xl border border-amber-500/20 flex gap-3 items-start">
                  <Unlock className="text-amber-400 w-6 h-6 shrink-0 mt-0.5" />
                  <div>
                      <h4 className="text-amber-200 font-bold">Vill du återställa till mall?</h4>
                      <p className="text-amber-200/70 text-xs mt-1 leading-relaxed">
                          När du låser upp månaden kan du välja att rensa alla tillfälliga avvikelser och synka helt mot budgetmallen ({activeTemplateName}). 
                          Detta gör även att nya poster du lagt till i mallen dyker upp här.
                      </p>
                  </div>
              </div>

              <div className="space-y-3">
                  <button onClick={() => confirmUnlock(true)} className="w-full flex items-center gap-3 p-4 rounded-xl border border-blue-500/30 bg-blue-900/10 hover:bg-blue-900/20 text-left transition-all">
                      <div className="p-2 bg-blue-600 rounded-lg text-white"><RotateCcw size={18}/></div>
                      <div>
                          <div className="font-bold text-white">Ja, återställ helt</div>
                          <div className="text-xs text-slate-400">Lås upp och rensa alla månadens ändringar för att matcha mallen exakt.</div>
                      </div>
                  </button>
                  <button onClick={() => confirmUnlock(false)} className="w-full flex items-center gap-3 p-4 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-left transition-all">
                      <div className="p-2 bg-slate-700 rounded-lg text-white"><Unlock size={18}/></div>
                      <div>
                          <div className="font-bold text-white">Nej, behåll mina ändringar</div>
                          <div className="text-xs text-slate-400">Lås bara upp utan att ändra några värden.</div>
                      </div>
                  </button>
                  <Button variant="secondary" onClick={() => setUnlockTarget(null)} className="w-full">Avbryt</Button>
              </div>
          </div>
      </Modal>

      <Modal isOpen={!!drillDownData} onClose={() => setDrillDownData(null)} title={drillDownData?.title || 'Transaktioner'}>{drillDownData && (<div className="space-y-4"><div className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex justify-between items-center shadow-sm"><span className="text-slate-400 text-sm font-medium uppercase tracking-wider">Totalt Utfall</span><span className="text-2xl font-bold font-mono text-white">{formatMoney(drillDownData.transactions.reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0))}</span></div><div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">{drillDownData.transactions.length > 0 ? (drillDownData.transactions.map(t => { const effAmount = getEffectiveAmount(t, reimbursementMap); const isReimbursed = effAmount !== t.amount; return (<div key={t.id} className="flex justify-between items-center p-3 bg-slate-900/50 border border-slate-800 rounded-lg"><div className="flex-1 mr-4 overflow-hidden"><div className="text-white font-medium truncate">{t.description}</div><div className="text-xs text-slate-500">{t.date}</div></div><div className="text-right"><div className="font-mono font-bold text-white whitespace-nowrap">{formatMoney(Math.abs(effAmount))}</div>{isReimbursed && <div className="text-[10px] text-emerald-400 flex items-center justify-end gap-1"><Link size={8} /> Orig: {formatMoney(Math.abs(t.amount))}</div>}</div></div>); })) : <div className="text-center text-slate-500 py-8 italic">Inga transaktioner hittades.</div>}</div></div>)}<div className="mt-4 border-t border-slate-700 pt-4 flex justify-end"><Button variant="secondary" onClick={() => setDrillDownData(null)}>Stäng</Button></div></Modal>
      <Modal isOpen={isGroupModalOpen} onClose={() => setIsGroupModalOpen(false)} title={editingGroup?.id ? "Inställningar" : "Ny Grupp"}>{editingGroup && (<div className="space-y-4"><Input label="Namn" value={editingGroup.name} onChange={e => setEditingGroup({...editingGroup, name: e.target.value})} /><div><label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">Prognos & Typ</label><div className="flex bg-slate-900 rounded-lg p-1"><button onClick={() => setEditingGroup({...editingGroup, forecastType: 'VARIABLE'})} className={cn("flex-1 py-2 text-xs rounded transition-all flex items-center justify-center gap-2", (!editingGroup.forecastType || editingGroup.forecastType === 'VARIABLE') ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-white")}><Activity size={14} /> Rörlig</button><button onClick={() => setEditingGroup({...editingGroup, forecastType: 'FIXED'})} className={cn("flex-1 py-2 text-xs rounded transition-all flex items-center justify-center gap-2", editingGroup.forecastType === 'FIXED' ? "bg-blue-600 text-white shadow" : "text-slate-400 hover:text-white")}><Calendar size={14} /> Fasta</button><button onClick={() => setEditingGroup({...editingGroup, forecastType: 'SAVINGS'})} className={cn("flex-1 py-2 text-xs rounded transition-all flex items-center justify-center gap-2", editingGroup.forecastType === 'SAVINGS' ? "bg-emerald-600 text-white shadow" : "text-slate-400 hover:text-white")}><PiggyBank size={14} /> Sparande</button></div></div><div><label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">Finansierande Konto</label><select className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white" value={editingGroup.defaultAccountId || ''} onChange={(e) => setEditingGroup({...editingGroup, defaultAccountId: e.target.value})}><option value="">-- Välj Konto --</option>{accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.icon} {acc.name}</option>)}</select></div><div className="pt-2 border-t border-slate-700"><label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Manuell Budget (Reserv)</label><div className="flex items-center gap-2"><input type="number" className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white flex-1 font-mono" value={editingLimit || ''} onChange={(e) => setEditingLimit(Number(e.target.value))} placeholder="0" /><span className="text-slate-500">kr</span></div></div><Button onClick={saveGroup} className="w-full">Spara</Button></div>)}</Modal>
      
      <Modal isOpen={isSubModalOpen} onClose={() => setIsSubModalOpen(false)} title="Redigera Kategori">
          {editingSubCategory && (
              <div className="space-y-4">
                  <Input label="Namn" value={editingSubCategory.name} onChange={e => setEditingSubCategory({...editingSubCategory, name: e.target.value})} />
                  <Input label="Budgetbelopp" type="number" value={editingSubBudget} onChange={e => setEditingSubBudget(Number(e.target.value))} />
                  <div>
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">Konto</label>
                      <select className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white" value={editingSubCategory.accountId || ''} onChange={(e) => setEditingSubCategory({...editingSubCategory, accountId: e.target.value || undefined})}>
                          <option value="">Använd Gruppens Konto (Förvalt)</option>
                          {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.icon} {acc.name}</option>)}
                      </select>
                  </div>
                  <div className="bg-slate-800 p-3 rounded-xl border border-slate-700">
                      <label className="flex items-center gap-3 cursor-pointer">
                          <input type="checkbox" className="rounded bg-slate-900 border-slate-600 w-5 h-5 text-emerald-500" checked={!!editingSubCategory.isSavings} onChange={(e) => setEditingSubCategory({...editingSubCategory, isSavings: e.target.checked})} />
                          <div>
                              <div className="text-sm font-bold text-white flex items-center gap-2">Är detta ett sparande? <PiggyBank size={14} className="text-emerald-400"/></div>
                              <div className="text-[10px] text-slate-400">Markeras som sparande i översikten.</div>
                          </div>
                      </label>
                  </div>
                  <div className="flex gap-2">
                      <Button variant="secondary" onClick={() => { openMoveModalSub(editingSubCategory); setIsSubModalOpen(false); }} className="flex-1">Flytta</Button>
                      <Button variant="secondary" onClick={() => { handleUnlinkSubCategory(editingSubCategory); setIsSubModalOpen(false); }} className="flex-1 text-rose-400 border-rose-900 hover:bg-rose-950">Koppla loss</Button>
                  </div>
                  <div className="space-y-3 pt-4 border-t border-slate-700">
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Spara ändring</div>
                      <div className="grid grid-cols-2 gap-3">
                          <button onClick={() => saveSubCategory('TEMPLATE')} className="flex flex-col items-center gap-1 p-3 rounded-xl border border-blue-500/30 bg-blue-900/10 hover:bg-blue-900/20 text-blue-200 transition-all group">
                              <div className="p-2 bg-blue-600 rounded-lg text-white group-hover:scale-110 transition-transform"><Save size={16}/></div>
                              <span className="text-[10px] font-bold uppercase">I Mallen</span>
                          </button>
                          <button onClick={() => saveSubCategory('OVERRIDE')} className="flex flex-col items-center gap-1 p-3 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-750 text-slate-300 transition-all group">
                              <div className="p-2 bg-slate-700 rounded-lg text-white group-hover:scale-110 transition-transform"><Calendar size={16}/></div>
                              <span className="text-[10px] font-bold uppercase">Bara nu</span>
                          </button>
                      </div>
                  </div>
              </div>
          )}
      </Modal>

      <Modal isOpen={isMoveModalOpen} onClose={() => setIsMoveModalOpen(false)} title="Flytta">{(movingSubCategory || movingBucket) && (<div className="space-y-4"><p className="text-sm text-slate-300">Välj budgetgrupp.</p><div className="space-y-2">{budgetGroups.map(g => (<button key={g.id} onClick={async () => { if (movingSubCategory) await handleMoveSubCategory(movingSubCategory, g.id); if (movingBucket) await handleMoveBucket(movingBucket, g.id); setIsMoveModalOpen(false); }} className={cn("w-full text-left p-3 rounded-lg border transition-all flex items-center gap-3", g.id === (movingSubCategory ? movingSubCategory.budgetGroupId : movingBucket?.budgetGroupId) ? "bg-blue-600/20 border-blue-500 text-blue-200" : "bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-300")}><span className="text-xl">{g.icon}</span><span className="font-bold text-sm">{g.name}</span></button>))}<button onClick={async () => { if (movingSubCategory) await handleUnlinkSubCategory(movingSubCategory); if (movingBucket) await handleUnlinkBucket(movingBucket); setIsMoveModalOpen(false); }} className="w-full text-left p-3 rounded-lg border border-dashed border-slate-600 text-slate-400 hover:text-white hover:bg-slate-800"><span className="text-sm">Ta bort från grupp</span></button></div></div>)}</Modal>
      <Modal isOpen={isCatPickerOpen} onClose={() => setIsCatPickerOpen(false)} title="Välj Kategori"><div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">{mainCategories.map(main => { const unlinkedSubs = subCategories.filter(s => s.mainCategoryId === main.id && !s.budgetGroupId); if (unlinkedSubs.length === 0) return null; return (<div key={main.id} className="space-y-1"><h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider py-1 pl-1">{main.name}</h4><div className="space-y-1">{unlinkedSubs.map(sub => (<button key={sub.id} onClick={() => { if (activeGroupId) { handleMoveSubCategory(sub, activeGroupId); setIsCatPickerOpen(false); }}} className="w-full text-left bg-slate-800 p-3 rounded-lg border border-slate-700 hover:bg-slate-700 transition-colors flex justify-between items-center group"><div><div className="font-bold text-white text-sm">{sub.name}</div></div><Plus size={16} className="text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity" /></button>))}</div></div>); })}</div></Modal>
      
      <Modal isOpen={isBucketModalOpen} onClose={() => setIsBucketModalOpen(false)} title={editingBucket?.id && buckets.find(b => b.id === editingBucket.id) ? "Inställningar" : "Ny Budgetpost"}>
          {editingBucket && (
              <div className="space-y-4">
                  <Input label="Namn" value={editingBucket.name} onChange={e => setEditingBucket({...editingBucket, name: e.target.value})} autoFocus />
                  <div>
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">Konto</label>
                      <select className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-all" value={editingBucket.accountId || ''} onChange={(e) => setEditingBucket({...editingBucket, accountId: e.target.value})}>
                          <option value="">Använd Gruppens Konto (Förvalt)</option>
                          {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.icon} {acc.name}</option>)}
                      </select>
                  </div>
                  <div className="bg-slate-800 p-3 rounded-xl border border-slate-700">
                      <label className="flex items-center gap-3 cursor-pointer">
                          <input type="checkbox" className="rounded bg-slate-900 border-slate-600 w-5 h-5 text-emerald-500" checked={!!editingBucket.isSavings} onChange={(e) => setEditingBucket({...editingBucket, isSavings: e.target.checked})} />
                          <div>
                              <div className="text-sm font-bold text-white flex items-center gap-2">Är detta ett sparande? <PiggyBank size={14} className="text-emerald-400"/></div>
                              <div className="text-[10px] text-slate-400">Markeras som sparande i översikten.</div>
                          </div>
                      </label>
                  </div>
                  <div className="flex bg-slate-900 rounded-lg p-1">
                      <button onClick={() => setEditingBucket({...editingBucket, type: 'FIXED'})} className={cn("flex-1 py-2 text-xs rounded transition-all", editingBucket.type === 'FIXED' ? "bg-blue-600 text-white shadow" : "text-slate-400 hover:text-white")}>Fast</button>
                      <button onClick={() => setEditingBucket({...editingBucket, type: 'DAILY'})} className={cn("flex-1 py-2 text-xs rounded transition-all", editingBucket.type === 'DAILY' ? "bg-orange-600 text-white shadow" : "text-slate-400 hover:text-white")}>Daglig</button>
                      <button onClick={() => setEditingBucket({...editingBucket, type: 'GOAL'})} className={cn("flex-1 py-2 text-xs rounded transition-all", editingBucket.type === 'GOAL' ? "bg-purple-600 text-white shadow" : "text-slate-400 hover:text-white")}>Mål/Dröm</button>
                  </div>
                  {editingBucket.type === 'FIXED' && (
                      <div className="space-y-2 animate-in fade-in">
                          <Input label="Månadsbelopp" type="number" value={editingBucketData.amount} onChange={e => setEditingBucketData({...editingBucketData, amount: Number(e.target.value)})} />
                      </div>
                  )}
                  {editingBucket.type === 'DAILY' && (
                      <div className="space-y-4 animate-in fade-in">
                          <Input label="Dagligt belopp" type="number" value={editingBucketData.dailyAmount} onChange={e => setEditingBucketData({...editingBucketData, dailyAmount: Number(e.target.value)})} />
                          <div>
                              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Aktiva dagar</label>
                              <div className="flex gap-1">
                                  {[1, 2, 3, 4, 5, 6, 0].map(day => (
                                      <button key={day} onClick={() => toggleEditingDay(day)} className={cn("flex-1 aspect-square rounded-lg text-xs font-bold transition-all border", editingBucketData.activeDays.includes(day) ? "bg-orange-600 border-orange-400 text-white shadow-lg" : "bg-slate-900 border-slate-700 text-slate-500")}>
                                          {DAYS_SHORT[day]}
                                      </button>
                                  ))}
                              </div>
                          </div>
                      </div>
                  )}
                  {editingBucket.type === 'GOAL' && (
                      <div className="space-y-4 animate-in fade-in">
                          <Input label="Målbelopp" type="number" value={editingBucket.targetAmount} onChange={e => setEditingBucket({...editingBucket, targetAmount: Number(e.target.value)})} />
                          <div className="grid grid-cols-2 gap-4">
                              <Input label="Startdatum" type="month" value={editingBucket.startSavingDate} onChange={e => setEditingBucket({...editingBucket, startSavingDate: e.target.value})} />
                              <Input label="Slutdatum" type="month" value={editingBucket.targetDate} onChange={e => setEditingBucket({...editingBucket, targetDate: e.target.value})} />
                          </div>
                          <div className="space-y-3 pt-2">
                              <div className="text-xs font-medium text-slate-400 uppercase">Finansiering</div>
                              <div className="flex flex-col gap-2">
                                  <button onClick={() => setEditingBucket({...editingBucket, paymentSource: 'INCOME'})} className={cn("p-3 rounded-xl border text-left flex items-center gap-3", editingBucket.paymentSource === 'INCOME' ? "bg-purple-500/20 border-purple-500 text-white" : "border-slate-700 text-slate-400")}>
                                      <Wallet className="w-5 h-5" />
                                      <div><div className="font-bold text-sm">Från Månadslön</div></div>
                                  </button>
                                  <button onClick={() => setEditingBucket({...editingBucket, paymentSource: 'BALANCE'})} className={cn("p-3 rounded-xl border text-left flex items-center gap-3", editingBucket.paymentSource === 'BALANCE' ? "bg-amber-500/20 border-amber-500 text-white" : "border-slate-700 text-slate-400")}>
                                      <PiggyBank size={16} className="w-5 h-5" />
                                      <div><div className="font-bold text-sm">Från Sparade Medel</div></div>
                                  </button>
                              </div>
                          </div>
                      </div>
                  )}
                  <div className="flex gap-2 pt-2">
                      {buckets.find(b => b.id === editingBucket.id) && (
                          <Button variant="danger" onClick={deleteBucketHandler}><Trash2 size={16}/></Button>
                      )}
                      <div className="flex-1"></div>
                  </div>
                  <div className="space-y-3 pt-4 border-t border-slate-700">
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Välj var beloppet ska sparas</div>
                      <div className="grid grid-cols-2 gap-3">
                          <button onClick={() => saveBucketSettings('TEMPLATE')} className="flex flex-col items-center gap-1 p-3 rounded-xl border border-blue-500/30 bg-blue-900/10 hover:bg-blue-900/20 text-blue-200 transition-all group">
                              <div className="p-2 bg-blue-600 rounded-lg text-white group-hover:scale-110 transition-transform"><Save size={16}/></div>
                              <span className="text-[10px] font-bold uppercase">I Mallen</span>
                          </button>
                          <button onClick={() => saveBucketSettings('OVERRIDE')} className="flex flex-col items-center gap-1 p-3 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-750 text-slate-300 transition-all group">
                              <div className="p-2 bg-slate-700 rounded-lg text-white group-hover:scale-110 transition-transform"><Calendar size={16}/></div>
                              <span className="text-[10px] font-bold uppercase">Bara nu</span>
                          </button>
                      </div>
                  </div>
              </div>
          )}
      </Modal>
      
      <Modal isOpen={isTemplatePickerOpen} onClose={() => setIsTemplatePickerOpen(false)} title="Välj Budgetmall"><div className="space-y-2">{budgetTemplates.map(t => (<button key={t.id} onClick={() => { assignTemplateToMonth(selectedMonth, t.id); setIsTemplatePickerOpen(false); }} className={cn("w-full text-left p-3 rounded-lg border flex items-center justify-between transition-all", t.id === activeTemplateId ? "bg-blue-600/20 border-blue-500 text-white" : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700")}><span className="font-bold">{t.name}</span></button>))}</div><div className="mt-4 pt-4 border-t border-slate-700"><Button variant="secondary" onClick={() => setIsTemplatePickerOpen(false)} className="w-full">Avbryt</Button></div></Modal>
    </div>
  );
};
