
import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../store';
import { Bucket, BucketData } from '../types';
import { calculateDailyBucketCost, calculateFixedBucketCost, calculateGoalBucketCost, formatMoney, generateId, getBudgetInterval, isBucketActiveInMonth, getEffectiveBucketData } from '../utils';
import { Card, Button, Input, Modal, cn } from '../components/components';
import { Plus, Trash2, Calendar, Target, Repeat, Wallet, PiggyBank, CreditCard, Image as ImageIcon, X, Check, ChevronDown, ChevronUp, Settings, Copy, ArrowRightLeft } from 'lucide-react';
import { format, addMonths, parseISO, differenceInMonths } from 'date-fns';
import { sv } from 'date-fns/locale';
import { useBudgetActuals } from '../hooks/useBudgetActuals';
import { BudgetProgressBar } from '../components/BudgetProgressBar';
import { TransactionDrillDown } from '../components/TransactionDrillDown';

const DREAM_IMAGES = [
  "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=2073&auto=format&fit=crop", // Beach
  "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?q=80&w=2021&auto=format&fit=crop", // Travel
  "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?q=80&w=2070&auto=format&fit=crop", // Car
  "https://images.unsplash.com/photo-1560518883-ce09059eeffa?q=80&w=1973&auto=format&fit=crop", // House
  "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?q=80&w=2070&auto=format&fit=crop", // Sofa/Home
  "https://images.unsplash.com/photo-1523275335684-37898b6baf30?q=80&w=1999&auto=format&fit=crop", // Watch/Luxury
  "https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=2070&auto=format&fit=crop", // Tech
];

export const BudgetView: React.FC = () => {
  const { accounts, buckets, addBucket, updateBucket, deleteBucket, confirmBucketAmount, selectedMonth, settings, addAccount, copyFromNextMonth } = useApp();
  
  // REAL-TIME ACTUALS HOOK
  const actuals = useBudgetActuals(selectedMonth, settings.payday);
  const [drillDownBucketId, setDrillDownBucketId] = useState<string | null>(null);

  // We use a partial Bucket for editing state to handle the UI form
  const [editingBucket, setEditingBucket] = useState<Bucket | null>(null);
  // We explicitly track the editing month data separately for the form, then merge on save
  const [editingMonthData, setEditingMonthData] = useState<BucketData>({ amount: 0, dailyAmount: 0, activeDays: [1,2,3,4,5] });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteMode, setDeleteMode] = useState(false); // Toggle for delete options
  const [showGoalDetails, setShowGoalDetails] = useState(false); // Toggle for advanced goal settings
  const [showRegularDetails, setShowRegularDetails] = useState(false); // Toggle for advanced settings on regular buckets

  // Account creation state
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountIcon, setNewAccountIcon] = useState('🏠');

  const accountIcons = ['🏠', '🚗', '💰', '🍔', '✈️', '👶', '🐶', '💊', '🎓', '🎁', '🔧', '🧥', '💳', '🏦', '📉', '🏖️', '💡', '🛒', '🚲', '🎮'];

  const handleCreateAccount = () => {
    if (!newAccountName.trim()) return;
    addAccount(newAccountName.trim(), newAccountIcon);
    setNewAccountName('');
    setNewAccountIcon('🏠');
    setIsAccountModalOpen(false);
  };
  
  const calculateCost = (bucket: Bucket, month: string = selectedMonth) => {
    if (bucket.type === 'FIXED') return calculateFixedBucketCost(bucket, month);
    if (bucket.type === 'DAILY') return calculateDailyBucketCost(bucket, month, settings.payday);
    if (bucket.type === 'GOAL') return calculateGoalBucketCost(bucket, month);
    return 0;
  };

  // CHECK IF MONTH IS EMPTY BUT NEXT MONTH HAS DATA
  const { isCurrentMonthEmpty, nextMonthHasData, nextMonthLabel } = useMemo(() => {
     // Check current month
     const activeBuckets = buckets.filter(b => isBucketActiveInMonth(b, selectedMonth) && b.type !== 'GOAL' && b.paymentSource !== 'BALANCE');
     const totalBudgeted = activeBuckets.reduce((sum, b) => sum + calculateCost(b), 0);
     
     // Check next month
     const nextMonth = format(addMonths(parseISO(`${selectedMonth}-01`), 1), 'yyyy-MM');
     const activeNext = buckets.filter(b => isBucketActiveInMonth(b, nextMonth) && b.type !== 'GOAL' && b.paymentSource !== 'BALANCE');
     const totalNext = activeNext.reduce((sum, b) => sum + calculateCost(b, nextMonth), 0);
     
     return {
         isCurrentMonthEmpty: activeBuckets.length === 0 || totalBudgeted === 0,
         nextMonthHasData: totalNext > 0,
         nextMonthLabel: format(parseISO(`${nextMonth}-01`), 'MMMM', { locale: sv })
     };
  }, [buckets, selectedMonth, settings.payday]);

  // Helper to open modal for new or edit
  const openModal = (bucket?: Bucket, accountId?: string) => {
    setDeleteMode(false);
    setShowGoalDetails(false); // Default collapsed details for goals
    
    if (bucket) {
      setEditingBucket({ ...bucket });
      setShowRegularDetails(false); // Default collapsed for editing existing

      // Load data for this month if exists, otherwise try to load inherited or defaults
      const { data } = getEffectiveBucketData(bucket, selectedMonth);
      
      // For Goals: We might want to pre-fill the "Amount" with the calculated cost if no explicit override exists
      // This makes it easy to just click save or see what the current plan is.
      let initialData = data ? { ...data, isExplicitlyDeleted: false } : { amount: 0, dailyAmount: 0, activeDays: [1,2,3,4,5] };
      
      if (bucket.type === 'GOAL' && (!data || data.amount === 0)) {
          // Calculate the recommended amount so the input isn't empty (which looks like 0)
          // We only do this for display initial state
          const recommended = calculateGoalBucketCost(bucket, selectedMonth);
          initialData.amount = Math.round(recommended);
      }

      setEditingMonthData(initialData);
    } else if (accountId) {
      // New Bucket
      setShowRegularDetails(true); // Auto expand for new buckets so user can see Name input
      setEditingBucket({
        id: generateId(),
        accountId,
        name: '',
        type: 'FIXED',
        isSavings: false,
        paymentSource: 'INCOME', // Default to taking from Salary
        monthlyData: {}, // Will be populated on save
        targetAmount: 0,
        targetDate: '',
        startSavingDate: selectedMonth,
        backgroundImage: DREAM_IMAGES[0]
      });
      setEditingMonthData({ amount: 0, dailyAmount: 0, activeDays: [1,2,3,4,5] });
    }
    setIsModalOpen(true);
  };

  const handleSave = () => {
    if (!editingBucket) return;

    // Check if we are updating an existing bucket in a way that requires a "Split" in history.
    // Structural changes (Type, Savings Status, Payment Source, Account) should NOT apply retroactively.
    // Instead, we effectively "End" the old bucket at the previous month, and create a "New" bucket from this month.
    const originalBucket = buckets.find(b => b.id === editingBucket.id);
    const isExistingBucket = !!originalBucket;
    
    // Define what constitutes a "Structural Change" that breaks history
    const isStructuralChange = isExistingBucket && (
        originalBucket.type !== editingBucket.type ||
        originalBucket.isSavings !== editingBucket.isSavings ||
        originalBucket.paymentSource !== editingBucket.paymentSource ||
        originalBucket.accountId !== editingBucket.accountId
    );

    if (isStructuralChange) {
        // --- HISTORY SPLIT LOGIC ---
        
        // 1. Soft delete the OLD bucket from this month forward
        // This ensures historical data (Jan) stays as "Fixed", but it stops existing in Feb.
        deleteBucket(originalBucket.id, selectedMonth, 'THIS_AND_FUTURE');

        // 2. Create a NEW bucket with the new settings
        // This bucket starts fresh from this month.
        const newBucketId = generateId();
        const newBucket: Bucket = {
            ...editingBucket,
            id: newBucketId,
            monthlyData: {
                // Initialize with the data for the current month
                [selectedMonth]: editingMonthData
            }
        };

        addBucket(newBucket);
        setIsModalOpen(false);
        return;
    }

    // --- STANDARD UPDATE LOGIC (No History Split) ---

    let finalBucket = editingBucket;
    
    const updatedMonthlyData = {
        ...finalBucket.monthlyData,
        [selectedMonth]: editingMonthData
    };

    const bucketToSave = {
        ...finalBucket,
        monthlyData: updatedMonthlyData
    };

    if (isExistingBucket) {
      updateBucket(bucketToSave);
    } else {
      addBucket(bucketToSave);
    }

    // SPECIAL LOGIC FOR GOALS
    if (bucketToSave.type === 'GOAL' && bucketToSave.targetDate && bucketToSave.targetAmount > 0) {
        handleGoalSpendingBucket(bucketToSave);
    }

    setIsModalOpen(false);
  };

  const handleGoalSpendingBucket = (goalBucket: Bucket) => {
      let spendingBucket = buckets.find(b => b.linkedGoalId === goalBucket.id);
      const spendingMonth = goalBucket.targetDate;
      
      const newData = {
         [spendingMonth]: { amount: goalBucket.targetAmount, dailyAmount: 0, activeDays: [] }
      };

      if (spendingBucket) {
          updateBucket({
              ...spendingBucket,
              name: `Utbetalning: ${goalBucket.name}`,
              monthlyData: newData,
              paymentSource: 'BALANCE',
              targetAmount: 0, 
              isSavings: false,
          });
      } else {
          const newId = generateId();
          addBucket({
              id: newId,
              accountId: goalBucket.accountId,
              name: `Utbetalning: ${goalBucket.name}`,
              type: 'FIXED',
              isSavings: false,
              paymentSource: 'BALANCE',
              monthlyData: newData,
              targetAmount: 0,
              targetDate: '',
              startSavingDate: '',
              linkedGoalId: goalBucket.id
          });
      }
  };

  const handleDelete = (scope: 'THIS_MONTH' | 'THIS_AND_FUTURE' | 'ALL') => {
      if (editingBucket) {
          deleteBucket(editingBucket.id, selectedMonth, scope);
          setIsModalOpen(false);
      }
  };

  const getBucketStyles = (bucket: Bucket) => {
    if (bucket.isSavings) {
        return {
            container: "border-l-indigo-500 bg-indigo-500/5 hover:bg-indigo-500/10",
            text: "text-indigo-300",
            badge: "bg-indigo-500/20 text-indigo-300",
            icon: "text-indigo-400"
        };
    }
    if (bucket.paymentSource === 'BALANCE') {
        return {
            container: "border-l-amber-500 bg-amber-500/5 hover:bg-amber-500/10",
            text: "text-amber-300",
            badge: "bg-amber-500/20 text-amber-300",
            icon: "text-amber-400"
        };
    }
    // Default: Expense
    return {
        container: "border-l-rose-500 bg-rose-500/5 hover:bg-rose-500/10",
        text: "text-rose-300",
        badge: "bg-rose-500/20 text-rose-300",
        icon: "text-rose-400"
    };
  };

  const setType = (type: Bucket['type']) => {
      if (!editingBucket) return;
      let updates: Partial<Bucket> = { type };
      
      if (type === 'GOAL') {
          updates.isSavings = true;
          updates.paymentSource = 'INCOME';
          if (!editingBucket.startSavingDate) updates.startSavingDate = selectedMonth;
          if (!editingBucket.targetDate) updates.targetDate = format(addMonths(parseISO(`${selectedMonth}-01`), 12), 'yyyy-MM');
      }
      setEditingBucket({ ...editingBucket, ...updates });
  };

  const getRecommendedGoalAmount = () => {
     if (!editingBucket || editingBucket.type !== 'GOAL') return 0;
     const tempBucket = {
         ...editingBucket,
         monthlyData: {
             ...editingBucket.monthlyData,
             [selectedMonth]: { amount: 0, dailyAmount: 0, activeDays: [] }
         }
     };
     return Math.round(calculateGoalBucketCost(tempBucket, selectedMonth));
  };
  const recommendedAmount = getRecommendedGoalAmount();
  const isOverride = editingMonthData.amount !== recommendedAmount;

  return (
    <div className="space-y-8 pb-24 animate-in slide-in-from-right duration-300">
      <header>
        <div className="flex items-center gap-3 mb-2">
            <div className="bg-gradient-to-br from-rose-500 to-orange-500 p-2 rounded-xl text-white">
                <ArrowRightLeft className="w-6 h-6" />
            </div>
            <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-rose-400 to-orange-400">Överföringar</h1>
        </div>
        <p className="text-slate-400">Dina fasta överföringar vid lön (Vattenfall).</p>
        
        {/* COPY BUDGET BUTTON (If current is empty but next has data) */}
        {isCurrentMonthEmpty && nextMonthHasData && (
             <div className="mt-4 p-4 bg-indigo-900/30 border border-indigo-500/30 rounded-xl flex items-center justify-between animate-in slide-in-from-top-2">
                 <div className="text-sm">
                     <div className="text-indigo-300 font-bold mb-1">Tom månad?</div>
                     <div className="text-slate-400">Det finns en budget för <span className="text-white font-medium">{nextMonthLabel}</span>. Vill du använda den här också?</div>
                 </div>
                 <Button 
                    onClick={() => copyFromNextMonth(selectedMonth)} 
                    className="bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-900/20"
                 >
                     <Copy className="w-4 h-4 mr-2" />
                     Hämta från {nextMonthLabel}
                 </Button>
             </div>
        )}
      </header>

      {accounts.map(account => {
        const accountBuckets = buckets.filter(b => b.accountId === account.id && isBucketActiveInMonth(b, selectedMonth));
        const accountTotal = accountBuckets.reduce((sum, b) => sum + calculateCost(b), 0);
        
        // Calculate Actuals per Account (Aggregated)
        const accountSpent = actuals?.spentByAccount[account.id] || 0;
        const accountRemaining = Math.max(0, accountTotal - accountSpent);

        return (
          <div key={account.id} className="space-y-4 mb-8">
            <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700 shadow-lg">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-xl font-bold flex items-center gap-2 text-white">
                        <span>{account.icon}</span> {account.name}
                    </h2>
                    <div className="text-right">
                        <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Planerad Överföring</div>
                        <div className="text-lg font-mono font-bold text-white leading-none">{formatMoney(accountTotal)}</div>
                    </div>
                </div>

                {/* Account Level Progress Bar - Renamed Label to imply "Moved" */}
                <BudgetProgressBar 
                    spent={accountSpent} 
                    total={accountTotal} 
                    label={`Flyttat till konto / Sparat`}
                    className="mt-1"
                />
            </div>
            
            <div className="grid gap-3">
              {accountBuckets.map(bucket => {
                const cost = calculateCost(bucket);
                const { isInherited } = getEffectiveBucketData(bucket, selectedMonth);
                const showConfirmButton = isInherited && bucket.type !== 'GOAL';
                const styles = getBucketStyles(bucket);
                
                // Actuals per Bucket
                const spent = actuals?.spentByBucket[bucket.id] || 0;
                // Determine if we should show the drill-down button/visuals
                const hasTransactions = spent > 0;

                return (
                  <Card 
                    key={bucket.id} 
                    onClick={() => openModal(bucket)} 
                    className={cn(
                        "flex items-stretch justify-between py-3 px-4 border-l-4 cursor-pointer active:scale-[0.98] transition-all group relative overflow-hidden", 
                        styles.container
                    )}
                  >
                    <div className="flex-1 flex flex-col justify-center">
                      <div className="flex items-center gap-2">
                         <span className="font-medium text-white">{bucket.name}</span>
                         {bucket.isSavings && <span className={cn("text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider", styles.badge)}>Spar</span>}
                         {bucket.paymentSource === 'BALANCE' && <span className={cn("text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider", styles.badge)}>Saldo</span>}
                      </div>
                      <div className={cn("text-xs mt-1 flex gap-2 opacity-80 transition-colors", styles.text)}>
                        {bucket.type === 'FIXED' && <span className="flex items-center gap-1"><Repeat className="w-3 h-3"/> Fast</span>}
                        {bucket.type === 'DAILY' && <span className="flex items-center gap-1"><Calendar className="w-3 h-3"/> Rörligt</span>}
                        {bucket.type === 'GOAL' && <span className="flex items-center gap-1"><Target className="w-3 h-3"/> Mål</span>}
                      </div>
                    </div>
                    
                    {/* Right Side: Budget vs Actuals */}
                    <div className="flex items-center gap-4">
                        {/* Actuals Bar (Clickable) */}
                        <div 
                            className="w-24 flex flex-col items-end justify-center group/bar"
                            onClick={(e) => {
                                e.stopPropagation();
                                setDrillDownBucketId(bucket.id);
                            }}
                        >
                            <div className="text-right mb-1">
                                <span className={cn("font-mono font-bold text-sm", spent > cost ? "text-rose-400" : "text-white")}>
                                    {formatMoney(spent)}
                                </span>
                                <span className="text-[10px] text-slate-500 mx-1">/</span>
                                <span className="text-[10px] text-slate-400">{formatMoney(cost)}</span>
                            </div>
                            <BudgetProgressBar 
                                spent={spent} 
                                total={cost} 
                                compact
                            />
                        </div>

                        {showConfirmButton && (
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    confirmBucketAmount(bucket.id, selectedMonth);
                                }}
                                title="Bekräfta beloppet"
                                className="w-8 h-8 rounded-full bg-emerald-500/20 hover:bg-emerald-500 text-emerald-500 hover:text-white flex items-center justify-center transition-all animate-in zoom-in ml-2"
                            >
                                <Check className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                  </Card>
                );
              })}
              
              <Button variant="ghost" className="border-dashed border border-slate-700 text-slate-500 hover:text-white" onClick={() => openModal(undefined, account.id)}>
                <Plus className="w-5 h-5" /> Lägg till post i {account.name}
              </Button>
            </div>
          </div>
        );
      })}

      <Button variant="secondary" className="w-full border-dashed border-slate-700 py-4 text-slate-400 hover:text-white mt-8" onClick={() => setIsAccountModalOpen(true)}>
        <Wallet className="w-5 h-5 mr-2" /> Skapa nytt konto
      </Button>

      {/* MODAL FOR NEW ACCOUNT */}
      <Modal isOpen={isAccountModalOpen} onClose={() => setIsAccountModalOpen(false)} title="Skapa Nytt Konto">
        <div className="space-y-6">
           <Input label="Kontonamn" placeholder="t.ex. Sommarstugan" value={newAccountName} onChange={e => setNewAccountName(e.target.value)} autoFocus />
           <div>
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2 block">Välj Symbol</label>
              <div className="grid grid-cols-5 gap-2">
                {accountIcons.map(icon => (
                   <button
                     key={icon}
                     onClick={() => setNewAccountIcon(icon)}
                     className={cn("aspect-square rounded-xl flex items-center justify-center text-2xl transition-all", newAccountIcon === icon ? "bg-blue-600 text-white scale-110 shadow-lg" : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white")}
                   >
                     {icon}
                   </button>
                ))}
              </div>
           </div>
           <Button onClick={handleCreateAccount} disabled={!newAccountName.trim()} className="w-full">
             Skapa Konto
           </Button>
        </div>
      </Modal>

      {/* MODAL FOR EDITING BUCKET */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingBucket?.id && buckets.find(b => b.id === editingBucket.id) ? (editingBucket?.type === 'GOAL' ? editingBucket.name : 'Redigera Post') : 'Ny Post'}>
        {editingBucket && (
          <div className="space-y-6">
            
            {/* =======================================================
                REGULAR EXPENSES (FIXED / DAILY) - SIMPLIFIED LAYOUT
               ======================================================= */}
            {editingBucket.type !== 'GOAL' && (
                <>
                    {/* PRIMARY: AMOUNT INPUT */}
                    <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700 shadow-inner">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2 text-center">
                            {editingBucket.type === 'DAILY' ? 'Daglig Kostnad' : 'Belopp denna månad'}
                        </label>
                        <div className="flex items-center justify-center gap-2">
                            <input 
                                type="number" 
                                value={editingBucket.type === 'DAILY' ? (editingMonthData.dailyAmount || '') : (editingMonthData.amount || '')} 
                                onChange={e => {
                                    const val = Number(e.target.value);
                                    if (editingBucket.type === 'DAILY') {
                                        setEditingMonthData({...editingMonthData, dailyAmount: val});
                                    } else {
                                        setEditingMonthData({...editingMonthData, amount: val});
                                    }
                                }}
                                className="bg-transparent text-5xl font-mono font-bold text-center text-white w-full focus:outline-none placeholder-slate-700"
                                placeholder="0"
                                autoFocus={!editingBucket.name} // Focus here if name is present
                            />
                        </div>

                         {/* DAILY ACTIVE DAYS SELECTOR (Keep visible for Daily as it is common to change) */}
                        {editingBucket.type === 'DAILY' && (
                            <div className="mt-4 border-t border-slate-700/50 pt-3">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2 text-center">
                                    Aktiva dagar ({editingMonthData.activeDays?.length || 0})
                                </label>
                                <div className="flex justify-between gap-1 max-w-[280px] mx-auto">
                                    {['S','M','T','O','T','F','L'].map((d, i) => (
                                        <button 
                                        key={i}
                                        onClick={() => {
                                            const currentDays = editingMonthData.activeDays || [];
                                            const days = currentDays.includes(i) 
                                            ? currentDays.filter(day => day !== i)
                                            : [...currentDays, i];
                                            setEditingMonthData({...editingMonthData, activeDays: days});
                                        }}
                                        className={cn("w-9 h-9 rounded-full text-xs font-bold flex items-center justify-center transition-all", editingMonthData.activeDays?.includes(i) ? "bg-blue-600 text-white" : "bg-slate-900 text-slate-600")}
                                        >
                                        {d}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                        
                        {/* Summary of Monthly Total for Daily */}
                        {editingBucket.type === 'DAILY' && (
                             <div className="text-center mt-3 text-sm text-slate-400">
                                 Totalt ca: <span className="text-white font-mono">{formatMoney(calculateDailyBucketCost({...editingBucket, monthlyData: {[selectedMonth]: editingMonthData}}, selectedMonth, settings.payday))}</span> / mån
                             </div>
                        )}
                    </div>

                    {/* SECONDARY: COLLAPSIBLE DETAILS */}
                    <div className="border-t border-slate-700 pt-2">
                        <button 
                            onClick={() => setShowRegularDetails(!showRegularDetails)}
                            className="flex items-center justify-between w-full p-2 text-sm text-slate-400 hover:text-white transition-colors"
                        >
                            <span className="flex items-center gap-2"><Settings className="w-4 h-4" /> Inställningar (Namn, Typ, Konto)</span>
                            {showRegularDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>

                        {showRegularDetails && (
                            <div className="space-y-4 pt-4 animate-in slide-in-from-top-2">
                                <Input label="Namn" value={editingBucket.name} onChange={e => setEditingBucket({...editingBucket, name: e.target.value})} />
                                
                                {/* ACCOUNT SELECTOR */}
                                <div>
                                    <label className="text-xs font-medium text-slate-400 uppercase tracking-wider block mb-1">Konto</label>
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
                                
                                {/* TYPE SELECTOR */}
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="col-span-2 text-xs font-medium text-slate-400 uppercase">Typ av post</div>
                                    <button 
                                    onClick={() => setType('FIXED')}
                                    className={cn("p-3 rounded-xl border text-sm font-medium transition-colors flex flex-col items-center gap-2", editingBucket.type === 'FIXED' ? "bg-blue-600 border-blue-500 text-white" : "border-slate-700 text-slate-400")}
                                    >
                                    <Repeat className="w-5 h-5" />
                                    Fast Månad
                                    </button>
                                    <button 
                                    onClick={() => setType('DAILY')}
                                    className={cn("p-3 rounded-xl border text-sm font-medium transition-colors flex flex-col items-center gap-2", editingBucket.type === 'DAILY' ? "bg-blue-600 border-blue-500 text-white" : "border-slate-700 text-slate-400")}
                                    >
                                    <Calendar className="w-5 h-5" />
                                    Rörlig Daglig
                                    </button>
                                    <button 
                                    onClick={() => setType('GOAL')}
                                    className={cn("p-3 rounded-xl border text-sm font-medium transition-colors col-span-2 flex items-center justify-center gap-2", editingBucket.type === 'GOAL' ? "bg-blue-600 border-blue-500 text-white" : "border-slate-700 text-slate-400")}
                                    >
                                    <Target className="w-5 h-5" />
                                    Byt till Dröm & Målsparande
                                    </button>
                                </div>

                                {/* PAYMENT SOURCE */}
                                <div className="space-y-3">
                                    <div className="text-xs font-medium text-slate-400 uppercase">Finansiering</div>
                                    <div className="flex flex-col gap-2">
                                        <button 
                                        onClick={() => setEditingBucket({...editingBucket, paymentSource: 'INCOME'})}
                                        className={cn("p-3 rounded-xl border text-left flex items-center gap-3", (!editingBucket.paymentSource || editingBucket.paymentSource === 'INCOME') ? "bg-emerald-500/20 border-emerald-500 text-white" : "border-slate-700 text-slate-400")}
                                        >
                                            <Wallet className="w-5 h-5" />
                                            <div>
                                                <div className="font-bold text-sm">Från Månadslön</div>
                                                <div className="text-[10px] opacity-70">Minskar månadens utrymme/fickpengar</div>
                                            </div>
                                        </button>
                                        <button 
                                        onClick={() => setEditingBucket({...editingBucket, paymentSource: 'BALANCE'})}
                                        className={cn("p-3 rounded-xl border text-left flex items-center gap-3", editingBucket.paymentSource === 'BALANCE' ? "bg-amber-500/20 border-amber-500 text-white" : "border-slate-700 text-slate-400")}
                                        >
                                            <PiggyBank className="w-5 h-5" />
                                            <div>
                                                <div className="font-bold text-sm">Från Kontosaldo / Sparade Medel</div>
                                                <div className="text-[10px] opacity-70">Påverkar ej månadens utrymme (Används för inköp av mål)</div>
                                            </div>
                                        </button>
                                    </div>
                                </div>

                                {/* SAVINGS TOGGLE */}
                                <div className="flex items-center gap-3 bg-slate-800/50 p-3 rounded-xl">
                                    <span className="text-sm text-slate-300 flex-1">Är detta ett sparande?</span>
                                    <div className="flex bg-slate-900 rounded-lg p-1">
                                        <button onClick={() => setEditingBucket({...editingBucket, isSavings: false})} className={cn("px-3 py-1 rounded text-xs font-bold transition-all", !editingBucket.isSavings ? "bg-rose-500 text-white" : "text-slate-500")}>Kostnad</button>
                                        <button onClick={() => setEditingBucket({...editingBucket, isSavings: true})} className={cn("px-3 py-1 rounded text-xs font-bold transition-all", editingBucket.isSavings ? "bg-indigo-500 text-white" : "text-slate-500")}>Sparande</button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* =======================================================
                GOAL INPUTS (New Interface)
               ======================================================= */}
            {editingBucket.type === 'GOAL' && (
              <div className="space-y-6">
                 {/* PRIMARY: CURRENT MONTH ADJUSTMENT */}
                 <div className="bg-slate-800/50 p-4 rounded-2xl border border-indigo-500/20 shadow-inner">
                     <label className="text-xs font-bold text-indigo-300 uppercase tracking-wider block mb-2 text-center">
                         Insättning {format(new Date(selectedMonth), 'MMMM', {locale: sv})}
                     </label>
                     <div className="flex items-center justify-center gap-2">
                         <input 
                            type="number" 
                            value={editingMonthData.amount || ''} 
                            onChange={e => setEditingMonthData({...editingMonthData, amount: Number(e.target.value)})} 
                            className="bg-transparent text-5xl font-mono font-bold text-center text-white w-full focus:outline-none placeholder-slate-700"
                            placeholder="0"
                         />
                     </div>
                     
                     {/* Suggestion / Reset Button */}
                     <div className="flex justify-center mt-3">
                         {isOverride ? (
                             <button 
                                onClick={() => setEditingMonthData({...editingMonthData, amount: recommendedAmount})}
                                className="text-xs text-orange-400 hover:text-orange-300 flex items-center gap-1 bg-orange-500/10 px-3 py-1.5 rounded-full border border-orange-500/20"
                             >
                                 <Repeat className="w-3 h-3" />
                                 Återställ till plan: {formatMoney(recommendedAmount)}
                             </button>
                         ) : (
                             <div className="text-xs text-slate-500 flex items-center gap-1">
                                 <Check className="w-3 h-3 text-emerald-500" />
                                 Följer plan ({formatMoney(recommendedAmount)})
                             </div>
                         )}
                     </div>
                 </div>

                 {/* SECONDARY: DETAILS & PLANNING */}
                 <div className="border-t border-slate-700 pt-2">
                     <button 
                        onClick={() => setShowGoalDetails(!showGoalDetails)}
                        className="flex items-center justify-between w-full p-2 text-sm text-slate-400 hover:text-white transition-colors"
                     >
                         <span className="flex items-center gap-2"><Target className="w-4 h-4" /> Redigera Mål & Tidsplan</span>
                         {showGoalDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                     </button>
                     
                     {showGoalDetails && (
                         <div className="space-y-4 pt-4 animate-in slide-in-from-top-2">
                             <Input label="Namn" value={editingBucket.name} onChange={e => setEditingBucket({...editingBucket, name: e.target.value})} />
                             
                             {/* ACCOUNT SELECTOR (GOALS) */}
                             <div>
                                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider block mb-1">Konto</label>
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

                             <Input label="Totalt målbelopp" type="number" value={editingBucket.targetAmount} onChange={e => setEditingBucket({...editingBucket, targetAmount: Number(e.target.value)})} />
                             <div className="grid grid-cols-2 gap-4">
                                <Input label="Starta sparande" type="month" value={editingBucket.startSavingDate} onChange={e => setEditingBucket({...editingBucket, startSavingDate: e.target.value})} />
                                <Input label="Måldatum (Utbetalning)" type="month" value={editingBucket.targetDate} onChange={e => setEditingBucket({...editingBucket, targetDate: e.target.value})} />
                             </div>
                             
                             <div className="space-y-2">
                                 <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Välj Bild</label>
                                 <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                                     {DREAM_IMAGES.map((img, i) => (
                                         <button 
                                            key={i}
                                            onClick={() => setEditingBucket({...editingBucket, backgroundImage: img})}
                                            className={cn("w-16 h-16 shrink-0 rounded-lg overflow-hidden border-2 transition-all", editingBucket.backgroundImage === img ? "border-blue-500 scale-105" : "border-transparent opacity-60 hover:opacity-100")}
                                         >
                                             <img src={img} className="w-full h-full object-cover" alt="theme" />
                                         </button>
                                     ))}
                                 </div>
                             </div>

                             <p className="text-xs text-indigo-300 bg-indigo-500/10 p-3 rounded-lg">
                                Notera: Ändringar i målbelopp eller datum kommer att räkna om den rekommenderade månadsinsättningen för alla framtida månader.
                             </p>
                         </div>
                     )}
                 </div>
              </div>
            )}

            {!deleteMode ? (
                <div className="flex gap-3 pt-4">
                  <Button variant="danger" className="flex-1" onClick={() => setDeleteMode(true)}>
                     <Trash2 className="w-4 h-4" /> Ta bort
                  </Button>
                  <Button className="flex-[2]" onClick={handleSave}>Spara</Button>
                </div>
            ) : (
                <div className="pt-4 space-y-3 bg-red-950/20 p-4 rounded-xl border border-red-500/20 animate-in fade-in slide-in-from-bottom-2">
                    <div className="flex justify-between items-center mb-2">
                        <h4 className="text-sm font-bold text-red-300">Ta bort "{editingBucket.name}"?</h4>
                        <button onClick={() => setDeleteMode(false)} className="text-slate-400 hover:text-white"><X className="w-4 h-4"/></button>
                    </div>
                    <Button variant="danger" className="w-full justify-start text-sm" onClick={() => handleDelete('THIS_MONTH')}>
                        Enbart denna månad
                    </Button>
                    <Button variant="danger" className="w-full justify-start text-sm" onClick={() => handleDelete('THIS_AND_FUTURE')}>
                        Denna och alla framtida
                    </Button>
                    <Button variant="danger" className="w-full justify-start text-sm" onClick={() => handleDelete('ALL')}>
                        Radera helt (Alla månader)
                    </Button>
                </div>
            )}
            
          </div>
        )}
      </Modal>

      {/* TRANSACTION DRILL DOWN MODAL */}
      {drillDownBucketId && (
         <TransactionDrillDown 
            bucketId={drillDownBucketId} 
            bucketName={buckets.find(b => b.id === drillDownBucketId)?.name || ''}
            month={selectedMonth}
            payday={settings.payday}
            onClose={() => setDrillDownBucketId(null)}
         />
      )}
    </div>
  );
};
