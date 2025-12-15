import React, { useMemo, useState } from 'react';
import { useApp } from '../store';
import { useBudgetMonth } from '../hooks/useBudgetMonth';
import { formatMoney, getEffectiveBudgetGroupData, calculateFixedBucketCost, calculateDailyBucketCost, calculateGoalBucketCost, calculateReimbursementMap, getEffectiveAmount, getSubCategoryAverage, generateId, getEffectiveBucketData, isBucketActiveInMonth } from '../utils';
import { ChevronRight, ChevronDown, Check, AlertTriangle, PieChart, Edit2, Plus, Trash2, Settings, ArrowRightLeft, Rocket, Calendar, Plane, RefreshCw, Lock, ChevronUp, BarChart3, Wallet, Link2, X, PiggyBank, FolderInput, ArrowRight, Link } from 'lucide-react';
import { BudgetProgressBar } from '../components/BudgetProgressBar';
import { cn, Button, Modal, Input } from '../components/components';
import { BudgetGroup, SubCategory, Bucket, BucketData, Transaction } from '../types';
import { parseISO, addMonths, format } from 'date-fns';

const DREAM_IMAGES = [
  "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=2073&auto=format&fit=crop", 
  "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?q=80&w=2021&auto=format&fit=crop", 
  "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?q=80&w=2070&auto=format&fit=crop", 
  "https://images.unsplash.com/photo-1560518883-ce09059eeffa?q=80&w=1973&auto=format&fit=crop", 
  "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?q=80&w=2070&auto=format&fit=crop", 
  "https://images.unsplash.com/photo-1523275335684-37898b6baf30?q=80&w=1999&auto=format&fit=crop", 
  "https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=2070&auto=format&fit=crop",
];

export const OperatingBudgetView: React.FC = () => {
  const { 
      selectedMonth, budgetGroups, subCategories, mainCategories, transactions, 
      buckets, accounts, settings, addBudgetGroup, updateBudgetGroup, 
      deleteBudgetGroup, updateSubCategory, addSubCategory, addBucket, updateBucket, deleteBucket 
  } = useApp();
  
  const { startStr, endStr, intervalLabel } = useBudgetMonth(selectedMonth);

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  
  // --- STATE: GROUP EDIT MODAL ---
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<BudgetGroup | null>(null);
  const [editingLimit, setEditingLimit] = useState<number>(0);
  const [deleteMode, setDeleteMode] = useState(false);
  const [showGroupSettings, setShowGroupSettings] = useState(false);

  // --- STATE: CATEGORY PICKER MODAL ---
  const [isCatPickerOpen, setIsCatPickerOpen] = useState(false);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  
  // --- STATE: SUB-CATEGORY EDITING (INLINE) ---
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [tempSubBudget, setTempSubBudget] = useState<string>('');

  // --- STATE: MOVE MODAL (Category OR Bucket) ---
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [movingSubCategory, setMovingSubCategory] = useState<SubCategory | null>(null);
  const [movingBucket, setMovingBucket] = useState<Bucket | null>(null);

  // --- STATE: BUCKET (CUSTOM POST) MODAL ---
  const [isBucketModalOpen, setIsBucketModalOpen] = useState(false);
  const [editingBucket, setEditingBucket] = useState<Bucket | null>(null);
  const [editingBucketData, setEditingBucketData] = useState<BucketData>({ amount: 0, dailyAmount: 0, activeDays: [] });
  const [showBucketDetails, setShowBucketDetails] = useState(false);

  // --- STATE: DRILL DOWN (TRANSACTIONS) ---
  const [drillDownData, setDrillDownData] = useState<{ title: string, transactions: Transaction[] } | null>(null);

  // --- REIMBURSEMENTS ---
  const reimbursementMap = useMemo(() => calculateReimbursementMap(transactions), [transactions]);

  // --- HELPERS ---
  const getSubCategoryTxs = (subId: string) => {
      return transactions.filter(t => 
          !t.isHidden && 
          t.categorySubId === subId && 
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

  const calculateBucketCost = (bucket: Bucket) => {
      if (bucket.type === 'FIXED') return calculateFixedBucketCost(bucket, selectedMonth);
      if (bucket.type === 'DAILY') return calculateDailyBucketCost(bucket, selectedMonth, settings.payday);
      if (bucket.type === 'GOAL') return calculateGoalBucketCost(bucket, selectedMonth);
      return 0;
  };

  // --- DATA PROCESSING ---
  const data = useMemo(() => {
      const groups = budgetGroups.map(group => {
          // 1. Get Linked Subcategories
          const linkedSubs = subCategories.filter(s => s.budgetGroupId === group.id).map(sub => {
              const txs = getSubCategoryTxs(sub.id);
              const spent = txs.reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);
              return {
                  ...sub,
                  spent,
                  transactions: txs,
                  avgSpend: getSubCategoryAverage(sub.id, selectedMonth, transactions, reimbursementMap),
                  budget: sub.monthlyBudget || 0
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

              // Visibility Check:
              const txs = getBucketTxs(b.id);
              const spent = txs.reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);
              
              if (spent > 0.01) return true;
              if (isBucketActiveInMonth(b, selectedMonth)) return true;
              if (isExplicitlyLinked) return true;

              return false;
          }).map(b => {
              const txs = getBucketTxs(b.id);
              const spent = txs.reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);
              return {
                  ...b,
                  cost: calculateBucketCost(b),
                  spent,
                  transactions: txs
              };
          });

          const bucketTotalCost = linkedBuckets.reduce((sum, b) => sum + b.cost, 0);
          const bucketTotalSpent = linkedBuckets.reduce((sum, b) => sum + b.spent, 0);
          const allBucketTxs = linkedBuckets.flatMap(b => b.transactions);

          // 3. Determine Group Total Budget
          let totalBudget = 0;
          let isAuto = false;
          const hasChildren = linkedSubs.length > 0 || linkedBuckets.length > 0;

          const { data: explicitData } = getEffectiveBudgetGroupData(group, selectedMonth);
          const manualLimit = explicitData ? explicitData.limit : 0;

          if (hasChildren) {
              const calculatedTotal = subTotalBudget + bucketTotalCost;
              totalBudget = Math.max(calculatedTotal, manualLimit);
              isAuto = true;
          } else {
              totalBudget = manualLimit;
          }

          // 4. Determine Actual Total Spent & Catch-All Transactions
          let extraSpent = 0;
          let catchAllTxs: Transaction[] = [];

          if (group.isCatchAll) {
              catchAllTxs = transactions.filter(t => 
                  !t.isHidden &&
                  t.date >= startStr && t.date <= endStr &&
                  // STRICTER CHECK:
                  // 1. Must be EXPENSE type OR (Untyped AND Negative)
                  // 2. Must NOT be TRANSFER or INCOME explicitly
                  (t.type === 'EXPENSE' || (!t.type && t.amount < 0)) &&
                  t.type !== 'TRANSFER' &&
                  t.type !== 'INCOME' &&
                  // 3. Catch-all criteria (No bucket, no mapped category)
                  !t.bucketId &&
                  (!t.categorySubId || !subCategories.find(s => s.id === t.categorySubId)?.budgetGroupId)
              );
              extraSpent = catchAllTxs.reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);
          }

          const totalSpent = subTotalSpent + bucketTotalSpent + extraSpent;
          const allGroupTxs = [...allSubTxs, ...allBucketTxs, ...catchAllTxs];

          return {
              ...group,
              totalBudget,
              totalSpent,
              isAuto,
              subs: linkedSubs,
              customPosts: linkedBuckets,
              allTransactions: allGroupTxs,
              catchAllTransactions: catchAllTxs,
              extraSpent
          };
      });

      const totalBudget = groups.reduce((sum, g) => sum + g.totalBudget, 0);
      const totalSpent = groups.reduce((sum, g) => sum + g.totalSpent, 0);
      
      const totalIncome = transactions
        .filter(t => t.type === 'INCOME' && t.date >= startStr && t.date <= endStr)
        .reduce((sum, t) => sum + t.amount, 0);

      return { groups, totalBudget, totalSpent, totalIncome };
  }, [budgetGroups, subCategories, buckets, transactions, selectedMonth, settings.payday, startStr, endStr, reimbursementMap]);

  // --- HANDLERS ---

  const toggleGroup = (id: string) => {
      const next = new Set(expandedGroups);
      if (next.has(id)) next.delete(id); else next.add(id);
      setExpandedGroups(next);
  };

  const startEditingSub = (sub: SubCategory) => {
      setEditingSubId(sub.id);
      setTempSubBudget(sub.monthlyBudget?.toString() || '');
  };

  const saveSubBudget = async (sub: SubCategory) => {
      const val = parseFloat(tempSubBudget);
      await updateSubCategory({ ...sub, monthlyBudget: isNaN(val) ? 0 : val });
      setEditingSubId(null);
  };

  // --- MOVE HANDLERS ---
  const handleMoveSubCategory = async (sub: SubCategory, newGroupId: string) => {
      await updateSubCategory({ ...sub, budgetGroupId: newGroupId });
  };

  const handleUnlinkSubCategory = async (sub: SubCategory) => {
      await updateSubCategory({ ...sub, budgetGroupId: undefined });
  };

  const handleMoveBucket = async (bucket: Bucket, newGroupId: string) => {
      await updateBucket({ ...bucket, budgetGroupId: newGroupId });
  };

  const handleUnlinkBucket = async (bucket: Bucket) => {
      await updateBucket({ ...bucket, budgetGroupId: undefined });
  };

  // Group Modal
  const openGroupModal = (group?: BudgetGroup) => {
      setDeleteMode(false);
      setShowGroupSettings(false);
      if (group) {
          setEditingGroup(group);
          const { data } = getEffectiveBudgetGroupData(group, selectedMonth);
          setEditingLimit(data ? data.limit : 0);
      } else {
          setEditingGroup({ id: '', name: '', icon: '📁', monthlyData: {} });
          setEditingLimit(0);
          setShowGroupSettings(true);
      }
      setIsGroupModalOpen(true);
  };

  const saveGroup = async () => {
      if (!editingGroup) return;
      if (!editingGroup.id) {
          await addBudgetGroup(editingGroup.name, editingLimit, editingGroup.icon || '📁');
      } else {
          const newData = { ...editingGroup.monthlyData, [selectedMonth]: { limit: editingLimit, isExplicitlyDeleted: false } };
          await updateBudgetGroup({ ...editingGroup, monthlyData: newData });
      }
      setIsGroupModalOpen(false);
  };

  // Move Modal Openers
  const openMoveModalSub = (sub: SubCategory) => {
      setMovingSubCategory(sub);
      setMovingBucket(null);
      setIsMoveModalOpen(true);
  };

  const openMoveModalBucket = (bucket: Bucket) => {
      setMovingBucket(bucket);
      setMovingSubCategory(null);
      setIsMoveModalOpen(true);
  };

  // Bucket Modal
  const openBucketModal = (group: BudgetGroup, bucket?: Bucket) => {
      setActiveGroupId(group.id);
      setShowBucketDetails(false);
      
      if (bucket) {
          setEditingBucket(bucket);
          const { data } = getEffectiveBucketData(bucket, selectedMonth);
          setEditingBucketData(data || { amount: 0, dailyAmount: 0, activeDays: [1,2,3,4,5] });
      } else {
          // New Bucket
          setEditingBucket({
              id: generateId(),
              accountId: group.defaultAccountId || accounts[0]?.id || '', // Default to group account or first account
              name: '',
              type: 'FIXED', // Default, but can be changed to GOAL
              isSavings: false,
              paymentSource: 'INCOME',
              monthlyData: {},
              targetAmount: 0,
              targetDate: format(addMonths(new Date(), 12), 'yyyy-MM'),
              startSavingDate: selectedMonth,
              budgetGroupId: group.id, // Link to group
              backgroundImage: DREAM_IMAGES[0]
          });
          setEditingBucketData({ amount: 0, dailyAmount: 0, activeDays: [1,2,3,4,5] });
          setShowBucketDetails(true);
      }
      setIsBucketModalOpen(true);
  };

  const saveBucket = async () => {
      if (!editingBucket) return;
      
      // Ensure we have an account ID (fallback)
      if (!editingBucket.accountId && accounts.length > 0) {
          editingBucket.accountId = accounts[0].id;
      }

      // Ensure isSavings is set true for GOAL if not manually set
      const bucketToSave = { ...editingBucket };
      if (bucketToSave.type === 'GOAL') {
          bucketToSave.isSavings = true;
      }

      const newData = { ...editingBucket.monthlyData, [selectedMonth]: editingBucketData };
      bucketToSave.monthlyData = newData;

      if (buckets.find(b => b.id === bucketToSave.id)) {
          await updateBucket(bucketToSave);
      } else {
          await addBucket(bucketToSave);
      }
      setIsBucketModalOpen(false);
  };

  const deleteBucketHandler = async () => {
      if (editingBucket) {
          await deleteBucket(editingBucket.id, selectedMonth, 'ALL');
          setIsBucketModalOpen(false);
      }
  };

  const openDrillDown = (title: string, txs: Transaction[]) => {
      if (txs.length > 0) {
          setDrillDownData({ title, transactions: txs });
      }
  };

  return (
    <div className="space-y-6 pb-24 animate-in slide-in-from-right duration-300">
      
      {/* HEADER STATS */}
      <div className="grid grid-cols-2 gap-4">
          <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Total Inkomst (Period)</div>
              <div className="text-2xl font-mono font-bold text-emerald-400">{formatMoney(data.totalIncome)}</div>
          </div>
          <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Total Driftbudget</div>
              <div className="text-2xl font-mono font-bold text-blue-400">{formatMoney(data.totalBudget)}</div>
          </div>
      </div>

      {/* BUDGET GROUPS LIST */}
      <div className="space-y-4">
          {data.groups.map(group => {
              const isExpanded = expandedGroups.has(group.id);
              const isOver = group.totalSpent > group.totalBudget && group.totalBudget > 0;

              return (
                  <div key={group.id} className={cn("bg-surface rounded-xl overflow-hidden border transition-all shadow-md", group.isCatchAll ? "border-dashed border-slate-600" : "border-slate-700")}>
                      {/* HEADER */}
                      <div 
                        className="p-4 cursor-pointer hover:bg-slate-800/80 transition-colors"
                        onClick={() => toggleGroup(group.id)}
                      >
                          <div className="flex justify-between items-start mb-2">
                              <div className="flex items-center gap-3">
                                  {isExpanded ? <ChevronDown className="w-5 h-5 text-blue-400"/> : <ChevronRight className="w-5 h-5 text-slate-500"/>}
                                  <div>
                                      <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                          {group.icon} {group.name}
                                          {isOver && <AlertTriangle className="w-4 h-4 text-rose-500" />}
                                      </h3>
                                      <div className="text-xs text-slate-400 mt-0.5">
                                          {group.isAuto ? 
                                            `Auto-beräknad (${group.subs.length} kat, ${group.customPosts.length} fasta)` : 
                                            "Manuell budget"}
                                      </div>
                                  </div>
                              </div>
                              <div className="text-right">
                                  <div className="font-mono font-bold text-white text-lg">
                                      {formatMoney(group.totalBudget)}
                                  </div>
                                  <div 
                                    className="text-slate-500 text-xs hover:text-blue-400 hover:underline cursor-pointer mt-0.5"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        openDrillDown(`${group.name} - Totalt Utfall`, group.allTransactions);
                                    }}
                                  >
                                      Utfall: {formatMoney(group.totalSpent)}
                                  </div>
                              </div>
                          </div>
                          <BudgetProgressBar spent={group.totalSpent} total={group.totalBudget} />
                      </div>

                      {/* EXPANDED CONTENT */}
                      {isExpanded && (
                          <div className="bg-slate-900/30 border-t border-slate-700/50 p-3 space-y-6 animate-in slide-in-from-top-2">
                              
                              {/* ACTIONS ROW */}
                              <div className="flex justify-between items-center">
                                  <button 
                                    onClick={() => openGroupModal(group)}
                                    className="text-xs flex items-center gap-1 text-slate-400 hover:text-white bg-slate-800 px-3 py-1.5 rounded-full border border-slate-700 transition-colors"
                                  >
                                      <Settings size={12} /> Inställningar & Konto
                                  </button>
                              </div>

                              {/* SUBCATEGORIES SECTION */}
                              <div className="space-y-3">
                                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Kategorier</h4>
                                  {group.subs.length === 0 && <div className="text-xs text-slate-600 italic pl-2">Inga kategorier kopplade.</div>}
                                  
                                  {group.subs.map(sub => {
                                      const parent = mainCategories.find(m => m.id === sub.mainCategoryId);
                                      const isEditing = editingSubId === sub.id;

                                      return (
                                          <div key={sub.id} className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/50 flex flex-col gap-3">
                                              <div className="flex justify-between items-start">
                                                  <div>
                                                      <div className="font-medium text-base text-slate-200 flex items-center gap-2">
                                                          {sub.name}
                                                          <button onClick={() => openMoveModalSub(sub)} className="text-slate-500 hover:text-blue-400" title="Flytta till annan grupp">
                                                              <ArrowRight size={12} />
                                                          </button>
                                                          <button onClick={() => handleUnlinkSubCategory(sub)} className="text-slate-600 hover:text-rose-400" title="Koppla ifrån"><X size={12}/></button>
                                                      </div>
                                                      <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-2">
                                                          <span>{parent?.name}</span>
                                                          <span>•</span>
                                                          <span>Snitt: {formatMoney(sub.avgSpend)}</span>
                                                          <span>•</span>
                                                          <span 
                                                            className={cn("cursor-pointer hover:underline", sub.spent > 0 ? "text-slate-300 hover:text-blue-400" : "text-slate-500")}
                                                            onClick={() => openDrillDown(sub.name, sub.transactions)}
                                                          >
                                                              Utfall: {formatMoney(sub.spent)}
                                                          </span>
                                                      </div>
                                                  </div>
                                                  
                                                  <div className="text-right">
                                                      <div className="text-[10px] uppercase font-bold text-slate-500 mb-0.5">Budget</div>
                                                      {isEditing ? (
                                                          <div className="flex items-center gap-1">
                                                              <input 
                                                                type="number"
                                                                className="bg-slate-900 border border-slate-600 rounded px-2 py-1 w-20 text-right text-white font-mono text-sm focus:border-blue-500 outline-none"
                                                                value={tempSubBudget}
                                                                onChange={(e) => setTempSubBudget(e.target.value)}
                                                                onKeyDown={(e) => e.key === 'Enter' && saveSubBudget(sub)}
                                                                autoFocus
                                                                placeholder="0"
                                                              />
                                                              <button onClick={() => saveSubBudget(sub)} className="bg-blue-600 text-white p-1 rounded hover:bg-blue-500"><Check size={14}/></button>
                                                          </div>
                                                      ) : (
                                                          <div 
                                                            className="text-2xl font-mono font-bold text-white cursor-pointer hover:text-blue-400 transition-colors"
                                                            onClick={() => startEditingSub(sub)}
                                                            title="Klicka för att ändra budget"
                                                          >
                                                              {formatMoney(sub.budget)}
                                                          </div>
                                                      )}
                                                  </div>
                                              </div>
                                          </div>
                                      );
                                  })}

                                  {/* CATCH ALL / UNBUDGETED ROWS FOR GROUP */}
                                  {group.isCatchAll && group.extraSpent > 0 && (
                                      <div className="bg-rose-950/20 border border-rose-500/20 p-2 rounded-lg mt-2">
                                          <div className="flex justify-between items-center">
                                              <div className="text-xs text-rose-300 font-bold flex items-center gap-1">
                                                  <AlertTriangle size={12} /> Övrigt / Ospecificerat
                                              </div>
                                              <div 
                                                className="font-mono text-rose-400 font-bold text-sm cursor-pointer hover:underline"
                                                onClick={() => openDrillDown(`${group.name} - Övrigt`, group.catchAllTransactions)}
                                              >
                                                  {formatMoney(group.extraSpent)}
                                              </div>
                                          </div>
                                      </div>
                                  )}

                                  <Button 
                                    variant="ghost" 
                                    onClick={() => { setActiveGroupId(group.id); setIsCatPickerOpen(true); }}
                                    className="w-full border border-dashed border-slate-700 text-slate-500 text-xs py-2 h-auto"
                                  >
                                      <Plus size={12} className="mr-1"/> Koppla Kategori
                                  </Button>
                              </div>

                              {/* CUSTOM POSTS SECTION (Buckets) */}
                              <div className="space-y-3">
                                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1 mt-4">Fasta Poster / Mål</h4>
                                  {group.customPosts.length === 0 && <div className="text-xs text-slate-600 italic pl-2">Inga fasta poster.</div>}

                                  {group.customPosts.map(bucket => (
                                      <div key={bucket.id} onClick={() => openBucketModal(group, bucket)} className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/50 hover:bg-slate-800 transition-colors cursor-pointer group/bucket">
                                          <div className="flex justify-between items-center">
                                              <div className="flex items-center gap-3">
                                                  <div className="p-2 bg-slate-900 rounded-lg text-slate-400">
                                                      {bucket.type === 'FIXED' && <Calendar size={16} className="text-blue-400" />}
                                                      {bucket.type === 'DAILY' && <RefreshCw size={16} className="text-orange-400" />}
                                                      {bucket.type === 'GOAL' && <Rocket size={16} className="text-purple-400" />}
                                                  </div>
                                                  <div>
                                                      <div className="text-base font-medium text-slate-200 flex items-center gap-2">
                                                          {bucket.name}
                                                          <button onClick={(e) => { e.stopPropagation(); openMoveModalBucket(bucket); }} className="text-slate-500 hover:text-blue-400" title="Flytta">
                                                              <ArrowRight size={12} />
                                                          </button>
                                                      </div>
                                                      <div className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-wider">
                                                          {bucket.type === 'FIXED' ? 'Fast' : (bucket.type === 'DAILY' ? 'Daglig' : 'Mål')}
                                                      </div>
                                                  </div>
                                              </div>
                                              
                                              <div className="text-right">
                                                  <div className="font-mono text-white text-lg font-bold">{formatMoney(bucket.cost)}</div>
                                                  {bucket.spent > 0 && (
                                                      <div 
                                                        className="text-[10px] text-rose-400 hover:text-rose-300 hover:underline cursor-pointer mt-0.5"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            openDrillDown(bucket.name, bucket.transactions);
                                                        }}
                                                      >
                                                          -{formatMoney(bucket.spent)}
                                                      </div>
                                                  )}
                                              </div>
                                          </div>
                                      </div>
                                  ))}

                                  <Button 
                                    variant="ghost" 
                                    onClick={() => openBucketModal(group)}
                                    className="w-full border border-dashed border-slate-700 text-slate-500 text-xs py-2 h-auto"
                                  >
                                      <Plus size={12} className="mr-1"/> Skapa Fast Post / Mål
                                  </Button>
                              </div>

                          </div>
                      )}
                  </div>
              );
          })}
          
          <Button variant="secondary" onClick={() => openGroupModal()} className="w-full border-dashed border-slate-700 py-4 text-slate-400 hover:text-white mt-8">
              <Plus className="w-5 h-5 mr-2" /> Skapa ny budgetgrupp
          </Button>
      </div>

      {/* --- MODALS --- */}

      {/* DRILL DOWN MODAL */}
      <Modal isOpen={!!drillDownData} onClose={() => setDrillDownData(null)} title={drillDownData?.title || 'Transaktioner'}>
          {drillDownData && (
              <div className="space-y-4">
                  {/* TOTAL SUM HEADER */}
                  <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex justify-between items-center shadow-sm">
                      <span className="text-slate-400 text-sm font-medium uppercase tracking-wider">Totalt Utfall</span>
                      <span className="text-2xl font-bold font-mono text-white">
                          {formatMoney(
                              drillDownData.transactions.reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0)
                          )}
                      </span>
                  </div>

                  {/* TRANSACTION LIST */}
                  <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                      {drillDownData.transactions.length > 0 ? (
                          drillDownData.transactions.map(t => {
                              const effAmount = getEffectiveAmount(t, reimbursementMap);
                              const isReimbursed = effAmount !== t.amount;
                              
                              return (
                                  <div key={t.id} className="flex justify-between items-center p-3 bg-slate-900/50 border border-slate-800 rounded-lg">
                                      <div className="flex-1 mr-4 overflow-hidden">
                                          <div className="text-white font-medium truncate">{t.description}</div>
                                          <div className="text-xs text-slate-500">{t.date}</div>
                                      </div>
                                      <div className="text-right">
                                          <div className="font-mono font-bold text-white whitespace-nowrap">
                                              {formatMoney(Math.abs(effAmount))}
                                          </div>
                                          {isReimbursed && (
                                              <div className="text-[10px] text-emerald-400 flex items-center justify-end gap-1">
                                                  <Link size={8} /> Orig: {formatMoney(Math.abs(t.amount))}
                                              </div>
                                          )}
                                      </div>
                                  </div>
                              );
                          })
                      ) : (
                          <div className="text-center text-slate-500 py-8 italic">Inga transaktioner hittades.</div>
                      )}
                  </div>
              </div>
          )}
          <div className="mt-4 border-t border-slate-700 pt-4 flex justify-end">
              <Button variant="secondary" onClick={() => setDrillDownData(null)}>Stäng</Button>
          </div>
      </Modal>

      {/* GROUP SETTINGS MODAL */}
      <Modal isOpen={isGroupModalOpen} onClose={() => setIsGroupModalOpen(false)} title={editingGroup?.id ? "Inställningar" : "Ny Grupp"}>
          {editingGroup && (
              <div className="space-y-4">
                  <Input label="Namn" value={editingGroup.name} onChange={e => setEditingGroup({...editingGroup, name: e.target.value})} />
                  
                  <div>
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">Finansierande Konto</label>
                      <select 
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white"
                          value={editingGroup.defaultAccountId || ''}
                          onChange={(e) => setEditingGroup({...editingGroup, defaultAccountId: e.target.value})}
                      >
                          <option value="">-- Välj Konto --</option>
                          {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.icon} {acc.name}</option>)}
                      </select>
                      <p className="text-[10px] text-slate-500 mt-1">Detta konto används för att beräkna överföringsbehov för kategorierna i denna grupp.</p>
                  </div>

                  <div className="pt-2 border-t border-slate-700">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Manuell Budget (Reserv)</label>
                      <div className="flex items-center gap-2">
                          <input 
                            type="number" 
                            className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white flex-1 font-mono"
                            value={editingLimit || ''}
                            onChange={(e) => setEditingLimit(Number(e.target.value))}
                            placeholder="0"
                          />
                          <span className="text-slate-500">kr</span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1">Används som lägsta budgetgräns (även om kategorierna är 0), bra för buffert eller ospecificerat.</p>
                  </div>

                  <Button onClick={saveGroup} className="w-full">Spara</Button>
              </div>
          )}
      </Modal>

      {/* MOVE MODAL (Unified) */}
      <Modal isOpen={isMoveModalOpen} onClose={() => setIsMoveModalOpen(false)} title="Flytta">
          {(movingSubCategory || movingBucket) && (
              <div className="space-y-4">
                  <p className="text-sm text-slate-300">
                      Välj vilken budgetgrupp du vill flytta <span className="font-bold text-white">{movingSubCategory ? movingSubCategory.name : movingBucket?.name}</span> till.
                  </p>
                  <div className="space-y-2">
                      {budgetGroups.map(g => (
                          <button 
                            key={g.id}
                            onClick={async () => {
                                if (movingSubCategory) await handleMoveSubCategory(movingSubCategory, g.id);
                                if (movingBucket) await handleMoveBucket(movingBucket, g.id);
                                setIsMoveModalOpen(false);
                            }}
                            className={cn(
                                "w-full text-left p-3 rounded-lg border transition-all flex items-center gap-3",
                                g.id === (movingSubCategory ? movingSubCategory.budgetGroupId : movingBucket?.budgetGroupId) ? "bg-blue-600/20 border-blue-500 text-blue-200" : "bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-300"
                            )}
                          >
                              <span className="text-xl">{g.icon}</span>
                              <span className="font-bold text-sm">{g.name}</span>
                              {g.id === (movingSubCategory ? movingSubCategory.budgetGroupId : movingBucket?.budgetGroupId) && <Check size={16} className="ml-auto" />}
                          </button>
                      ))}
                      <button 
                        onClick={async () => {
                            if (movingSubCategory) await handleUnlinkSubCategory(movingSubCategory);
                            if (movingBucket) await handleUnlinkBucket(movingBucket);
                            setIsMoveModalOpen(false);
                        }}
                        className="w-full text-left p-3 rounded-lg border border-dashed border-slate-600 text-slate-400 hover:text-white hover:bg-slate-800"
                      >
                          <span className="text-sm">Ta bort från grupp (Okopplad)</span>
                      </button>
                  </div>
              </div>
          )}
      </Modal>

      {/* CATEGORY PICKER MODAL (Enhanced with Grouping) */}
      <Modal isOpen={isCatPickerOpen} onClose={() => setIsCatPickerOpen(false)} title="Välj Kategori">
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
              
              {/* Only show unlinked categories grouped by Main Category */}
              {mainCategories.map(main => {
                  const unlinkedSubs = subCategories.filter(s => 
                      s.mainCategoryId === main.id && !s.budgetGroupId
                  );

                  if (unlinkedSubs.length === 0) return null;

                  return (
                      <div key={main.id} className="space-y-1">
                          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider py-1 pl-1">
                              {main.name}
                          </h4>
                          <div className="space-y-1">
                              {unlinkedSubs.map(sub => (
                                  <button 
                                    key={sub.id} 
                                    onClick={() => { if (activeGroupId) { handleMoveSubCategory(sub, activeGroupId); setIsCatPickerOpen(false); }}}
                                    className="w-full text-left bg-slate-800 p-3 rounded-lg border border-slate-700 hover:bg-slate-700 transition-colors flex justify-between items-center group"
                                  >
                                      <div>
                                          <div className="font-bold text-white text-sm">{sub.name}</div>
                                      </div>
                                      <Plus size={16} className="text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                                  </button>
                              ))}
                          </div>
                      </div>
                  );
              })}

              {subCategories.filter(s => !s.budgetGroupId).length === 0 && (
                  <div className="text-center text-slate-500 italic py-8">
                      Alla kategorier är redan kopplade till en budgetgrupp.
                  </div>
              )}
          </div>
      </Modal>

      {/* CUSTOM POST (BUCKET) MODAL */}
      <Modal isOpen={isBucketModalOpen} onClose={() => setIsBucketModalOpen(false)} title={editingBucket?.id && buckets.find(b => b.id === editingBucket.id) ? "Redigera Post" : "Ny Post"}>
          {editingBucket && (
              <div className="space-y-4">
                  <Input label="Namn" value={editingBucket.name} onChange={e => setEditingBucket({...editingBucket, name: e.target.value})} autoFocus />
                  
                  {/* Type Selector */}
                  <div className="flex bg-slate-900 rounded-lg p-1">
                      <button onClick={() => setEditingBucket({...editingBucket, type: 'FIXED'})} className={cn("flex-1 py-2 text-xs rounded transition-all", editingBucket.type === 'FIXED' ? "bg-blue-600 text-white" : "text-slate-400")}>Fast</button>
                      <button onClick={() => setEditingBucket({...editingBucket, type: 'DAILY'})} className={cn("flex-1 py-2 text-xs rounded transition-all", editingBucket.type === 'DAILY' ? "bg-orange-600 text-white" : "text-slate-400")}>Daglig</button>
                      <button onClick={() => setEditingBucket({...editingBucket, type: 'GOAL'})} className={cn("flex-1 py-2 text-xs rounded transition-all", editingBucket.type === 'GOAL' ? "bg-purple-600 text-white" : "text-slate-400")}>Mål/Dröm</button>
                  </div>

                  {editingBucket.type === 'GOAL' ? (
                      /* --- GOAL FORM (Same as DreamsView) --- */
                      <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
                          <div>
                              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider block mb-1">Kopplat Konto</label>
                              <select 
                                  value={editingBucket.accountId}
                                  onChange={(e) => setEditingBucket({...editingBucket, accountId: e.target.value})}
                                  className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              >
                                  {accounts.map(acc => (
                                      <option key={acc.id} value={acc.id}>
                                          {acc.icon} {acc.name}
                                      </option>
                                  ))}
                              </select>
                          </div>

                          <Input label="Målbelopp" type="number" value={editingBucket.targetAmount} onChange={e => setEditingBucket({...editingBucket, targetAmount: Number(e.target.value)})} />
                          
                          <div className="grid grid-cols-2 gap-4">
                              <Input label="Startdatum" type="month" value={editingBucket.startSavingDate} onChange={e => setEditingBucket({...editingBucket, startSavingDate: e.target.value})} />
                              <Input label="Slutdatum (Mål)" type="month" value={editingBucket.targetDate} onChange={e => setEditingBucket({...editingBucket, targetDate: e.target.value})} />
                          </div>

                          {/* Event Dates */}
                          <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/50 space-y-3">
                              <div className="flex items-center gap-2 text-purple-300">
                                  <Calendar size={16} />
                                  <span className="text-xs font-bold uppercase">Resa / Event (Datum)</span>
                              </div>
                              <p className="text-[10px] text-slate-400">
                                  Ange exakta datum för att automatiskt koppla korttransaktioner under resan (vid import).
                              </p>
                              <div className="grid grid-cols-2 gap-4">
                                  <Input label="Start (Dag)" type="date" value={editingBucket.eventStartDate || ''} onChange={e => setEditingBucket({...editingBucket, eventStartDate: e.target.value})} />
                                  <Input label="Slut (Dag)" type="date" value={editingBucket.eventEndDate || ''} onChange={e => setEditingBucket({...editingBucket, eventEndDate: e.target.value})} />
                              </div>
                              
                              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                                  <input 
                                      type="checkbox" 
                                      checked={!!editingBucket.autoTagEvent} 
                                      onChange={(e) => setEditingBucket({...editingBucket, autoTagEvent: e.target.checked})}
                                      className="rounded border-slate-600 bg-slate-900 text-purple-500 focus:ring-purple-500"
                                  />
                                  Auto-koppla vid import
                              </label>
                          </div>

                          {/* Payment Source */}
                          <div className="space-y-3 pt-2">
                              <div className="text-xs font-medium text-slate-400 uppercase">Finansiering</div>
                              <div className="flex flex-col gap-2">
                                  <button 
                                  onClick={() => setEditingBucket({...editingBucket, paymentSource: 'INCOME'})}
                                  className={cn("p-3 rounded-xl border text-left flex items-center gap-3", (!editingBucket.paymentSource || editingBucket.paymentSource === 'INCOME') ? "bg-purple-500/20 border-purple-500 text-white" : "border-slate-700 text-slate-400")}
                                  >
                                      <Wallet className="w-5 h-5" />
                                      <div>
                                          <div className="font-bold text-sm">Från Månadslön (Budget)</div>
                                          <div className="text-[10px] opacity-70">Skapar ett månadssparande som minskar fickpengar</div>
                                      </div>
                                  </button>
                                  <button 
                                  onClick={() => setEditingBucket({...editingBucket, paymentSource: 'BALANCE'})}
                                  className={cn("p-3 rounded-xl border text-left flex items-center gap-3", editingBucket.paymentSource === 'BALANCE' ? "bg-amber-500/20 border-amber-500 text-white" : "border-slate-700 text-slate-400")}
                                  >
                                      <PiggyBank className="w-5 h-5" />
                                      <div>
                                          <div className="font-bold text-sm">Från Kontosaldo / Sparade Medel</div>
                                          <div className="text-[10px] opacity-70">Påverkar ej månadens utrymme. Enbart för uppföljning av spenderande.</div>
                                      </div>
                                  </button>
                              </div>
                          </div>

                          <div className="space-y-2">
                              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Välj Bild</label>
                              <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                                  {DREAM_IMAGES.map((img, i) => (
                                      <button 
                                      key={i}
                                      onClick={() => setEditingBucket({...editingBucket, backgroundImage: img})}
                                      className={cn("w-16 h-16 shrink-0 rounded-lg overflow-hidden border-2 transition-all", editingBucket.backgroundImage === img ? "border-purple-500 scale-105" : "border-transparent opacity-60 hover:opacity-100")}
                                      >
                                          <img src={img} className="w-full h-full object-cover" alt="theme" />
                                      </button>
                                  ))}
                              </div>
                          </div>
                      </div>
                  ) : (
                      /* --- FIXED/DAILY FORM (Original) --- */
                      <div className="space-y-4 animate-in fade-in slide-in-from-left-4">
                          {/* Amount Input */}
                          <div className="bg-slate-800 p-3 rounded-xl border border-slate-700">
                              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">
                                  {editingBucket.type === 'DAILY' ? 'Daglig Kostnad' : 'Månadskostnad'}
                              </label>
                              <div className="flex items-center gap-2">
                                  <input 
                                    type="number" 
                                    className="bg-transparent text-3xl font-mono font-bold text-white w-full outline-none placeholder-slate-600"
                                    placeholder="0"
                                    value={editingBucket.type === 'DAILY' ? (editingBucketData.dailyAmount || '') : (editingBucketData.amount || '')}
                                    onChange={(e) => {
                                        const val = Number(e.target.value);
                                        if (editingBucket.type === 'DAILY') setEditingBucketData({ ...editingBucketData, dailyAmount: val });
                                        else setEditingBucketData({ ...editingBucketData, amount: val });
                                    }}
                                  />
                                  <span className="text-slate-500 text-xl">kr</span>
                              </div>
                          </div>

                          {/* Advanced Settings Toggle */}
                          <div className="pt-2 border-t border-slate-700">
                              <button onClick={() => setShowBucketDetails(!showBucketDetails)} className="flex items-center gap-2 text-xs text-slate-400 hover:text-white">
                                  <Settings size={12} /> Fler inställningar (Konto, Sparande, etc) {showBucketDetails ? <ChevronUp size={10}/> : <ChevronDown size={10}/>}
                              </button>
                              
                              {showBucketDetails && (
                                  <div className="mt-3 space-y-3 animate-in slide-in-from-top-1">
                                      <div>
                                          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">Konto (Finansiering)</label>
                                          <select 
                                              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm"
                                              value={editingBucket.accountId}
                                              onChange={(e) => setEditingBucket({...editingBucket, accountId: e.target.value})}
                                          >
                                              {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.icon} {acc.name}</option>)}
                                          </select>
                                      </div>
                                      <div className="flex items-center gap-3">
                                          <label className="flex items-center gap-2 text-sm text-slate-300">
                                              <input type="checkbox" checked={editingBucket.isSavings} onChange={(e) => setEditingBucket({...editingBucket, isSavings: e.target.checked})} className="rounded bg-slate-900 border-slate-600" />
                                              Är detta ett sparande?
                                          </label>
                                      </div>
                                      {editingBucket.type === 'DAILY' && (
                                          <div>
                                              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">Aktiva dagar</label>
                                              <div className="flex justify-between">
                                                  {['S','M','T','O','T','F','L'].map((d, i) => (
                                                      <button 
                                                        key={i}
                                                        onClick={() => {
                                                            const days = editingBucketData.activeDays.includes(i) ? editingBucketData.activeDays.filter(d => d !== i) : [...editingBucketData.activeDays, i];
                                                            setEditingBucketData({ ...editingBucketData, activeDays: days });
                                                        }}
                                                        className={cn("w-8 h-8 rounded-full text-xs font-bold transition-all", editingBucketData.activeDays.includes(i) ? "bg-blue-600 text-white" : "bg-slate-900 text-slate-600")}
                                                      >
                                                          {d}
                                                      </button>
                                                  ))}
                                              </div>
                                          </div>
                                      )}
                                  </div>
                              )}
                          </div>
                      </div>
                  )}

                  <div className="flex gap-2">
                      {buckets.find(b => b.id === editingBucket.id) && (
                          <Button variant="danger" onClick={deleteBucketHandler}><Trash2 size={16}/></Button>
                      )}
                      <Button onClick={saveBucket} className="flex-1">Spara</Button>
                  </div>
              </div>
          )}
      </Modal>

    </div>
  );
};
