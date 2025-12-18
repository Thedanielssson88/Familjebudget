
import React, { useMemo, useState } from 'react';
import { useApp } from '../store';
import { useBudgetMonth } from '../hooks/useBudgetMonth';
import { formatMoney, getEffectiveBudgetGroupData, getEffectiveSubCategoryBudget, calculateFixedBucketCost, calculateDailyBucketCost, calculateGoalBucketCost, calculateReimbursementMap, getEffectiveAmount, getSubCategoryAverage, generateId, getEffectiveBucketData, isBucketActiveInMonth, getBudgetInterval } from '../utils';
import { ChevronRight, ChevronDown, Check, AlertTriangle, PieChart, Edit2, Plus, Trash2, Settings, ArrowRightLeft, Rocket, Calendar, Plane, RefreshCw, Lock, Unlock, ChevronUp, BarChart3, Wallet, Link2, X, PiggyBank, FolderInput, ArrowRight, Link, Save, Copy, LayoutTemplate, Activity, RotateCcw, CreditCard, Target, Info, Landmark } from 'lucide-react';
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

// Extend Bucket for View purposes
interface DisplayBucket extends Bucket {
    cost: number;
    spent: number;
    transactions: Transaction[];
    displayMode: 'STANDARD' | 'SAVING' | 'SPENDING'; // Distinguish between saving phase and spending phase
    displayName: string;
}

export const OperatingBudgetView: React.FC = () => {
  const { 
      selectedMonth, budgetGroups, subCategories, mainCategories, transactions, 
      buckets, accounts, settings, addBudgetGroup, updateBudgetGroup, 
      deleteBudgetGroup, updateSubCategory, addSubCategory, addBucket, updateBucket, deleteBucket,
      budgetTemplates, monthConfigs, setBudgetLimit, toggleMonthLock, assignTemplateToMonth, clearBudgetOverride
  } = useApp();
  
  const { startStr, endStr, intervalLabel, start, end } = useBudgetMonth(selectedMonth);

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  
  // --- STATE: ICON PICKER ---
  const [iconPickerTarget, setIconPickerTarget] = useState<{ type: 'GROUP'|'SUB'|'BUCKET', id: string, name: string } | null>(null);

  // --- STATE: GROUP EDIT MODAL ---
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<BudgetGroup | null>(null);
  const [editingLimit, setEditingLimit] = useState<number>(0);
  const [deleteMode, setDeleteMode] = useState(false);
  const [showGroupSettings, setShowGroupSettings] = useState(false);

  // --- STATE: BUDGET UPDATE DECISION MODAL ---
  const [pendingBudgetUpdate, setPendingBudgetUpdate] = useState<{ type: 'GROUP'|'SUB'|'BUCKET', id: string, amount: number | BucketData } | null>(null);

  // --- STATE: RESET OVERRIDE MODAL ---
  const [resetTarget, setResetTarget] = useState<{ type: 'GROUP'|'SUB'|'BUCKET', id: string, name: string, currentValue: string, templateValue: string } | null>(null);

  // --- STATE: CATEGORY PICKER MODAL ---
  const [isCatPickerOpen, setIsCatPickerOpen] = useState(false);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  
  // --- STATE: SUB-CATEGORY EDITING (INLINE) ---
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [tempSubBudget, setTempSubBudget] = useState<string>('');

  // --- STATE: SUB-CATEGORY MODAL (Settings) ---
  const [isSubModalOpen, setIsSubModalOpen] = useState(false);
  const [editingSubCategory, setEditingSubCategory] = useState<SubCategory | null>(null);

  // --- STATE: MOVE MODAL (Category OR Bucket) ---
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [movingSubCategory, setMovingSubCategory] = useState<SubCategory | null>(null);
  const [movingBucket, setMovingBucket] = useState<Bucket | null>(null);

  // --- STATE: BUCKET (CUSTOM POST) MODAL ---
  const [isBucketModalOpen, setIsBucketModalOpen] = useState(false);
  const [editingBucket, setEditingBucket] = useState<Bucket | null>(null);
  const [editingBucketData, setEditingBucketData] = useState<BucketData>({ amount: 0, dailyAmount: 0, activeDays: [] });
  const [showBucketDetails, setShowBucketDetails] = useState(false);
  // Special flag to indicate we are editing the "Monthly Saving Amount" for a goal, not the goal itself
  const [isEditingGoalSaving, setIsEditingGoalSaving] = useState(false); 

  // --- STATE: TEMPLATE PICKER MODAL ---
  const [isTemplatePickerOpen, setIsTemplatePickerOpen] = useState(false);

  // --- STATE: TOTAL BUDGET DRILL DOWN ---
  const [isTotalBreakdownOpen, setIsTotalBreakdownOpen] = useState(false);

  // --- STATE: DRILL DOWN (TRANSACTIONS) ---
  const [drillDownData, setDrillDownData] = useState<{ title: string, transactions: Transaction[] } | null>(null);

  // --- REIMBURSEMENTS ---
  const reimbursementMap = useMemo(() => calculateReimbursementMap(transactions), [transactions]);

  // Check if month is locked
  const isMonthLocked = useMemo(() => {
      const config = monthConfigs.find(c => c.monthKey === selectedMonth);
      return config?.isLocked || false;
  }, [monthConfigs, selectedMonth]);

  // Determine Active Template ID and Object for this month
  const activeTemplateId = useMemo(() => {
      const config = monthConfigs.find(c => c.monthKey === selectedMonth);
      if (config?.templateId) return config.templateId;
      return budgetTemplates.find(t => t.isDefault)?.id || '';
  }, [selectedMonth, monthConfigs, budgetTemplates]);

  const activeTemplate = useMemo(() => budgetTemplates.find(t => t.id === activeTemplateId), [activeTemplateId, budgetTemplates]);
  const currentMonthConfig = useMemo(() => monthConfigs.find(c => c.monthKey === selectedMonth), [monthConfigs, selectedMonth]);

  // --- HELPERS ---
  const getSubCategoryTxs = (subId: string) => {
      return transactions.filter(t => 
          !t.isHidden && 
          t.categorySubId === subId && 
          !t.bucketId && // Ensure transactions linked to a bucket only show up there
          t.date >= startStr && 
          t.date <= endStr &&
          // Ensure we only count expenses
          (t.type === 'EXPENSE' || (!t.type && t.amount < 0))
      );
  };

  const getBucketTxs = (bucketId: string) => {
      return transactions.filter(t => 
          !t.isHidden &&
          t.bucketId === bucketId &&
          t.date >= startStr &&
          t.date <= endStr &&
          // Ensure we only count expenses (not funding transfers in)
          (t.type === 'EXPENSE' || (!t.type && t.amount < 0))
      );
  };

  // --- DATA PROCESSING ---
  const data = useMemo(() => {
      let dreamSpending = 0;
      let dreamSaving = 0;
      let generalSaving = 0;
      let fixedOps = 0;
      let variableOps = 0;

      const groups = budgetGroups.map(group => {
          // 1. Get Linked Subcategories
          const linkedSubs = subCategories.filter(s => s.budgetGroupId === group.id).map(sub => {
              const txs = getSubCategoryTxs(sub.id);
              const spent = txs.reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);
              const budget = getEffectiveSubCategoryBudget(sub, selectedMonth, budgetTemplates, monthConfigs);
              
              // Tally for breakdown
              if (sub.isSavings || group.forecastType === 'SAVINGS') {
                  generalSaving += budget;
              } else if (group.forecastType === 'FIXED') {
                  fixedOps += budget;
              } else {
                  variableOps += budget;
              }

              return {
                  ...sub,
                  spent,
                  transactions: txs,
                  avgSpend: getSubCategoryAverage(sub.id, selectedMonth, transactions, reimbursementMap),
                  budget
              };
          });

          const subTotalBudget = linkedSubs.reduce((sum, s) => sum + s.budget, 0);
          const subTotalSpent = linkedSubs.reduce((sum, s) => sum + s.spent, 0);
          const allSubTxs = linkedSubs.flatMap(s => s.transactions);

          // 2. Get Linked Custom Buckets (Fixed, Daily, Goals)
          const linkedBuckets = buckets.filter(b => {
              const isExplicitlyLinked = b.budgetGroupId 
                  ? b.budgetGroupId === group.id 
                  : (group.linkedBucketIds && group.linkedBucketIds.includes(b.id));
              
              const isOrphan = !b.budgetGroupId && (!group.linkedBucketIds || !group.linkedBucketIds.includes(b.id));
              const isClaimedByCatchAll = group.isCatchAll && isOrphan;

              if (!isExplicitlyLinked && !isClaimedByCatchAll) return false;
              return true;
          });

          // Process Buckets into Display Items
          const displayBuckets: DisplayBucket[] = [];

          linkedBuckets.forEach(b => {
              const txs = getBucketTxs(b.id);
              const spent = txs.reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);
              
              if (b.type === 'GOAL') {
                  // --- GOAL LOGIC (Split into Saving & Spending) ---
                  
                  // 1. SAVING PHASE (Cost)
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

                  if (showSaving) {
                      displayBuckets.push({
                          ...b,
                          cost: savingAmount,
                          spent: 0,
                          transactions: [],
                          displayMode: 'SAVING',
                          displayName: `Spara: ${b.name}`
                      });
                  }

                  // 2. SPENDING PHASE (Consumption)
                  let showSpending = false;
                  if (spent > 0) showSpending = true;
                  else {
                      const current = parseISO(`${selectedMonth}-01`);
                      if (b.targetDate) {
                          const target = parseISO(`${b.targetDate}-01`);
                          if (isValid(target) && isSameMonth(current, target)) showSpending = true;
                      }
                      if (b.eventStartDate && b.eventEndDate) {
                          const evtStart = parseISO(b.eventStartDate);
                          const evtEnd = parseISO(b.eventEndDate);
                          if (isValid(evtStart) && isValid(evtEnd)) {
                              if (!isAfter(start, evtEnd) && !isBefore(end, evtStart)) {
                                  showSpending = true;
                              }
                          }
                      }
                  }

                  if (showSpending) {
                      const { start } = getBudgetInterval(selectedMonth, settings.payday);
                      const currentStartStr = format(start, 'yyyy-MM-dd');
                      const pastSpent = transactions
                        .filter(t => 
                            !t.isHidden &&
                            t.bucketId === b.id && 
                            t.date < currentStartStr && 
                            (t.type === 'EXPENSE' || (!t.type && t.amount < 0))
                        )
                        .reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);
                      
                      const remainingProjectBudget = Math.max(0, b.targetAmount - pastSpent);
                      dreamSpending += remainingProjectBudget;

                      displayBuckets.push({
                          ...b,
                          cost: remainingProjectBudget,
                          spent,
                          transactions: txs,
                          displayMode: 'SPENDING',
                          displayName: b.name
                      });
                  }

              } else {
                  // --- FIXED / DAILY LOGIC ---
                  let cost = 0;
                  if (b.type === 'FIXED') {
                      const { data } = getEffectiveBucketData(b, selectedMonth, budgetTemplates, monthConfigs);
                      cost = data ? data.amount : 0;
                  } else if (b.type === 'DAILY') {
                      const { data } = getEffectiveBucketData(b, selectedMonth, budgetTemplates, monthConfigs);
                      if (data) {
                          const days = eachDayOfInterval({ start, end });
                          let count = 0;
                          days.forEach(day => {
                              if (data.activeDays.includes(getDay(day))) {
                                  count++;
                              }
                          });
                          cost = count * data.dailyAmount;
                      }
                  }

                  const isActive = cost > 0 || spent > 0 || isBucketActiveInMonth(b, selectedMonth);

                  if (isActive) {
                      // Breakdown tally
                      if (b.isSavings || group.forecastType === 'SAVINGS') {
                          generalSaving += cost;
                      } else if (group.forecastType === 'FIXED') {
                          fixedOps += cost;
                      } else {
                          variableOps += cost;
                      }

                      displayBuckets.push({
                          ...b,
                          cost,
                          spent,
                          transactions: txs,
                          displayMode: 'STANDARD',
                          displayName: b.name
                      });
                  }
              }
          });

          const bucketTotalCost = displayBuckets.reduce((sum, b) => sum + b.cost, 0);
          const bucketTotalSpent = displayBuckets.reduce((sum, b) => sum + b.spent, 0);

          // 3. Determine Group Total Budget
          let totalBudget = 0;
          let isAuto = false;
          const hasChildren = linkedSubs.length > 0 || displayBuckets.length > 0;

          const { data: explicitData, templateName } = getEffectiveBudgetGroupData(group, selectedMonth, budgetTemplates, monthConfigs);
          const manualLimit = explicitData ? explicitData.limit : 0;

          if (hasChildren) {
              const calculatedTotal = subTotalBudget + bucketTotalCost;
              totalBudget = Math.max(calculatedTotal, manualLimit);
              isAuto = true;
              
              // Handle unallocated buffer in the breakdown tally
              const buffer = totalBudget - calculatedTotal;
              if (buffer > 0) {
                  if (group.forecastType === 'SAVINGS') generalSaving += buffer;
                  else if (group.forecastType === 'FIXED') fixedOps += buffer;
                  else variableOps += buffer;
              }
          } else {
              totalBudget = manualLimit;
              // Group has no children but manual limit
              if (totalBudget > 0) {
                  if (group.forecastType === 'SAVINGS') generalSaving += totalBudget;
                  else if (group.forecastType === 'FIXED') fixedOps += totalBudget;
                  else variableOps += totalBudget;
              }
          }

          // 4. Actual spent
          let extraSpent = 0;
          let catchAllTxs: Transaction[] = [];
          if (group.isCatchAll) {
              catchAllTxs = transactions.filter(t => 
                  !t.isHidden && t.date >= startStr && t.date <= endStr &&
                  (t.type === 'EXPENSE' || (!t.type && t.amount < 0)) &&
                  t.type !== 'TRANSFER' && t.type !== 'INCOME' && !t.bucketId &&
                  (!t.categorySubId || !subCategories.find(s => s.id === t.categorySubId)?.budgetGroupId)
              );
              extraSpent = catchAllTxs.reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);
          }

          return {
              ...group,
              totalBudget,
              totalSpent: subTotalSpent + bucketTotalSpent + extraSpent,
              isAuto, templateName,
              subs: linkedSubs,
              customPosts: displayBuckets,
              allTransactions: [...linkedSubs.flatMap(s => s.transactions), ...displayBuckets.flatMap(b => b.transactions), ...catchAllTxs],
              catchAllTransactions: catchAllTxs,
              extraSpent
          };
      });

      const totalBudget = groups.reduce((sum, g) => sum + g.totalBudget, 0);
      const totalSpent = groups.reduce((sum, g) => sum + g.totalSpent, 0);
      const totalIncome = transactions.filter(t => !t.isHidden && t.type === 'INCOME' && t.date >= startStr && t.date <= endStr).reduce((sum, t) => sum + t.amount, 0);

      return { 
          groups, totalBudget, totalSpent, totalIncome, 
          breakdown: { dreamSpending, dreamSaving, generalSaving, fixedOps, variableOps } 
      };
  }, [budgetGroups, subCategories, buckets, transactions, selectedMonth, settings.payday, startStr, endStr, reimbursementMap, budgetTemplates, monthConfigs, start, end]);

  // --- HANDLERS ---
  const toggleGroup = (id: string) => {
      const next = new Set(expandedGroups);
      if (next.has(id)) next.delete(id); else next.add(id);
      setExpandedGroups(next);
  };

  const startEditingSub = (sub: SubCategory) => {
      if (isMonthLocked) {
          alert("Månaden är låst. Lås upp för att ändra budgeten.");
          return;
      }
      setEditingSubId(sub.id);
      const effectiveBudget = getEffectiveSubCategoryBudget(sub, selectedMonth, budgetTemplates, monthConfigs);
      setTempSubBudget(effectiveBudget.toString());
  };

  const handleSubBudgetSubmit = (sub: SubCategory) => {
      const val = parseFloat(tempSubBudget);
      const amount = isNaN(val) ? 0 : val;
      setPendingBudgetUpdate({ type: 'SUB', id: sub.id, amount });
      setEditingSubId(null);
  };

  const handleBudgetDecision = async (mode: 'TEMPLATE' | 'OVERRIDE') => {
      if (!pendingBudgetUpdate) return;
      await setBudgetLimit(pendingBudgetUpdate.type, pendingBudgetUpdate.id, pendingBudgetUpdate.amount, selectedMonth, mode);
      setPendingBudgetUpdate(null);
      if (isGroupModalOpen) setIsGroupModalOpen(false);
      if (isBucketModalOpen) setIsBucketModalOpen(false);
  };

  const handleResetOverride = (type: 'GROUP'|'SUB'|'BUCKET', id: string, name: string, currentVal: number, templateVal: number) => {
      setResetTarget({ type, id, name, currentValue: formatMoney(currentVal), templateValue: formatMoney(templateVal) });
  };

  const confirmReset = async () => {
      if (!resetTarget) return;
      if (resetTarget.type === 'BUCKET') {
          const bucket = buckets.find(b => b.id === resetTarget.id);
          if (bucket && bucket.type === 'GOAL') {
              const newData = { ...bucket.monthlyData };
              if (newData[selectedMonth]) { delete newData[selectedMonth]; await updateBucket({ ...bucket, monthlyData: newData }); }
              setResetTarget(null);
              return;
          }
      }
      await clearBudgetOverride(resetTarget.type, resetTarget.id, selectedMonth);
      setResetTarget(null);
  };

  const handleIconSelect = async (emoji: string) => {
      if (!iconPickerTarget) return;
      const { type, id } = iconPickerTarget;
      if (type === 'GROUP') {
          const group = budgetGroups.find(g => g.id === id);
          if (group) await updateBudgetGroup({ ...group, icon: emoji });
      } else if (type === 'SUB') {
          const sub = subCategories.find(s => s.id === id);
          if (sub) await updateSubCategory({ ...sub, icon: emoji });
      } else if (type === 'BUCKET') {
          const bucket = buckets.find(b => b.id === id);
          if (bucket) await updateBucket({ ...bucket, icon: emoji });
      }
      setIconPickerTarget(null);
  };

  const handleMoveSubCategory = async (sub: SubCategory, newGroupId: string) => { await updateSubCategory({ ...sub, budgetGroupId: newGroupId }); };
  const handleUnlinkSubCategory = async (sub: SubCategory) => { await updateSubCategory({ ...sub, budgetGroupId: undefined }); };
  const handleMoveBucket = async (bucket: Bucket, newGroupId: string) => { await updateBucket({ ...bucket, budgetGroupId: newGroupId }); };
  const handleUnlinkBucket = async (bucket: Bucket) => { await updateBucket({ ...bucket, budgetGroupId: undefined }); };

  // Fix: Added missing handler to open subcategory settings modal
  const openSubCategorySettings = (sub: SubCategory) => {
      setEditingSubCategory(sub);
      setIsSubModalOpen(true);
  };

  // Fix: Added missing handler to open move modal for a subcategory
  const openMoveModalSub = (sub: SubCategory) => {
      setMovingSubCategory(sub);
      setMovingBucket(null);
      setIsMoveModalOpen(true);
  };

  // Fix: Added missing handler to open move modal for a bucket
  const openMoveModalBucket = (bucket: Bucket) => {
      setMovingBucket(bucket);
      setMovingSubCategory(null);
      setIsMoveModalOpen(true);
  };

  const openGroupModal = (group?: BudgetGroup) => {
      setDeleteMode(false);
      setShowGroupSettings(false);
      if (group) {
          setEditingGroup(group);
          const { data } = getEffectiveBudgetGroupData(group, selectedMonth, budgetTemplates, monthConfigs);
          setEditingLimit(data ? data.limit : 0);
      } else {
          setEditingGroup({ id: '', name: '', icon: '📁', monthlyData: {}, forecastType: 'VARIABLE' });
          setEditingLimit(0);
          setShowGroupSettings(true);
      }
      setIsGroupModalOpen(true);
  };

  const saveGroup = async () => {
      if (!editingGroup) return;
      if (!editingGroup.id) {
          await addBudgetGroup(editingGroup.name, editingLimit, editingGroup.icon || '📁', editingGroup.forecastType || 'VARIABLE');
          setIsGroupModalOpen(false);
      } else {
          const { data } = getEffectiveBudgetGroupData(editingGroup, selectedMonth, budgetTemplates, monthConfigs);
          const currentLimit = data ? data.limit : 0;
          if (editingLimit !== currentLimit) {
              if (isMonthLocked) { alert("Månaden är låst. Lås upp för att ändra beloppet."); return; }
              setPendingBudgetUpdate({ type: 'GROUP', id: editingGroup.id, amount: editingLimit });
          } else {
              await updateBudgetGroup(editingGroup);
              setIsGroupModalOpen(false);
          }
      }
  };

  const openBucketModal = (group: BudgetGroup, bucket?: DisplayBucket) => {
      setActiveGroupId(group.id);
      setShowBucketDetails(false);
      setIsEditingGoalSaving(false);
      if (bucket) {
          setEditingBucket(bucket);
          if (bucket.type === 'GOAL') {
              if (bucket.displayMode === 'SAVING') {
                  setIsEditingGoalSaving(true);
                  setEditingBucketData({ amount: bucket.cost, dailyAmount: 0, activeDays: [] });
              } else {
                  setIsEditingGoalSaving(false);
                  setEditingBucketData({ amount: 0, dailyAmount: 0, activeDays: [] });
              }
          } else {
              const { data } = getEffectiveBucketData(bucket, selectedMonth, budgetTemplates, monthConfigs);
              setEditingBucketData(data || { amount: 0, dailyAmount: 0, activeDays: [1,2,3,4,5] });
          }
      } else {
          setEditingBucket({
              id: generateId(), accountId: '', name: '', type: 'FIXED', isSavings: false,
              paymentSource: 'INCOME', monthlyData: {}, targetAmount: 0,
              targetDate: format(addMonths(new Date(), 12), 'yyyy-MM'),
              startSavingDate: selectedMonth, budgetGroupId: group.id, backgroundImage: DREAM_IMAGES[0]
          });
          setEditingBucketData({ amount: 0, dailyAmount: 0, activeDays: [1,2,3,4,5] });
          setShowBucketDetails(true);
      }
      setIsBucketModalOpen(true);
  };

  const saveBucket = async () => {
      if (!editingBucket) return;
      if (editingBucket.type === 'GOAL' && isEditingGoalSaving) {
          const updatedBucket = { ...editingBucket };
          const newData = { ...updatedBucket.monthlyData };
          newData[selectedMonth] = { ...newData[selectedMonth], amount: editingBucketData.amount, isExplicitlyDeleted: false };
          updatedBucket.monthlyData = newData;
          await updateBucket(updatedBucket);
          setIsBucketModalOpen(false);
          return;
      }
      if (editingBucket.type === 'GOAL' && !isEditingGoalSaving) {
          const bucketToSave = { ...editingBucket, isSavings: true };
          if (buckets.find(b => b.id === bucketToSave.id)) await updateBucket(bucketToSave);
          else await addBucket(bucketToSave);
          setIsBucketModalOpen(false);
          return;
      }
      if (buckets.find(b => b.id === editingBucket.id)) {
          const { data: originalData } = getEffectiveBucketData(editingBucket, selectedMonth, budgetTemplates, monthConfigs);
          const hasAmountChanged = (editingBucket.type === 'FIXED' && originalData?.amount !== editingBucketData.amount) || (editingBucket.type === 'DAILY' && originalData?.dailyAmount !== editingBucketData.dailyAmount);
          await updateBucket(editingBucket);
          if (hasAmountChanged) {
              if (isMonthLocked) { alert("Månaden är låst. Lås upp för att ändra beloppet."); return; }
              setPendingBudgetUpdate({ type: 'BUCKET', id: editingBucket.id, amount: editingBucketData });
              setIsBucketModalOpen(false);
          } else {
              setIsBucketModalOpen(false);
          }
      } else {
          const bucketToSave = { ...editingBucket };
          const newData = { ...editingBucket.monthlyData, [selectedMonth]: editingBucketData };
          bucketToSave.monthlyData = newData;
          await addBucket(bucketToSave);
          setIsBucketModalOpen(false);
      }
  };

  const deleteBucketHandler = async () => { if (editingBucket) { await deleteBucket(editingBucket.id, selectedMonth, 'ALL'); setIsBucketModalOpen(false); } };
  const saveSubCategory = async () => { if (editingSubCategory) { await updateSubCategory(editingSubCategory); setIsSubModalOpen(false); } };
  const openDrillDown = (title: string, txs: Transaction[]) => { if (txs.length > 0) setDrillDownData({ title, transactions: txs }); };

  const activeTemplateName = useMemo(() => {
      if (activeTemplate) return activeTemplate.name;
      const def = budgetTemplates.find(t => t.isDefault);
      return def?.name || 'Standard';
  }, [activeTemplate, budgetTemplates]);

  return (
    <div className="space-y-6 pb-24 animate-in slide-in-from-right duration-300">
      
      {/* HEADER STATS */}
      <div className="grid grid-cols-2 gap-4">
          <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Total Inkomst (Period)</div>
              <div className="text-2xl font-mono font-bold text-emerald-400">{formatMoney(data.totalIncome)}</div>
          </div>
          <div 
            onClick={() => setIsTotalBreakdownOpen(true)}
            className="bg-slate-800 p-4 rounded-2xl border border-slate-700 relative cursor-pointer hover:bg-slate-750 group transition-all"
          >
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 group-hover:text-blue-400 flex items-center gap-1.5 transition-colors">
                  Total Budget <Info size={10} />
              </div>
              <div className="text-2xl font-mono font-bold text-blue-400">{formatMoney(data.totalBudget)}</div>
              
              <button 
                onClick={(e) => { e.stopPropagation(); toggleMonthLock(selectedMonth); }}
                className={cn(
                    "absolute top-4 right-4 p-2 rounded-lg transition-all",
                    isMonthLocked ? "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30" : "bg-slate-700/50 text-slate-400 hover:text-white hover:bg-slate-700"
                )}
              >
                  {isMonthLocked ? <Lock size={16} /> : <Unlock size={16} />}
              </button>
          </div>
      </div>

      {/* TEMPLATE TOOLBAR */}
      <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/50 flex justify-between items-center">
          <div className="flex items-center gap-2 text-slate-400">
              <LayoutTemplate size={16} />
              <span className="text-xs font-bold uppercase tracking-wider">Budgetmall</span>
          </div>
          
          <button 
              onClick={() => !isMonthLocked && setIsTemplatePickerOpen(true)}
              disabled={isMonthLocked}
              className={cn(
                  "flex items-center gap-2 text-sm font-medium transition-colors px-2 py-1 rounded",
                  isMonthLocked ? "text-slate-500 cursor-not-allowed" : "text-white hover:text-blue-400 hover:bg-white/5 cursor-pointer"
              )}
          >
              {isMonthLocked ? <Lock size={12} className="text-amber-500"/> : <Edit2 size={12} className="text-slate-500"/>}
              <span>{activeTemplateName}</span>
          </button>
      </div>

      {/* BUDGET GROUPS LIST */}
      <div className="space-y-4">
          {data.groups.map(group => {
              const isExpanded = expandedGroups.has(group.id);
              const isOver = group.totalSpent > group.totalBudget && group.totalBudget > 0;
              const hasNoAccount = !group.defaultAccountId && !group.isCatchAll;

              return (
                  <div key={group.id} className={cn("bg-surface rounded-xl overflow-hidden border transition-all shadow-md", group.isCatchAll ? "border-dashed border-slate-600" : "border-slate-700")}>
                      <div className="p-4 cursor-pointer hover:bg-slate-800/80 transition-colors relative" onClick={() => toggleGroup(group.id)}>
                          <div className="flex justify-between items-start mb-2">
                              <div className="flex items-center gap-3">
                                  {isExpanded ? <ChevronDown size={5} h={5} className="w-5 h-5 text-blue-400"/> : <ChevronRight size={5} h={5} className="w-5 h-5 text-slate-500"/>}
                                  <div>
                                      <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                          <span className="hover:bg-slate-700/50 p-1 rounded transition-colors" onClick={(e) => { e.stopPropagation(); setIconPickerTarget({ type: 'GROUP', id: group.id, name: group.name }); }}>{group.icon}</span> 
                                          {group.name}
                                          {isOver && <AlertTriangle className="w-4 h-4 text-rose-500" />}
                                      </h3>
                                      <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                                          {group.isAuto ? `Auto (${group.subs.length} kat)` : "Manuell"}
                                          <span className="text-slate-600">•</span>
                                          <span className="text-slate-500">{group.templateName}</span>
                                          {group.forecastType === 'FIXED' && <span className="text-[10px] bg-slate-700 text-slate-300 px-1 rounded ml-1">Fast</span>}
                                          {group.forecastType === 'SAVINGS' && <span className="text-[10px] bg-emerald-900 text-emerald-300 px-1 rounded ml-1 flex items-center gap-0.5"><PiggyBank size={8}/> Sparande</span>}
                                          {isMonthLocked && <Lock size={10} className="text-amber-500 ml-1" />}
                                      </div>
                                  </div>
                              </div>
                              <div className="text-right">
                                  <div className="font-mono font-bold text-white text-lg">{formatMoney(group.totalBudget)}</div>
                                  <div className="text-slate-500 text-xs hover:text-blue-400 hover:underline cursor-pointer mt-0.5" onClick={(e) => { e.stopPropagation(); openDrillDown(`${group.name} - Totalt Utfall`, group.allTransactions); }}>Utfall: {formatMoney(group.totalSpent)}</div>
                              </div>
                          </div>
                          <BudgetProgressBar spent={group.totalSpent} total={group.totalBudget} />
                          {hasNoAccount && (
                              <button onClick={(e) => { e.stopPropagation(); openGroupModal(group); }} className="absolute top-4 right-[45%] bg-rose-500/20 text-rose-400 border border-rose-500/50 p-1.5 rounded-full hover:bg-rose-500 hover:text-white transition-all animate-pulse"><AlertTriangle size={14} /></button>
                          )}
                      </div>

                      {isExpanded && (
                          <div className="bg-slate-900/30 border-t border-slate-700/50 p-3 space-y-6 animate-in slide-in-from-top-2">
                              <div className="flex justify-between items-center">
                                  <button onClick={() => openGroupModal(group)} className={cn("text-xs flex items-center gap-1 px-3 py-1.5 rounded-full border transition-colors", hasNoAccount ? "bg-rose-900/30 border-rose-500 text-rose-300 hover:bg-rose-900/50" : "text-slate-400 hover:text-white bg-slate-800 border-slate-700")}>
                                      {hasNoAccount ? <AlertTriangle size={12}/> : <Settings size={12} />} 
                                      {hasNoAccount ? "Välj Konto (Krävs)" : "Inställningar & Konto"}
                                  </button>
                              </div>
                              <div className="space-y-3">
                                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Kategorier</h4>
                                  {group.subs.map(sub => {
                                      const parent = mainCategories.find(m => m.id === sub.mainCategoryId);
                                      const isEditing = editingSubId === sub.id;
                                      const isOverridden = !!currentMonthConfig?.subCategoryOverrides?.[sub.id];
                                      const templateValue = activeTemplate?.subCategoryBudgets[sub.id] || 0;
                                      return (
                                          <div key={sub.id} className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/50 flex flex-col gap-3">
                                              <div className="flex justify-between items-start">
                                                  <div className="flex items-center gap-3">
                                                      <button className="p-2 bg-slate-900 rounded-lg shrink-0 text-slate-400 hover:bg-slate-700 transition-colors active:scale-90" onClick={() => setIconPickerTarget({ type: 'SUB', id: sub.id, name: sub.name })}>
                                                          {sub.icon ? <span className="text-xl leading-none">{sub.icon}</span> : sub.isSavings ? <PiggyBank size={16} className="text-emerald-400" /> : <CreditCard size={16} className="text-blue-400" />}
                                                      </button>
                                                      <div>
                                                          <div className="font-medium text-base text-slate-200 flex items-center gap-2 cursor-pointer hover:text-blue-400 transition-colors" onClick={() => openSubCategorySettings(sub)}>{sub.name}{sub.accountId && <span className="text-[9px] bg-indigo-500/20 text-indigo-300 px-1 rounded flex items-center gap-0.5"><Wallet size={8}/> Eget konto</span>}</div>
                                                          <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-2"><span>{parent?.name}</span><span>•</span><span>Snitt: {formatMoney(sub.avgSpend)}</span><span>•</span><span className={cn("cursor-pointer hover:underline", sub.spent > 0 ? "text-slate-300 hover:text-blue-400" : "text-slate-500")} onClick={() => openDrillDown(sub.name, sub.transactions)}>Utfall: {formatMoney(sub.spent)}</span></div>
                                                      </div>
                                                  </div>
                                                  <div className="text-right">
                                                      <div className="text-[10px] uppercase font-bold text-slate-500 mb-0.5">Budget</div>
                                                      {isEditing ? <div className="flex items-center gap-1"><input type="number" className="bg-slate-900 border border-slate-600 rounded px-2 py-1 w-20 text-right text-white font-mono text-sm focus:border-blue-500 outline-none" value={tempSubBudget} onChange={(e) => setTempSubBudget(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSubBudgetSubmit(sub)} autoFocus /><button onClick={() => handleSubBudgetSubmit(sub)} className="bg-blue-600 text-white p-1 rounded hover:bg-blue-500"><Check size={14}/></button></div> : <div className="flex items-center justify-end gap-1.5">{isOverridden && !isMonthLocked && <button onClick={(e) => { e.stopPropagation(); handleResetOverride('SUB', sub.id, sub.name, sub.budget, templateValue); }} className="p-1 rounded-full text-amber-400 hover:bg-amber-900/30 transition-colors" title="Avviker från mall."><RotateCcw size={12} /></button>}<div className={cn("text-2xl font-mono font-bold cursor-pointer transition-colors", isMonthLocked ? "text-slate-400 cursor-not-allowed" : (isOverridden ? "text-amber-400 hover:text-amber-300" : "text-white hover:text-blue-400"))} onClick={() => startEditingSub(sub)}>{formatMoney(sub.budget)}</div></div>}
                                                  </div>
                                              </div>
                                          </div>
                                      );
                                  })}
                                  {group.isCatchAll && group.extraSpent > 0 && <div className="bg-rose-950/20 border border-rose-500/20 p-2 rounded-lg mt-2"><div className="flex justify-between items-center"><div className="text-xs text-rose-300 font-bold flex items-center gap-1"><AlertTriangle size={12} /> Övrigt / Ospecificerat</div><div className="font-mono text-rose-400 font-bold text-sm cursor-pointer hover:underline" onClick={() => openDrillDown(`${group.name} - Övrigt`, group.catchAllTransactions)}>{formatMoney(group.extraSpent)}</div></div></div>}
                                  <Button variant="ghost" onClick={() => { setActiveGroupId(group.id); setIsCatPickerOpen(true); }} className="w-full border border-dashed border-slate-700 text-slate-500 text-xs py-2 h-auto"><Plus size={12} className="mr-1"/> Koppla Kategori</Button>
                              </div>
                              <div className="space-y-3">
                                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1 mt-4">Fasta Poster / Mål</h4>
                                  {group.customPosts.map(bucket => {
                                      let isOverridden = !!currentMonthConfig?.bucketOverrides?.[bucket.id];
                                      let templateValue = 0, currentValue = 0;
                                      if (bucket.type === 'GOAL') { const specificData = buckets.find(b => b.id === bucket.id)?.monthlyData[selectedMonth]; isOverridden = specificData && !specificData.isExplicitlyDeleted && specificData.amount > 0; templateValue = 0; currentValue = bucket.cost; } else { const tVal = activeTemplate?.bucketValues?.[bucket.id]; templateValue = bucket.type === 'DAILY' ? (tVal?.dailyAmount || 0) : (tVal?.amount || 0); currentValue = bucket.type === 'DAILY' ? (getEffectiveBucketData(bucket, selectedMonth).data?.dailyAmount || 0) : bucket.cost; }
                                      return (
                                          <div key={`${bucket.id}-${bucket.displayMode}`} onClick={() => openBucketModal(group, bucket)} className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/50 hover:bg-slate-800 transition-colors cursor-pointer group/bucket">
                                              <div className="flex justify-between items-center">
                                                  <div className="flex items-center gap-3">
                                                      <button className="p-2 bg-slate-900 rounded-lg text-slate-400 shrink-0 hover:bg-slate-700 transition-colors active:scale-90" onClick={(e) => { e.stopPropagation(); setIconPickerTarget({ type: 'BUCKET', id: bucket.id, name: bucket.name }); }}>{bucket.icon ? <span className="text-xl leading-none">{bucket.icon}</span> : bucket.displayMode === 'SAVING' || bucket.isSavings ? <PiggyBank size={16} className="text-emerald-400" /> : bucket.displayMode === 'SPENDING' || bucket.type === 'GOAL' ? <Target size={16} className="text-purple-400" /> : bucket.type === 'DAILY' ? <RefreshCw size={16} className="text-orange-400" /> : <Calendar size={16} className="text-blue-400" />}</button>
                                                      <div><div className="text-base font-medium text-slate-200 flex items-center gap-2">{bucket.displayName}<button onClick={(e) => { e.stopPropagation(); openMoveModalBucket(bucket); }} className="text-slate-500 hover:text-blue-400" title="Flytta"><ArrowRight size={12} /></button>{bucket.accountId && bucket.accountId !== group.defaultAccountId && <span className="text-[9px] bg-indigo-500/20 text-indigo-300 px-1 rounded flex items-center gap-0.5"><Wallet size={8}/></span>}</div><div className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-wider">{bucket.displayMode === 'SAVING' ? 'Månadssparande' : (bucket.displayMode === 'SPENDING' ? 'Förbrukning / Projekt' : (bucket.type === 'FIXED' ? 'Fast' : 'Daglig'))}</div></div>
                                                  </div>
                                                  <div className="text-right"><div className="flex items-center justify-end gap-1.5">{isOverridden && !isMonthLocked && bucket.displayMode !== 'SPENDING' && <button onClick={(e) => { e.stopPropagation(); handleResetOverride('BUCKET', bucket.id, bucket.name, currentValue, templateValue); }} className="p-1 rounded-full text-amber-400 hover:bg-amber-900/30 transition-colors"><RotateCcw size={12} /></button>}<div className={cn("font-mono text-lg font-bold", isOverridden && bucket.displayMode !== 'SPENDING' ? "text-amber-400" : "text-white")}>{formatMoney(bucket.cost)}</div></div>{bucket.spent > 0 && <div className="text-[10px] text-rose-400 hover:text-rose-300 hover:underline cursor-pointer mt-0.5" onClick={(e) => { e.stopPropagation(); openDrillDown(bucket.name, bucket.transactions); }}>-{formatMoney(bucket.spent)}</div>}</div>
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

      {/* TOTAL BUDGET BREAKDOWN MODAL */}
      <Modal isOpen={isTotalBreakdownOpen} onClose={() => setIsTotalBreakdownOpen(false)} title="Budgetuppdelning">
          <div className="space-y-6">
              <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex justify-between items-center">
                  <span className="text-slate-400 text-sm font-bold uppercase tracking-wider">Total Budget</span>
                  <span className="text-2xl font-bold text-white font-mono">{formatMoney(data.totalBudget)}</span>
              </div>

              <div className="space-y-3">
                  <div className="flex justify-between items-center p-3 bg-purple-900/20 border border-purple-500/30 rounded-xl">
                      <div className="flex items-center gap-3">
                          <div className="p-2 bg-purple-500/20 rounded-lg text-purple-400"><Target size={16} /></div>
                          <div>
                              <div className="text-sm font-bold text-white">Drömmar: Förbrukning</div>
                              <div className="text-[10px] text-slate-500">Målprojekt under månaden</div>
                          </div>
                      </div>
                      <div className="font-mono font-bold text-white">{formatMoney(data.breakdown.dreamSpending)}</div>
                  </div>

                  <div className="flex justify-between items-center p-3 bg-emerald-900/20 border border-emerald-500/30 rounded-xl">
                      <div className="flex items-center gap-3">
                          <div className="p-2 bg-emerald-500/20 rounded-lg text-emerald-400"><Rocket size={16} /></div>
                          <div>
                              <div className="text-sm font-bold text-white">Drömmar: Månadssparande</div>
                              <div className="text-[10px] text-slate-500">Avsättning till mål</div>
                          </div>
                      </div>
                      <div className="font-mono font-bold text-white">{formatMoney(data.breakdown.dreamSaving)}</div>
                  </div>

                  <div className="flex justify-between items-center p-3 bg-indigo-900/20 border border-indigo-500/30 rounded-xl">
                      <div className="flex items-center gap-3">
                          <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400"><PiggyBank size={16} /></div>
                          <div>
                              <div className="text-sm font-bold text-white">Investeringar & Sparande</div>
                              <div className="text-[10px] text-slate-500">Allmänt buffertsparande</div>
                          </div>
                      </div>
                      <div className="font-mono font-bold text-white">{formatMoney(data.breakdown.generalSaving)}</div>
                  </div>

                  <div className="flex justify-between items-center p-3 bg-blue-900/20 border border-blue-500/30 rounded-xl">
                      <div className="flex items-center gap-3">
                          <div className="p-2 bg-blue-500/20 rounded-lg text-blue-400"><Calendar size={16} /></div>
                          <div>
                              <div className="text-sm font-bold text-white">Drift: Fasta kostnader</div>
                              <div className="text-[10px] text-slate-500">Hyra, el, försäkring etc.</div>
                          </div>
                      </div>
                      <div className="font-mono font-bold text-white">{formatMoney(data.breakdown.fixedOps)}</div>
                  </div>

                  <div className="flex justify-between items-center p-3 bg-orange-900/20 border border-orange-500/30 rounded-xl">
                      <div className="flex items-center gap-3">
                          <div className="p-2 bg-orange-500/20 rounded-lg text-orange-400"><Activity size={16} /></div>
                          <div>
                              <div className="text-sm font-bold text-white">Drift: Rörliga kostnader</div>
                              <div className="text-[10px] text-slate-500">Mat, shopping, nöje</div>
                          </div>
                      </div>
                      <div className="font-mono font-bold text-white">{formatMoney(data.breakdown.variableOps)}</div>
                  </div>
              </div>

              <div className="pt-2">
                  <Button variant="secondary" onClick={() => setIsTotalBreakdownOpen(false)} className="w-full">Stäng</Button>
              </div>
          </div>
      </Modal>

      <EmojiPickerModal isOpen={!!iconPickerTarget} onClose={() => setIconPickerTarget(null)} onSelect={handleIconSelect} title={iconPickerTarget ? `Ikon för ${iconPickerTarget.name}` : undefined} />
      <Modal isOpen={!!resetTarget} onClose={() => setResetTarget(null)} title="Återställ till mall">{resetTarget && (<div className="space-y-4"><p className="text-sm text-slate-300">Posten <span className="font-bold text-white">{resetTarget.name}</span> avviker från budgetmallen. Vill du återställa värdet?</p><div className="flex justify-between items-center bg-slate-800 p-4 rounded-xl border border-slate-700"><div><div className="text-[10px] text-slate-500 uppercase font-bold">Nuvarande</div><div className="text-xl font-bold text-amber-400 line-through">{resetTarget.currentValue}</div></div><div className="text-slate-500"><ArrowRight size={20}/></div><div className="text-right"><div className="text-[10px] text-slate-500 uppercase font-bold">Mallvärde</div><div className="text-xl font-bold text-white">{resetTarget.templateValue}</div></div></div><div className="flex gap-2 pt-2"><Button variant="secondary" className="flex-1" onClick={() => setResetTarget(null)}>Avbryt</Button><Button className="flex-1 bg-blue-600 hover:bg-blue-500" onClick={confirmReset}>Återställ</Button></div></div>)}</Modal>
      <Modal isOpen={!!pendingBudgetUpdate} onClose={() => setPendingBudgetUpdate(null)} title="Spara Budget"><div className="space-y-4"><p className="text-sm text-slate-300">Du ändrar budgeten för <span className="font-bold text-white">{intervalLabel}</span>. Mall: <span className="text-blue-400 font-bold">{activeTemplateName}</span>.</p><div className="grid gap-3"><button onClick={() => handleBudgetDecision('TEMPLATE')} className="flex items-center gap-3 p-4 rounded-xl border border-blue-500/30 bg-blue-900/10 hover:bg-blue-900/20 text-left transition-colors"><div className="p-2 bg-blue-600 rounded-lg text-white"><Save size={18}/></div><div><div className="font-bold text-white">Uppdatera Mallen ({activeTemplateName})</div><div className="text-xs text-slate-400">Påverkar alla månader som använder denna mall.</div></div></button><button onClick={() => handleBudgetDecision('OVERRIDE')} className="flex items-center gap-3 p-4 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-left transition-colors"><div className="p-2 bg-slate-700 rounded-lg text-white"><Calendar size={18}/></div><div><div className="font-bold text-white">Bara denna månad</div><div className="text-xs text-slate-400">Gör ett tillfälligt undantag för {intervalLabel}.</div></div></button></div><Button variant="secondary" onClick={() => setPendingBudgetUpdate(null)} className="w-full">Avbryt</Button></div></Modal>
      <Modal isOpen={!!drillDownData} onClose={() => setDrillDownData(null)} title={drillDownData?.title || 'Transaktioner'}>{drillDownData && (<div className="space-y-4"><div className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex justify-between items-center shadow-sm"><span className="text-slate-400 text-sm font-medium uppercase tracking-wider">Totalt Utfall</span><span className="text-2xl font-bold font-mono text-white">{formatMoney(drillDownData.transactions.reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0))}</span></div><div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">{drillDownData.transactions.length > 0 ? (drillDownData.transactions.map(t => { const effAmount = getEffectiveAmount(t, reimbursementMap); const isReimbursed = effAmount !== t.amount; return (<div key={t.id} className="flex justify-between items-center p-3 bg-slate-900/50 border border-slate-800 rounded-lg"><div className="flex-1 mr-4 overflow-hidden"><div className="text-white font-medium truncate">{t.description}</div><div className="text-xs text-slate-500">{t.date}</div></div><div className="text-right"><div className="font-mono font-bold text-white whitespace-nowrap">{formatMoney(Math.abs(effAmount))}</div>{isReimbursed && <div className="text-[10px] text-emerald-400 flex items-center justify-end gap-1"><Link size={8} /> Orig: {formatMoney(Math.abs(t.amount))}</div>}</div></div>); })) : <div className="text-center text-slate-500 py-8 italic">Inga transaktioner hittades.</div>}</div></div>)}<div className="mt-4 border-t border-slate-700 pt-4 flex justify-end"><Button variant="secondary" onClick={() => setDrillDownData(null)}>Stäng</Button></div></Modal>
      <Modal isOpen={isGroupModalOpen} onClose={() => setIsGroupModalOpen(false)} title={editingGroup?.id ? "Inställningar" : "Ny Grupp"}>{editingGroup && (<div className="space-y-4"><Input label="Namn" value={editingGroup.name} onChange={e => setEditingGroup({...editingGroup, name: e.target.value})} /><div><label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">Prognos & Typ</label><div className="flex bg-slate-900 rounded-lg p-1"><button onClick={() => setEditingGroup({...editingGroup, forecastType: 'VARIABLE'})} className={cn("flex-1 py-2 text-xs rounded transition-all flex items-center justify-center gap-2", (!editingGroup.forecastType || editingGroup.forecastType === 'VARIABLE') ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-white")}><Activity size={14} /> Rörlig</button><button onClick={() => setEditingGroup({...editingGroup, forecastType: 'FIXED'})} className={cn("flex-1 py-2 text-xs rounded transition-all flex items-center justify-center gap-2", editingGroup.forecastType === 'FIXED' ? "bg-blue-600 text-white shadow" : "text-slate-400 hover:text-white")}><Calendar size={14} /> Fasta</button><button onClick={() => setEditingGroup({...editingGroup, forecastType: 'SAVINGS'})} className={cn("flex-1 py-2 text-xs rounded transition-all flex items-center justify-center gap-2", editingGroup.forecastType === 'SAVINGS' ? "bg-emerald-600 text-white shadow" : "text-slate-400 hover:text-white")}><PiggyBank size={14} /> Sparande</button></div></div><div><label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">Finansierande Konto</label><select className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white" value={editingGroup.defaultAccountId || ''} onChange={(e) => setEditingGroup({...editingGroup, defaultAccountId: e.target.value})}><option value="">-- Välj Konto --</option>{accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.icon} {acc.name}</option>)}</select></div><div className="pt-2 border-t border-slate-700"><label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Manuell Budget (Reserv)</label><div className="flex items-center gap-2"><input type="number" className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white flex-1 font-mono" value={editingLimit || ''} onChange={(e) => setEditingLimit(Number(e.target.value))} placeholder="0" /><span className="text-slate-500">kr</span></div></div><Button onClick={saveGroup} className="w-full">Spara</Button></div>)}</Modal>
      <Modal isOpen={isSubModalOpen} onClose={() => setIsSubModalOpen(false)} title="Redigera Kategori">{editingSubCategory && (<div className="space-y-4"><Input label="Namn" value={editingSubCategory.name} onChange={e => setEditingSubCategory({...editingSubCategory, name: e.target.value})} /><div><label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">Konto</label><select className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white" value={editingSubCategory.accountId || ''} onChange={(e) => setEditingSubCategory({...editingSubCategory, accountId: e.target.value || undefined})}><option value="">Använd Gruppens Konto (Förvalt)</option>{accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.icon} {acc.name}</option>)}</select></div><div className="bg-slate-800 p-3 rounded-xl border border-slate-700"><label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" className="rounded bg-slate-900 border-slate-600 w-5 h-5 text-emerald-500" checked={!!editingSubCategory.isSavings} onChange={(e) => setEditingSubCategory({...editingSubCategory, isSavings: e.target.checked})} /><div><div className="text-sm font-bold text-white flex items-center gap-2">Är detta ett sparande? <PiggyBank size={14} className="text-emerald-400"/></div><div className="text-[10px] text-slate-400">Markeras som sparande i översikten.</div></div></label></div><div className="flex gap-2"><Button variant="secondary" onClick={() => { openMoveModalSub(editingSubCategory); setIsSubModalOpen(false); }} className="flex-1">Flytta</Button><Button variant="secondary" onClick={() => { handleUnlinkSubCategory(editingSubCategory); setIsSubModalOpen(false); }} className="flex-1 text-rose-400 border-rose-900 hover:bg-rose-950">Koppla loss</Button></div><Button onClick={saveSubCategory} className="w-full">Spara</Button></div>)}</Modal>
      <Modal isOpen={isMoveModalOpen} onClose={() => setIsMoveModalOpen(false)} title="Flytta">{(movingSubCategory || movingBucket) && (<div className="space-y-4"><p className="text-sm text-slate-300">Välj budgetgrupp.</p><div className="space-y-2">{budgetGroups.map(g => (<button key={g.id} onClick={async () => { if (movingSubCategory) await handleMoveSubCategory(movingSubCategory, g.id); if (movingBucket) await handleMoveBucket(movingBucket, g.id); setIsMoveModalOpen(false); }} className={cn("w-full text-left p-3 rounded-lg border transition-all flex items-center gap-3", g.id === (movingSubCategory ? movingSubCategory.budgetGroupId : movingBucket?.budgetGroupId) ? "bg-blue-600/20 border-blue-500 text-blue-200" : "bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-300")}><span className="text-xl">{g.icon}</span><span className="font-bold text-sm">{g.name}</span></button>))}<button onClick={async () => { if (movingSubCategory) await handleUnlinkSubCategory(movingSubCategory); if (movingBucket) await handleUnlinkBucket(movingBucket); setIsMoveModalOpen(false); }} className="w-full text-left p-3 rounded-lg border border-dashed border-slate-600 text-slate-400 hover:text-white hover:bg-slate-800"><span className="text-sm">Ta bort från grupp</span></button></div></div>)}</Modal>
      <Modal isOpen={isCatPickerOpen} onClose={() => setIsCatPickerOpen(false)} title="Välj Kategori"><div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">{mainCategories.map(main => { const unlinkedSubs = subCategories.filter(s => s.mainCategoryId === main.id && !s.budgetGroupId); if (unlinkedSubs.length === 0) return null; return (<div key={main.id} className="space-y-1"><h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider py-1 pl-1">{main.name}</h4><div className="space-y-1">{unlinkedSubs.map(sub => (<button key={sub.id} onClick={() => { if (activeGroupId) { handleMoveSubCategory(sub, activeGroupId); setIsCatPickerOpen(false); }}} className="w-full text-left bg-slate-800 p-3 rounded-lg border border-slate-700 hover:bg-slate-700 transition-colors flex justify-between items-center group"><div><div className="font-bold text-white text-sm">{sub.name}</div></div><Plus size={16} className="text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity" /></button>))}</div></div>); })}</div></Modal>
      <Modal isOpen={isBucketModalOpen} onClose={() => setIsBucketModalOpen(false)} title={editingBucket?.id && buckets.find(b => b.id === editingBucket.id) ? "Redigera Post" : "Ny Post"}>{editingBucket && (<div className="space-y-4">{!isEditingGoalSaving && <Input label="Namn" value={editingBucket.name} onChange={e => setEditingBucket({...editingBucket, name: e.target.value})} autoFocus />}{isEditingGoalSaving ? (<div className="space-y-4 animate-in fade-in"><div className="bg-emerald-900/30 p-4 rounded-xl border border-emerald-500/30"><h3 className="text-emerald-400 font-bold mb-1 flex items-center gap-2"><PiggyBank size={18}/> Månadssparande</h3><p className="text-xs text-slate-300">Justera sparande till <span className="font-bold text-white">{editingBucket.name}</span>.</p></div><div><label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">Belopp denna månad</label><div className="flex items-center gap-2"><input type="number" className="bg-transparent text-3xl font-mono font-bold text-white w-full outline-none border-b border-slate-700 focus:border-emerald-500 pb-1" placeholder="0" value={editingBucketData.amount || ''} onChange={(e) => setEditingBucketData({ ...editingBucketData, amount: Number(e.target.value) })} autoFocus /><span className="text-slate-500 text-xl">kr</span></div></div></div>) : (<><div className="flex bg-slate-900 rounded-lg p-1"><button onClick={() => setEditingBucket({...editingBucket, type: 'FIXED'})} className={cn("flex-1 py-2 text-xs rounded transition-all", editingBucket.type === 'FIXED' ? "bg-blue-600 text-white" : "text-slate-400")}>Fast</button><button onClick={() => setEditingBucket({...editingBucket, type: 'DAILY'})} className={cn("flex-1 py-2 text-xs rounded transition-all", editingBucket.type === 'DAILY' ? "bg-orange-600 text-white" : "text-slate-400")}>Daglig</button><button onClick={() => setEditingBucket({...editingBucket, type: 'GOAL'})} className={cn("flex-1 py-2 text-xs rounded transition-all", editingBucket.type === 'GOAL' ? "bg-purple-600 text-white" : "text-slate-400")}>Mål/Dröm</button></div>{editingBucket.type === 'GOAL' ? (<div className="space-y-4 animate-in fade-in"><Input label="Målbelopp" type="number" value={editingBucket.targetAmount} onChange={e => setEditingBucket({...editingBucket, targetAmount: Number(e.target.value)})} /><div className="grid grid-cols-2 gap-4"><Input label="Startdatum" type="month" value={editingBucket.startSavingDate} onChange={e => setEditingBucket({...editingBucket, startSavingDate: e.target.value})} /><Input label="Slutdatum" type="month" value={editingBucket.targetDate} onChange={e => setEditingBucket({...editingBucket, targetDate: e.target.value})} /></div><div className="space-y-3 pt-2"><div className="text-xs font-medium text-slate-400 uppercase">Finansiering</div><div className="flex flex-col gap-2"><button onClick={() => setEditingBucket({...editingBucket, paymentSource: 'INCOME'})} className={cn("p-3 rounded-xl border text-left flex items-center gap-3", editingBucket.paymentSource === 'INCOME' ? "bg-purple-500/20 border-purple-500 text-white" : "border-slate-700 text-slate-400")}><Wallet className="w-5 h-5" /><div><div className="font-bold text-sm">Från Månadslön</div></div></button><button onClick={() => setEditingBucket({...editingBucket, paymentSource: 'BALANCE'})} className={cn("p-3 rounded-xl border text-left flex items-center gap-3", editingBucket.paymentSource === 'BALANCE' ? "bg-amber-500/20 border-amber-500 text-white" : "border-slate-700 text-slate-400")}><PiggyBank className="w-5 h-5" /><div><div className="font-bold text-sm">Från Sparade Medel</div></div></button></div></div></div>) : (<div className="space-y-4 animate-in fade-in"><div className="bg-slate-800 p-3 rounded-xl border border-slate-700"><label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">{editingBucket.type === 'DAILY' ? 'Daglig Kostnad' : 'Månadskostnad'}</label><div className="flex items-center gap-2"><input type="number" className="bg-transparent text-3xl font-mono font-bold text-white w-full outline-none" placeholder="0" value={editingBucket.type === 'DAILY' ? (editingBucketData.dailyAmount || '') : (editingBucketData.amount || '')} onChange={(e) => { const val = Number(e.target.value); if (editingBucket.type === 'DAILY') setEditingBucketData({ ...editingBucketData, dailyAmount: val }); else setEditingBucketData({ ...editingBucketData, amount: val }); }} /><span className="text-slate-500 text-xl">kr</span></div></div></div>)}</>)}<div className="flex gap-2">{buckets.find(b => b.id === editingBucket.id) && (<Button variant="danger" onClick={deleteBucketHandler}><Trash2 size={16}/></Button>)}<Button onClick={saveBucket} className="flex-1">Spara</Button></div></div>)}</Modal>
      <Modal isOpen={isTemplatePickerOpen} onClose={() => setIsTemplatePickerOpen(false)} title="Välj Budgetmall"><div className="space-y-2">{budgetTemplates.map(t => (<button key={t.id} onClick={() => { assignTemplateToMonth(selectedMonth, t.id); setIsTemplatePickerOpen(false); }} className={cn("w-full text-left p-3 rounded-lg border flex items-center justify-between transition-all", t.id === activeTemplateId ? "bg-blue-600/20 border-blue-500 text-white" : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700")}><span className="font-bold">{t.name}</span></button>))}</div><div className="mt-4 pt-4 border-t border-slate-700"><Button variant="secondary" onClick={() => setIsTemplatePickerOpen(false)} className="w-full">Avbryt</Button></div></Modal>
    </div>
  );
};
