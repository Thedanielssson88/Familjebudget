
import React, { useMemo, useState } from 'react';
import { useApp } from '../store';
import { useBudgetMonth } from '../hooks/useBudgetMonth';
import { formatMoney, getEffectiveBudgetGroupData, calculateFixedBucketCost, calculateDailyBucketCost, calculateGoalBucketCost, calculateReimbursementMap, getEffectiveAmount } from '../utils';
import { ChevronRight, ChevronDown, Check, AlertTriangle, PieChart, Edit2, Plus, Trash2, Settings, ArrowRightLeft, Rocket, Calendar, Plane, RefreshCw, Lock, ChevronUp, BarChart3 } from 'lucide-react';
import { BudgetProgressBar } from '../components/BudgetProgressBar';
import { cn, Button, Modal, Input } from '../components/components';
import { BudgetGroup, SubCategory, Bucket } from '../types';
import { startOfMonth, endOfMonth, parseISO, differenceInDays, min, max, areIntervalsOverlapping, isValid } from 'date-fns';

export const OperatingBudgetView: React.FC = () => {
  const { selectedMonth, budgetGroups, subCategories, mainCategories, transactions, buckets, accounts, settings, addBudgetGroup, updateBudgetGroup, deleteBudgetGroup, updateSubCategory, addSubCategory } = useApp();
  
  // Use the centralized hook for date logic
  const { startStr, endStr, intervalLabel } = useBudgetMonth(selectedMonth);

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedMains, setExpandedMains] = useState<Set<string>>(new Set());
  const [expandedSubs, setExpandedSubs] = useState<Set<string>>(new Set());
  
  // Expanded state for Spending Goals (Drilldown)
  const [expandedGoals, setExpandedGoals] = useState<Set<string>>(new Set());

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<BudgetGroup | null>(null);
  const [editingLimit, setEditingLimit] = useState<number>(0);
  const [useAutoLimit, setUseAutoLimit] = useState(false); // New state for Auto Mode
  const [calculatedFunding, setCalculatedFunding] = useState(0); // Store funding for modal display
  const [deleteMode, setDeleteMode] = useState(false);
  
  // New State for collapsing/expanding details
  const [showDetails, setShowDetails] = useState(false);
  
  // New Category State (inside modal)
  const [newSubName, setNewSubName] = useState('');
  const [selectedMainId, setSelectedMainId] = useState('');

  // Toggle for Events - Note: This now only affects the 'Overview' calculation/summary, 
  // but deduping logic ensures dreams don't appear in regular groups regardless of this toggle.
  const [includeEvents, setIncludeEvents] = useState(false);

  // Calculate Reimbursement Map for Net Amounts
  const reimbursementMap = useMemo(() => calculateReimbursementMap(transactions), [transactions]);

  // --- HELPER: Event Distribution Logic ---
  const calculateEventDistribution = (goalBucket: Bucket, month: string): { amount: number, label?: string } | null => {
      if (!goalBucket.eventStartDate || !goalBucket.eventEndDate) return null;

      const currentMonthStart = startOfMonth(parseISO(`${month}-01`));
      const currentMonthEnd = endOfMonth(currentMonthStart);
      const eventStart = parseISO(goalBucket.eventStartDate);
      const eventEnd = parseISO(goalBucket.eventEndDate);

      if (!isValid(eventStart) || !isValid(eventEnd)) return null;

      const overlaps = areIntervalsOverlapping(
          { start: currentMonthStart, end: currentMonthEnd },
          { start: eventStart, end: eventEnd },
          { inclusive: true }
      );

      if (!overlaps) return { amount: 0 };

      const totalEventDays = differenceInDays(eventEnd, eventStart) + 1;
      if (totalEventDays <= 0) return { amount: 0 };

      const overlapStart = max([currentMonthStart, eventStart]);
      const overlapEnd = min([currentMonthEnd, eventEnd]);
      const overlapDays = Math.max(0, differenceInDays(overlapEnd, overlapStart) + 1);

      if (overlapDays === 0) return { amount: 0 };

      const dailyBudget = goalBucket.targetAmount / totalEventDays;
      const amount = Math.round(dailyBudget * overlapDays);
      const label = `Reskassa (${overlapDays} av ${totalEventDays} dagar)`;

      return { amount, label };
  };

  // --- DATA PROCESSING ---
  const data = useMemo(() => {
    // 1. Filter Transactions (Expenses Only for this Month Interval)
    const txForMonth = transactions.filter(t => {
        if (t.isHidden) return false;
        const isExpense = t.type === 'EXPENSE' || (!t.type && t.amount < 0);
        const inRange = t.date >= startStr && t.date <= endStr;
        return isExpense && inRange;
    });

    // 2. Identify "Spending Goals" (Goals active for payout this month OR overlapping Event OR has transactions)
    const spendingGoals = buckets.map(b => {
        if (b.type !== 'GOAL') return null;

        // A. Calculate Spent This Month
        const goalTxs = txForMonth.filter(t => t.bucketId === b.id);
        const spentThisMonth = goalTxs.reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);

        // B. Calculate Spent PREVIOUSLY (Lifetime before current month start)
        // We use the global 'transactions' list for this, filtering by date < startStr
        const previousTxs = transactions.filter(t => 
            !t.isHidden &&
            t.bucketId === b.id && 
            (t.type === 'EXPENSE' || t.amount < 0) &&
            t.date < startStr
        );
        const spentPreviously = previousTxs.reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);

        // C. Check Event/Target Validity
        const eventDist = calculateEventDistribution(b, selectedMonth);
        const isEventActive = eventDist && eventDist.amount > 0;
        const isTargetMonth = b.targetDate === selectedMonth;
        const hasActivity = spentThisMonth > 0;

        // D. Visibility Check: Show if Event Overlap OR Target Month OR Has Transactions
        if (!isEventActive && !isTargetMonth && !hasActivity) return null;

        // E. Budget Logic: Remaining Lifetime Budget
        // Instead of showing just the daily pro-rated amount, we show what is LEFT of the total pot.
        // Formula: TargetAmount - SpentPreviously
        let monthlyBudget = Math.max(0, b.targetAmount - spentPreviously);
        
        let label = 'Kvar av totalbudget';
        if (isEventActive && eventDist?.label) {
            label = `${eventDist.label} (Kvar totalt)`;
        } else if (isTargetMonth) {
            label = 'Måldatum (Kvar totalt)';
        } else if (hasActivity) {
            label = 'Transaktioner finns (Kvar totalt)';
        }

        // Build Hierarchy for this Goal (Duplicate logic from groupStats, but specific to this Goal's bucketId)
        // Group by Main -> Sub
        const relevantMainIds = new Set<string>();
        goalTxs.forEach(t => { if(t.categoryMainId) relevantMainIds.add(t.categoryMainId) });

        const mains = Array.from(relevantMainIds).map(mainId => {
            const mainCat = mainCategories.find(m => m.id === mainId);
            const mainTxs = goalTxs.filter(t => t.categoryMainId === mainId);
            const mainSpent = mainTxs.reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);

            // Group by Sub
            const relevantSubIds = new Set<string>();
            mainTxs.forEach(t => { if(t.categorySubId) relevantSubIds.add(t.categorySubId) });

            const subs = Array.from(relevantSubIds).map(subId => {
                const subCat = subCategories.find(s => s.id === subId);
                const subTxs = mainTxs.filter(t => t.categorySubId === subId);
                const subSpent = subTxs.reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);
                return { id: subId, name: subCat?.name || 'Okänd', spent: subSpent, transactions: subTxs };
            });

            // Handle unassigned subs within main
            const unassignedTxs = mainTxs.filter(t => !t.categorySubId);
            if (unassignedTxs.length > 0) {
                const unTotal = unassignedTxs.reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);
                subs.push({ id: 'unassigned', name: 'Övrigt', spent: unTotal, transactions: unassignedTxs });
            }

            return { id: mainId, name: mainCat?.name || 'Okänd', spent: mainSpent, subs };
        });

        // Handle completely uncategorized within goal
        const uncategorizedGoalTxs = goalTxs.filter(t => !t.categoryMainId);
        if (uncategorizedGoalTxs.length > 0) {
            const unSpent = uncategorizedGoalTxs.reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);
            mains.push({ 
                id: 'orphan', 
                name: 'Okategoriserat', 
                spent: unSpent, 
                subs: [{ id: 'orphan-sub', name: 'Övrigt', spent: unSpent, transactions: uncategorizedGoalTxs }] 
            });
        }

        return { ...b, monthlyBudget, label, spent: spentThisMonth, mains };
    }).filter((g): g is NonNullable<typeof g> => g !== null);

    // 3. Build Hierarchy per Budget Group
    const groupStats = budgetGroups.map(group => {
        
        // A. Calculate Total Funding from Cash Flow (Transfers)
        const fundingBuckets = buckets.filter(b => group.linkedBucketIds?.includes(b.id));
        const totalFunding = fundingBuckets.reduce((sum, b) => {
            if (b.linkedGoalId) {
                const parentGoal = buckets.find(g => g.id === b.linkedGoalId);
                if (parentGoal) {
                    const eventDist = calculateEventDistribution(parentGoal, selectedMonth);
                    if (eventDist) return sum + eventDist.amount;
                }
            }
            if (b.type === 'FIXED') return sum + calculateFixedBucketCost(b, selectedMonth);
            if (b.type === 'DAILY') return sum + calculateDailyBucketCost(b, selectedMonth, settings.payday);
            if (b.type === 'GOAL') return sum + calculateGoalBucketCost(b, selectedMonth);
            return sum;
        }, 0);

        // B. Determine Budget Limit
        const explicitData = group.monthlyData?.[selectedMonth];
        let monthlyLimit = 0;
        let isAutoCalculated = false;
        let isExplicitlyDeleted = false;

        if (explicitData) {
            isExplicitlyDeleted = !!explicitData.isExplicitlyDeleted;
            if (!isExplicitlyDeleted) {
                monthlyLimit = explicitData.limit;
            }
        } else if (group.linkedBucketIds && group.linkedBucketIds.length > 0) {
            monthlyLimit = totalFunding;
            isAutoCalculated = true;
        } else {
            const { data: inheritedData } = getEffectiveBudgetGroupData(group, selectedMonth);
            if (inheritedData) {
                isExplicitlyDeleted = !!inheritedData.isExplicitlyDeleted;
                monthlyLimit = inheritedData.limit;
            }
        }

        if (isExplicitlyDeleted && !group.isCatchAll) return null;
        
        const fundingGap = totalFunding - monthlyLimit;
        const assignedSubs = subCategories.filter(s => s.budgetGroupId === group.id);
        const assignedSubIds = new Set(assignedSubs.map(s => s.id));
        
        // Filter transactions belonging to this group
        const groupTxs = txForMonth.filter(t => {
            // STRICT EXCLUSION: If a transaction is linked to a Dream/Goal bucket, 
            // it MUST NOT appear in regular budget groups. It belongs to "Spending Goals".
            if (t.bucketId) {
                const bucket = buckets.find(b => b.id === t.bucketId);
                if (bucket && bucket.type === 'GOAL') {
                    return false; // Skip dream transactions here
                }
            }

            if (t.categorySubId && assignedSubIds.has(t.categorySubId)) return true;
            if (group.isCatchAll) {
                if (!t.categorySubId) return true;
                const sub = subCategories.find(s => s.id === t.categorySubId);
                if (!sub || !sub.budgetGroupId) return true;
            }
            return false;
        });

        const groupSpent = groupTxs.reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);

        // Group by Main Category within this Budget Group
        const relevantMainIds = new Set<string>();
        assignedSubs.forEach(s => relevantMainIds.add(s.mainCategoryId));
        groupTxs.forEach(t => {
            if (t.categoryMainId) relevantMainIds.add(t.categoryMainId);
        });

        const mainStats = Array.from(relevantMainIds).map(mainId => {
            const mainCat = mainCategories.find(m => m.id === mainId);
            const mainName = mainCat?.name || (group.isCatchAll ? 'Ospecificerat' : 'Okänd Huvudkategori');

            const mainTxs = groupTxs.filter(t => {
                if (t.categoryMainId) return t.categoryMainId === mainId;
                return false;
            });
            
            const assignedInMain = assignedSubs.filter(s => s.mainCategoryId === mainId);
            const txSubIds = new Set(mainTxs.map(t => t.categorySubId).filter(id => !!id));
            const activeSubs = subCategories.filter(s => s.mainCategoryId === mainId && txSubIds.has(s.id));

            const combinedSubsMap = new Map<string, SubCategory>();
            assignedInMain.forEach(s => combinedSubsMap.set(s.id, s));
            activeSubs.forEach(s => combinedSubsMap.set(s.id, s));

            const relevantSubs = Array.from(combinedSubsMap.values());
            const coveredTxIds = new Set<string>();
            
            const subStats = relevantSubs.map(sub => {
                const subTxs = mainTxs.filter(t => t.categorySubId === sub.id);
                subTxs.forEach(t => coveredTxIds.add(t.id));
                const subSpent = subTxs.reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);
                return { id: sub.id, name: sub.name, spent: subSpent, transactions: subTxs };
            }).filter(s => s.spent > 0 || assignedInMain.some(as => as.id === s.id))
              .sort((a,b) => b.spent - a.spent);

            const remainingTxs = mainTxs.filter(t => !coveredTxIds.has(t.id));
            const remainingSpent = remainingTxs.reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);
            
            if (remainingSpent > 0.01) {
                subStats.push({ id: `unassigned-${mainId}`, name: 'Ospecificerat / Övrigt', spent: remainingSpent, transactions: remainingTxs });
            }

            const mainSpent = mainTxs.reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);

            return { id: mainId, name: mainName, spent: mainSpent, subs: subStats };
        }).filter(m => m.subs.length > 0 || m.spent > 0).sort((a,b) => b.spent - a.spent);
          
        const totalAllocatedToMains = mainStats.reduce((sum, m) => sum + m.spent, 0);
        const orphanSpent = groupSpent - totalAllocatedToMains;
        
        if (orphanSpent > 0.01) {
             const orphanTxs = groupTxs.filter(t => !t.categoryMainId);
             mainStats.push({
                 id: 'orphan',
                 name: 'Helt okategoriserat',
                 spent: orphanSpent,
                 subs: [{ id: 'orphan-sub', name: 'Transaktioner utan kategori', spent: orphanSpent, transactions: orphanTxs }]
             });
        }

        return {
            ...group,
            monthlyLimit,
            isAutoCalculated,
            spent: groupSpent,
            mains: mainStats,
            totalFunding,
            fundingGap
        };

    }).filter((g): g is NonNullable<typeof g> => g !== null)
      .sort((a, b) => {
        if (a.isCatchAll) return 1;
        if (b.isCatchAll) return -1;
        return a.name.localeCompare(b.name);
    });

    const totalLimit = groupStats.reduce((sum, g) => sum + g.monthlyLimit, 0);
    const totalSpent = groupStats.reduce((sum, g) => sum + g.spent, 0);

    return { groupStats, totalLimit, totalSpent, spendingGoals, txForMonth };

  }, [transactions, selectedMonth, budgetGroups, subCategories, mainCategories, buckets, settings.payday, includeEvents, startStr, endStr, reimbursementMap]);

  // --- HANDLERS ---
  const toggleGroup = (id: string) => {
      const next = new Set(expandedGroups);
      if (next.has(id)) next.delete(id); else next.add(id);
      setExpandedGroups(next);
  };

  const toggleMain = (id: string) => {
      const next = new Set(expandedMains);
      if (next.has(id)) next.delete(id); else next.add(id);
      setExpandedMains(next);
  };

  const toggleSub = (id: string) => {
      const next = new Set(expandedSubs);
      if (next.has(id)) next.delete(id); else next.add(id);
      setExpandedSubs(next);
  };

  const toggleGoal = (id: string) => {
      const next = new Set(expandedGoals);
      if (next.has(id)) next.delete(id); else next.add(id);
      setExpandedGoals(next);
  };

  const openModal = (group?: BudgetGroup) => {
      setDeleteMode(false);
      if (group) {
          setEditingGroup(group);
          setShowDetails(false);
          
          // Determine logic for Limit Field
          const explicitData = group.monthlyData?.[selectedMonth];
          const hasLinks = group.linkedBucketIds && group.linkedBucketIds.length > 0;
          
          // Re-calculate funding for display/logic
          const fundingBuckets = buckets.filter(b => group.linkedBucketIds?.includes(b.id));
          const funding = fundingBuckets.reduce((sum, b) => {
                if (b.linkedGoalId) {
                    const parentGoal = buckets.find(g => g.id === b.linkedGoalId);
                    if (parentGoal) {
                        const eventDist = calculateEventDistribution(parentGoal, selectedMonth);
                        if (eventDist) return sum + eventDist.amount;
                    }
                }
                if (b.type === 'FIXED') return sum + calculateFixedBucketCost(b, selectedMonth);
                if (b.type === 'DAILY') return sum + calculateDailyBucketCost(b, selectedMonth, settings.payday);
                if (b.type === 'GOAL') return sum + calculateGoalBucketCost(b, selectedMonth);
                return sum;
          }, 0);
          setCalculatedFunding(funding);

          // If no explicit override for this month AND we have links -> Auto Mode
          if (!explicitData && hasLinks) {
              setUseAutoLimit(true);
              setEditingLimit(funding);
          } else {
              setUseAutoLimit(false);
              // Fallback to inheritance or explicit value
              if (explicitData) {
                  setEditingLimit(explicitData.limit);
              } else {
                  const { data } = getEffectiveBudgetGroupData(group, selectedMonth);
                  setEditingLimit(data?.limit || 0);
              }
          }
      } else {
          setEditingGroup({
              id: '',
              name: '',
              icon: '📁',
              monthlyData: {},
              linkedBucketIds: [],
              forecastType: 'VARIABLE'
          });
          setEditingLimit(0);
          setUseAutoLimit(false);
          setCalculatedFunding(0);
          setShowDetails(true); // Auto expand for new groups
      }
      setIsModalOpen(true);
  };

  const handleSaveGroup = async () => {
      if (!editingGroup) return;

      if (!editingGroup.id) {
          // New Group
          await addBudgetGroup(editingGroup.name || 'Ny Grupp', editingLimit, editingGroup.icon || '📁');
      } else {
          // Update Existing
          const newMonthlyData = { ...editingGroup.monthlyData };
          
          if (useAutoLimit) {
              // If Auto: REMOVE explicit entry for this month so it falls back to auto calculation in the view
              delete newMonthlyData[selectedMonth];
          } else {
              // If Manual: SET explicit entry
              newMonthlyData[selectedMonth] = { limit: editingLimit, isExplicitlyDeleted: false };
          }

          const updatedGroup = {
              ...editingGroup,
              monthlyData: newMonthlyData
          };
          await updateBudgetGroup(updatedGroup);
      }
      setIsModalOpen(false);
  };

  const handleDelete = (scope: 'THIS_MONTH' | 'THIS_AND_FUTURE' | 'ALL') => {
      if (editingGroup?.id) {
          deleteBudgetGroup(editingGroup.id, selectedMonth, scope);
          setIsModalOpen(false);
      }
  };

  const handleAddSubCategory = async () => {
      if (!newSubName.trim() || !selectedMainId || !editingGroup?.id) return;
      const newId = await addSubCategory(selectedMainId, newSubName);
      const sub: SubCategory = { id: newId, mainCategoryId: selectedMainId, name: newSubName };
      await updateSubCategory({ ...sub, budgetGroupId: editingGroup.id });
      setNewSubName('');
  };

  const handleRemoveCategory = (sub: SubCategory) => {
      updateSubCategory({ ...sub, budgetGroupId: undefined });
  };

  const toggleLinkedBucket = (bucketId: string) => {
      if (!editingGroup) return;
      const currentIds = editingGroup.linkedBucketIds || [];
      const newIds = currentIds.includes(bucketId) 
        ? currentIds.filter(id => id !== bucketId)
        : [...currentIds, bucketId];
      
      const newGroup = { ...editingGroup, linkedBucketIds: newIds };
      setEditingGroup(newGroup);

      // Re-calc funding dynamically when toggling
      const funding = buckets.filter(b => newIds.includes(b.id)).reduce((sum, b) => {
            if (b.type === 'FIXED') return sum + calculateFixedBucketCost(b, selectedMonth);
            if (b.type === 'DAILY') return sum + calculateDailyBucketCost(b, selectedMonth, settings.payday);
            if (b.type === 'GOAL') return sum + calculateGoalBucketCost(b, selectedMonth);
            return sum;
      }, 0);
      setCalculatedFunding(funding);
      
      // If in Auto Mode, update limit immediately
      if (useAutoLimit) {
          setEditingLimit(funding);
      }
  };

  return (
    <div className="space-y-6 pb-24 animate-in slide-in-from-right duration-300">
      <header>
          <div className="flex justify-between items-start">
              <div className="flex items-center gap-3 mb-2">
                <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-2 rounded-xl text-white">
                    <PieChart className="w-6 h-6" />
                </div>
                <div>
                    <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-400">Driftbudget</h1>
                    <div className="text-[10px] text-slate-400 font-mono bg-slate-800/50 px-2 py-0.5 rounded-full inline-flex items-center gap-1 mt-1">
                        <Calendar size={10} /> {intervalLabel}
                    </div>
                </div>
              </div>
          </div>
          <p className="text-slate-400 text-sm">Uppföljning av kostnader per Budgetgrupp och Kategori.</p>
      </header>

      {/* DASHBOARD SUMMARY */}
      <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700 flex justify-between items-center shadow-lg">
          <div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Total Driftbudget</div>
              <div className="text-2xl font-mono font-bold text-white">{formatMoney(data.totalLimit)}</div>
          </div>
          <div className="text-right">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Totalt Utfall</div>
              <div className={cn("text-2xl font-mono font-bold", data.totalSpent > data.totalLimit ? "text-rose-400" : "text-emerald-400")}>
                  {formatMoney(data.totalSpent)}
              </div>
          </div>
      </div>
      
      <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
         <div 
            className={cn("h-full transition-all duration-500", data.totalSpent > data.totalLimit ? "bg-rose-500" : "bg-emerald-500")}
            style={{ width: `${Math.min((data.totalSpent / (data.totalLimit || 1))*100, 100)}%` }}
         />
      </div>

      {/* BUDGET GROUPS */}
      <div className="space-y-4">
          {data.groupStats.map(group => {
              const isExpanded = expandedGroups.has(group.id);
              const remaining = group.monthlyLimit - group.spent;
              const isOver = remaining < 0;
              const hasFundingSource = group.linkedBucketIds && group.linkedBucketIds.length > 0;
              const isUnderFunded = group.fundingGap < 0;

              return (
                  <div key={group.id} className={cn("bg-surface rounded-xl overflow-hidden border transition-all shadow-md", group.isCatchAll ? "border-dashed border-slate-600" : "border-slate-700")}>
                      {/* GROUP HEADER */}
                      <div 
                        className="p-4 cursor-pointer hover:bg-slate-800/80 transition-colors"
                        onClick={() => toggleGroup(group.id)}
                      >
                          <div className="flex justify-between items-start mb-2">
                              <div className="flex items-center gap-3">
                                  {isExpanded ? <ChevronDown className="w-5 h-5 text-emerald-400"/> : <ChevronRight className="w-5 h-5 text-slate-500"/>}
                                  <div>
                                      <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                          {group.icon} {group.name}
                                          {isOver && <AlertTriangle className="w-4 h-4 text-rose-500" />}
                                      </h3>
                                      
                                      {/* FUNDING STATUS INDICATOR */}
                                      <div className="text-xs mt-1">
                                          {hasFundingSource ? (
                                              group.isAutoCalculated ? (
                                                  <span className="text-blue-400 flex items-center gap-1 font-medium bg-blue-500/10 px-1.5 py-0.5 rounded">
                                                      <RefreshCw size={10} /> Auto ({formatMoney(group.monthlyLimit)})
                                                  </span>
                                              ) : (
                                                  isUnderFunded ? (
                                                      <span className="text-amber-500 flex items-center gap-1 font-medium animate-pulse" title={`Du behöver föra över ${formatMoney(Math.abs(group.fundingGap))} mer till kopplade konton.`}>
                                                          <AlertTriangle size={12} /> Underfinansierad ({formatMoney(group.fundingGap)})
                                                      </span>
                                                  ) : (
                                                      <span className="text-emerald-500 flex items-center gap-1 font-medium">
                                                          <Check size={12} /> Finansiering säkrad ({formatMoney(group.totalFunding)})
                                                      </span>
                                                  )
                                              )
                                          ) : (
                                              !group.isCatchAll && <span className="text-slate-500 italic flex items-center gap-1"><ArrowRightLeft size={10}/> Ingen finansieringskälla kopplad</span>
                                          )}
                                          {group.isCatchAll && <span className="text-[10px] text-orange-400 uppercase font-bold bg-orange-500/10 px-1 rounded inline-block mt-0.5">Övrigt</span>}
                                      </div>
                                  </div>
                              </div>
                              
                              <div className="flex items-center justify-end gap-2 group/edit">
                                  <span className="font-mono font-bold text-white">{formatMoney(group.spent)}</span>
                                  <span className="text-slate-500 text-xs">/ {formatMoney(group.monthlyLimit)}</span>
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); openModal(group); }} 
                                    className="p-1 text-slate-500 hover:text-white transition-colors"
                                  >
                                      <Settings size={14} />
                                  </button>
                              </div>
                          </div>
                          <BudgetProgressBar spent={group.spent} total={group.monthlyLimit} />
                      </div>

                      {/* MAIN CATEGORIES (Level 2) */}
                      {isExpanded && (
                          <div className="bg-slate-900/30 border-t border-slate-700/50">
                              {group.mains.length === 0 && (
                                  <div className="p-4 text-center text-sm text-slate-500 italic">Inga utgifter registrerade.</div>
                              )}
                              
                              {group.mains.map(main => {
                                  const mainKey = `${group.id}-${main.id}`;
                                  const isMainExpanded = expandedMains.has(mainKey);
                                  
                                  return (
                                      <div key={mainKey} className="border-b border-slate-700/30 last:border-0">
                                          <div 
                                            className="px-4 py-3 flex justify-between items-center cursor-pointer hover:bg-slate-800/40"
                                            onClick={() => toggleMain(mainKey)}
                                          >
                                              <div className="flex items-center gap-2 pl-4">
                                                   {isMainExpanded ? <ChevronDown className="w-4 h-4 text-slate-400"/> : <ChevronRight className="w-4 h-4 text-slate-600"/>}
                                                   <span className="text-sm font-medium text-slate-200">{main.name}</span>
                                              </div>
                                              <div className="text-sm font-mono text-slate-300">
                                                  {formatMoney(main.spent)}
                                              </div>
                                          </div>

                                          {/* SUB CATEGORIES (Level 3) */}
                                          {isMainExpanded && (
                                              <div className="bg-slate-950/30 pb-2">
                                                  {main.subs.map(sub => {
                                                      const subKey = `${group.id}-${main.id}-${sub.id}`;
                                                      const isSubExpanded = expandedSubs.has(subKey);

                                                      return (
                                                        <div key={subKey} className="flex flex-col">
                                                            <div 
                                                                className="pl-12 pr-4 py-2 flex justify-between items-start text-xs hover:bg-white/5 cursor-pointer"
                                                                onClick={() => toggleSub(subKey)}
                                                            >
                                                                <div className="flex items-center gap-2">
                                                                    {isSubExpanded ? <ChevronDown className="w-3 h-3 text-slate-500"/> : <ChevronRight className="w-3 h-3 text-slate-500"/>}
                                                                    <div className="flex flex-col">
                                                                        <span className="text-slate-400 font-medium">{sub.name}</span>
                                                                        <span className="text-slate-600 text-[10px]">{sub.transactions.length} transaktioner</span>
                                                                    </div>
                                                                </div>
                                                                <div className="text-right">
                                                                    <span className="text-slate-300 font-mono">{formatMoney(sub.spent)}</span>
                                                                </div>
                                                            </div>

                                                            {/* TRANSACTION LIST (Level 4) */}
                                                            {isSubExpanded && sub.transactions.length > 0 && (
                                                                <div className="pl-16 pr-4 pb-3 space-y-1">
                                                                    {sub.transactions.map(t => {
                                                                        const eff = getEffectiveAmount(t, reimbursementMap);
                                                                        // If fully reimbursed (net 0), should we show it? Yes, maybe as 0 kr.
                                                                        
                                                                        return (
                                                                            <div key={t.id} className="flex justify-between items-center text-[10px] py-1 border-b border-white/5 last:border-0">
                                                                                <div className="flex flex-col max-w-[70%]">
                                                                                    <span className="text-slate-400 truncate">{t.description}</span>
                                                                                    {t.bucketId && <span className="text-[9px] text-purple-400 flex items-center gap-0.5"><Plane size={8}/> Kopplad till event</span>}
                                                                                </div>
                                                                                <div className="flex gap-2 text-right">
                                                                                    <span className="text-slate-600">{t.date}</span>
                                                                                    <span className="text-slate-300 font-mono">{formatMoney(eff)}</span>
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            )}
                                                        </div>
                                                      );
                                                  })}
                                              </div>
                                          )}
                                      </div>
                                  );
                              })}
                          </div>
                      )}
                  </div>
              );
          })}

          <Button variant="secondary" onClick={() => openModal()} className="w-full border-dashed border-slate-700 py-4 text-slate-400 hover:text-white mt-8">
              <Plus className="w-5 h-5 mr-2" /> Skapa ny budgetgrupp
          </Button>

          {/* --- SPENDING GOALS SECTION (Planerade Inköp) --- */}
          {data.spendingGoals.length > 0 && (
            <div className="mt-12 space-y-4 animate-in fade-in slide-in-from-bottom-4 border-t border-slate-700/50 pt-8">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Rocket className="text-purple-400 w-5 h-5" /> Planerade Inköp (Från sparande)
                </h3>
                <p className="text-xs text-slate-400">Här visas aktiva sparmål/resor som är redo att användas denna månad.</p>
                
                {data.spendingGoals.map(goal => {
                    const isExpanded = expandedGoals.has(goal.id);
                    // Use the calculated proportional budget instead of total target
                    const budget = goal.monthlyBudget;
                    const spent = goal.spent;

                    return (
                        <div key={goal.id} className="bg-slate-800 rounded-xl overflow-hidden border border-purple-500/30 shadow-lg">
                            <div 
                                className="p-4 relative cursor-pointer hover:bg-slate-700/50 transition-colors"
                                onClick={() => toggleGoal(goal.id)}
                            >
                                <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                                    <Rocket className="w-24 h-24 text-purple-500" />
                                </div>
                                <div className="flex justify-between items-center mb-2 relative z-10">
                                    <div className="flex items-center gap-3">
                                        {isExpanded ? <ChevronDown className="w-5 h-5 text-purple-400"/> : <ChevronRight className="w-5 h-5 text-slate-500"/>}
                                        <div className="bg-purple-500/20 p-2 rounded-lg">
                                            <span className="text-xl">🎯</span>
                                        </div>
                                        <div>
                                            <div className="font-bold text-white">{goal.name}</div>
                                            <div className="text-xs text-purple-300">{goal.label || "Sparat kapital används"}</div>
                                        </div>
                                    </div>
                                    <div className="text-right relative z-10">
                                        <div className="text-xl font-mono font-bold text-white">{formatMoney(spent)}</div>
                                        <div className="text-xs text-slate-400">av {formatMoney(budget)}</div>
                                    </div>
                                </div>
                                
                                <BudgetProgressBar 
                                    spent={spent} 
                                    total={budget} 
                                    label="Förbrukat av budget"
                                    className="relative z-10"
                                />
                            </div>

                            {/* GOAL BREAKDOWN (Categories for the trip) */}
                            {isExpanded && (
                                <div className="bg-slate-900/50 border-t border-purple-500/20">
                                    {goal.mains.length === 0 && (
                                        <div className="p-4 text-center text-sm text-slate-500 italic">Inga utgifter registrerade för denna dröm.</div>
                                    )}
                                    {goal.mains.map(main => {
                                        const mainKey = `${goal.id}-${main.id}`;
                                        const isMainExpanded = expandedMains.has(mainKey);
                                        return (
                                            <div key={mainKey} className="border-b border-purple-900/30 last:border-0">
                                                <div 
                                                    className="px-4 py-3 flex justify-between items-center cursor-pointer hover:bg-purple-900/10"
                                                    onClick={() => toggleMain(mainKey)}
                                                >
                                                    <div className="flex items-center gap-2 pl-4">
                                                        {isMainExpanded ? <ChevronDown className="w-4 h-4 text-slate-400"/> : <ChevronRight className="w-4 h-4 text-slate-600"/>}
                                                        <span className="text-sm font-medium text-purple-100">{main.name}</span>
                                                    </div>
                                                    <div className="text-sm font-mono text-purple-200">
                                                        {formatMoney(main.spent)}
                                                    </div>
                                                </div>

                                                {/* Sub Categories inside Goal */}
                                                {isMainExpanded && (
                                                    <div className="bg-slate-950/30 pb-2">
                                                        {main.subs.map(sub => (
                                                            <div key={`${mainKey}-${sub.id}`} className="flex flex-col">
                                                                <div className="pl-12 pr-4 py-2 flex justify-between items-center text-xs">
                                                                    <span className="text-slate-400 font-medium">{sub.name}</span>
                                                                    <span className="text-slate-300 font-mono">{formatMoney(sub.spent)}</span>
                                                                </div>
                                                                {/* Transactions List */}
                                                                <div className="pl-16 pr-4 pb-1 space-y-1">
                                                                    {sub.transactions.map(t => (
                                                                        <div key={t.id} className="flex justify-between items-center text-[10px] py-1 border-b border-white/5 last:border-0">
                                                                            <span className="text-slate-500 truncate max-w-[70%]">{t.description}</span>
                                                                            <div className="flex gap-2">
                                                                                <span className="text-slate-600">{t.date}</span>
                                                                                <span className="text-slate-400 font-mono">{formatMoney(getEffectiveAmount(t, reimbursementMap))}</span>
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        )}
      </div>

      {/* EDIT MODAL */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingGroup?.id ? `Redigera ${editingGroup.name}` : "Ny Budgetgrupp"}>
          {editingGroup && (
              <div className="space-y-6">
                  {/* Basic Info */}
                  <div className="space-y-0">
                      
                      <div className={cn(
                          "bg-slate-800/50 border border-slate-700 transition-all",
                          showDetails ? "p-3 rounded-xl flex items-center justify-between gap-4" : "p-4 rounded-2xl"
                      )}>
                          <div className={showDetails ? "text-left" : "text-center w-full"}>
                              <label className={cn("text-xs font-bold text-slate-400 uppercase tracking-wider block transition-all", showDetails ? "mb-0" : "mb-2")}>
                                  Budget (Limit)
                              </label>
                              {showDetails && useAutoLimit && (
                                  <div className="text-[10px] text-blue-400 flex items-center gap-1 mt-0.5">
                                      <Lock size={10} /> Auto
                                  </div>
                              )}
                          </div>

                          <div className={cn("flex items-center gap-2", showDetails ? "justify-end w-auto" : "justify-center w-full")}>
                              <input 
                                type="number" 
                                value={editingLimit || ''} 
                                onChange={e => {
                                    setEditingLimit(Number(e.target.value));
                                    if (useAutoLimit) setUseAutoLimit(false);
                                }} 
                                disabled={useAutoLimit}
                                className={cn("bg-transparent font-mono font-bold focus:outline-none placeholder-slate-700 transition-all", 
                                    useAutoLimit ? "text-blue-400" : "text-white",
                                    showDetails ? "text-2xl text-right w-32" : "text-5xl text-center w-full"
                                )}
                                placeholder="0"
                                autoFocus={!editingGroup.name}
                              />
                              {!showDetails && <span className="text-slate-500 text-xl">kr</span>}
                          </div>
                          
                          {/* AUTO Toggle in Collapsed Mode */}
                          {!showDetails && calculatedFunding > 0 && (
                              <div className="mt-4 pt-3 border-t border-slate-700/50 flex flex-col items-center gap-2 animate-in slide-in-from-top-1">
                                  <div className="text-xs text-slate-400">
                                      Finansiering (Kassaflöde): <span className="font-mono text-white font-bold">{formatMoney(calculatedFunding)}</span>
                                  </div>
                                  
                                  {useAutoLimit ? (
                                      <button 
                                        onClick={() => setUseAutoLimit(false)}
                                        className="text-xs bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded-full flex items-center gap-1 transition-colors"
                                      >
                                          <Edit2 size={12} /> Ändra manuellt
                                      </button>
                                  ) : (
                                      <button 
                                        onClick={() => {
                                            setUseAutoLimit(true);
                                            setEditingLimit(calculatedFunding);
                                        }}
                                        className="text-xs bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 px-3 py-1.5 rounded-full flex items-center gap-1 transition-colors"
                                      >
                                          <RefreshCw size={12} /> Återställ till Auto
                                      </button>
                                  )}
                              </div>
                          )}
                      </div>

                      <div className="border-t border-slate-700 pt-2 mt-4">
                        <button 
                            onClick={() => setShowDetails(!showDetails)}
                            className="flex items-center justify-between w-full p-2 text-sm text-slate-400 hover:text-white transition-colors"
                        >
                            <span className="flex items-center gap-2"><Settings className="w-4 h-4" /> Inställningar (Namn, Typ, Källa)</span>
                            {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                        
                        {showDetails && (
                            <div className="space-y-4 pt-4 animate-in slide-in-from-top-2">
                                <Input label="Namn" value={editingGroup.name} onChange={e => setEditingGroup({...editingGroup, name: e.target.value})} />
                                
                                {/* FORECAST TYPE SELECTOR */}
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">Prognostyp</label>
                                    <div className="flex bg-slate-900 p-1 rounded-lg">
                                        <button 
                                            onClick={() => setEditingGroup({...editingGroup, forecastType: 'VARIABLE'})}
                                            className={cn(
                                                "flex-1 px-4 py-2 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-2",
                                                (!editingGroup.forecastType || editingGroup.forecastType === 'VARIABLE') ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-white"
                                            )}
                                        >
                                            <BarChart3 size={14} />
                                            Rörlig (Mat/Nöje)
                                        </button>
                                        <button 
                                            onClick={() => setEditingGroup({...editingGroup, forecastType: 'FIXED'})}
                                            className={cn(
                                                "flex-1 px-4 py-2 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-2",
                                                editingGroup.forecastType === 'FIXED' ? "bg-blue-600 text-white shadow" : "text-slate-400 hover:text-white"
                                            )}
                                        >
                                            <Calendar size={14} />
                                            Fast (Räkningar)
                                        </button>
                                    </div>
                                    <div className="mt-2 text-[10px] text-slate-500 italic px-1">
                                        {(!editingGroup.forecastType || editingGroup.forecastType === 'VARIABLE') 
                                            ? "Prognos baseras på snittförbrukning hittills + kvarvarande dagar." 
                                            : "Prognos antar att hela budgetbeloppet kommer spenderas (om det inte redan överskridits)."}
                                    </div>
                                </div>

                                {/* Auto Logic in Expanded Mode */}
                                {calculatedFunding > 0 && (
                                   <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700 flex justify-between items-center mt-4">
                                       <div className="text-xs text-slate-400">
                                          <div>Finansiering (Kassaflöde)</div>
                                          <div className="font-mono text-white font-bold">{formatMoney(calculatedFunding)}</div>
                                       </div>
                                       {useAutoLimit ? (
                                          <button 
                                            onClick={() => setUseAutoLimit(false)}
                                            className="text-xs bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded-full flex items-center gap-1 transition-colors"
                                          >
                                              <Edit2 size={12} /> Ändra
                                          </button>
                                      ) : (
                                          <button 
                                            onClick={() => {
                                                setUseAutoLimit(true);
                                                setEditingLimit(calculatedFunding);
                                            }}
                                            className="text-xs bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 px-3 py-1.5 rounded-full flex items-center gap-1 transition-colors"
                                          >
                                              <RefreshCw size={12} /> Auto
                                          </button>
                                      )}
                                   </div>
                                )}

                                {/* Icon */}
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">Ikon</label>
                                    <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                                        {['🏠','🚗','🍔','💊','🎉','👶','🔧','🧥','🛒','✈️','🐶'].map(icon => (
                                            <button 
                                                key={icon}
                                                onClick={() => setEditingGroup({...editingGroup, icon})}
                                                className={cn("w-10 h-10 rounded-lg flex items-center justify-center text-xl transition-all", editingGroup.icon === icon ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-400 hover:bg-slate-700")}
                                            >
                                                {icon}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                
                                {/* FUNDING SOURCE (Link to Buckets) */}
                                {!editingGroup.isCatchAll && (
                                    <div className="border-t border-slate-700 pt-4 space-y-3">
                                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                            <ArrowRightLeft size={16} /> Finansiering / Källa
                                        </h3>
                                        <p className="text-xs text-slate-400">Välj vilka överföringar (Kassaflöde) som finansierar denna grupp.</p>
                                        
                                        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-3 max-h-48 overflow-y-auto no-scrollbar space-y-4">
                                            {accounts.map(acc => {
                                                const accBuckets = buckets.filter(b => b.accountId === acc.id);
                                                if (accBuckets.length === 0) return null;
                                                return (
                                                    <div key={acc.id}>
                                                        <div className="text-[10px] text-slate-500 font-bold uppercase mb-1 flex items-center gap-1">
                                                            <span>{acc.icon}</span> {acc.name}
                                                        </div>
                                                        <div className="space-y-1">
                                                            {accBuckets.map(bucket => {
                                                                const isChecked = editingGroup.linkedBucketIds?.includes(bucket.id);
                                                                
                                                                // CHECK IF BUCKET IS USED BY ANOTHER GROUP
                                                                const ownerGroup = budgetGroups.find(g => g.id !== editingGroup.id && g.linkedBucketIds?.includes(bucket.id));
                                                                const isDisabled = !!ownerGroup;

                                                                return (
                                                                    <label key={bucket.id} className={cn(
                                                                        "flex items-center gap-2 p-2 rounded transition-colors border border-transparent",
                                                                        isDisabled ? "opacity-50 cursor-not-allowed bg-slate-900/50" : "hover:bg-slate-700/50 cursor-pointer"
                                                                    )}>
                                                                        <div className={cn("w-4 h-4 rounded border flex items-center justify-center transition-colors", 
                                                                            isChecked ? "bg-emerald-500 border-emerald-500" : "border-slate-600",
                                                                            isDisabled && "border-slate-700 bg-slate-800"
                                                                        )}>
                                                                            {isChecked && <Check size={10} className="text-white" />}
                                                                        </div>
                                                                        <div className="flex-1 min-w-0">
                                                                            <div className="flex justify-between items-center">
                                                                                <span className="text-sm text-slate-300 truncate">{bucket.name}</span>
                                                                                <span className="text-xs font-mono text-slate-500 ml-2">
                                                                                    {bucket.type === 'FIXED' ? formatMoney(calculateFixedBucketCost(bucket, selectedMonth)) : 
                                                                                    (bucket.type === 'DAILY' ? 'Rörlig' : 'Mål')}
                                                                                </span>
                                                                            </div>
                                                                            {isDisabled && (
                                                                                <div className="text-[10px] text-orange-400 mt-0.5">
                                                                                    Redan kopplad till: {ownerGroup.name}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                        <input 
                                                                            type="checkbox" 
                                                                            className="hidden" 
                                                                            checked={!!isChecked} 
                                                                            disabled={isDisabled}
                                                                            onChange={() => !isDisabled && toggleLinkedBucket(bucket.id)}
                                                                        />
                                                                    </label>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Subcategory Management (Only for existing groups) */}
                                {editingGroup.id && !editingGroup.isCatchAll && (
                                    <div className="border-t border-slate-700 pt-4 space-y-4">
                                        <h3 className="text-sm font-bold text-white">Kopplade Kategorier</h3>
                                        
                                        <div className="flex flex-wrap gap-2">
                                            {subCategories.filter(s => s.budgetGroupId === editingGroup.id).map(sub => (
                                                <div key={sub.id} className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-300 flex items-center gap-2 group">
                                                    {sub.name}
                                                    <button 
                                                        onClick={() => handleRemoveCategory(sub)}
                                                        className="text-slate-500 hover:text-red-300"
                                                        title="Ta bort från grupp"
                                                    >
                                                        ×
                                                    </button>
                                                </div>
                                            ))}
                                            {subCategories.filter(s => s.budgetGroupId === editingGroup.id).length === 0 && (
                                                <span className="text-xs text-slate-500 italic">Inga kategorier kopplade än.</span>
                                            )}
                                        </div>

                                        <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-800">
                                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">Koppla befintlig kategori</label>
                                            <select 
                                                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                                                onChange={(e) => {
                                                    const sub = subCategories.find(s => s.id === e.target.value);
                                                    if (sub) updateSubCategory({ ...sub, budgetGroupId: editingGroup.id });
                                                }}
                                                value=""
                                            >
                                                <option value="">-- Välj kategori --</option>
                                                {subCategories.filter(s => !s.budgetGroupId).map(s => (
                                                    <option key={s.id} value={s.id}>{s.name} (Okopplad)</option>
                                                ))}
                                                <optgroup label="Redan kopplade (Flytta hit)">
                                                    {subCategories.filter(s => s.budgetGroupId && s.budgetGroupId !== editingGroup.id).map(s => (
                                                        <option key={s.id} value={s.id}>{s.name}</option>
                                                    ))}
                                                </optgroup>
                                            </select>
                                        </div>

                                        {/* CREATE NEW SUB CATEGORY */}
                                        <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-800 flex gap-2 items-center">
                                            <select 
                                                className="w-1/3 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                                                value={selectedMainId}
                                                onChange={(e) => setSelectedMainId(e.target.value)}
                                            >
                                                <option value="">Huvudkategori</option>
                                                {mainCategories.map(m => (
                                                    <option key={m.id} value={m.id}>{m.name}</option>
                                                ))}
                                            </select>
                                            <input 
                                                placeholder="Ny underkategori..." 
                                                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                                                value={newSubName}
                                                onChange={(e) => setNewSubName(e.target.value)}
                                            />
                                            <Button onClick={handleAddSubCategory} disabled={!newSubName || !selectedMainId} className="px-3 py-2">
                                                <Plus className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                      </div>
                  </div>

                  {!deleteMode ? (
                      <div className="flex gap-3 pt-2">
                          {editingGroup.id && !editingGroup.isCatchAll && (
                              <Button variant="danger" onClick={() => setDeleteMode(true)}>
                                  <Trash2 className="w-4 h-4" />
                              </Button>
                          )}
                          <Button className="flex-1" onClick={handleSaveGroup}>Spara</Button>
                      </div>
                  ) : (
                      <div className="space-y-2 bg-red-950/20 p-4 rounded-xl border border-red-500/20">
                          <h4 className="text-sm font-bold text-red-300">Ta bort grupp?</h4>
                          <Button variant="danger" className="w-full justify-start text-sm" onClick={() => handleDelete('THIS_MONTH')}>Enbart denna månad</Button>
                          <Button variant="danger" className="w-full justify-start text-sm" onClick={() => handleDelete('THIS_AND_FUTURE')}>Denna och framtida</Button>
                          <Button variant="danger" className="w-full justify-start text-sm" onClick={() => handleDelete('ALL')}>Radera helt</Button>
                          <Button variant="secondary" className="w-full" onClick={() => setDeleteMode(false)}>Avbry