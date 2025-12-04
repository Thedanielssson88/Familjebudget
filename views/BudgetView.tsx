import React, { useState, useEffect } from 'react';
import { useApp } from '../store';
import { Bucket, BucketData } from '../types';
import { calculateDailyBucketCost, calculateFixedBucketCost, calculateGoalBucketCost, formatMoney, generateId, getBudgetInterval, isBucketActiveInMonth, getEffectiveBucketData } from '../utils';
import { Card, Button, Input, Modal, cn } from '../components/components';
import { Plus, Trash2, Calendar, Target, Repeat, Wallet, PiggyBank, CreditCard, Image as ImageIcon, X, Check } from 'lucide-react';
import { format, addMonths, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';

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
  const { accounts, buckets, addBucket, updateBucket, deleteBucket, confirmBucketAmount, selectedMonth, settings, addAccount } = useApp();
  // We use a partial Bucket for editing state to handle the UI form
  const [editingBucket, setEditingBucket] = useState<Bucket | null>(null);
  // We explicitly track the editing month data separately for the form, then merge on save
  const [editingMonthData, setEditingMonthData] = useState<BucketData>({ amount: 0, dailyAmount: 0, activeDays: [1,2,3,4,5] });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteMode, setDeleteMode] = useState(false); // Toggle for delete options

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

  // Helper to open modal for new or edit
  const openModal = (bucket?: Bucket, accountId?: string) => {
    setDeleteMode(false);
    if (bucket) {
      setEditingBucket({ ...bucket });
      // Load data for this month if exists, otherwise try to load inherited or defaults
      const { data } = getEffectiveBucketData(bucket, selectedMonth);
      setEditingMonthData(data ? { ...data, isExplicitlyDeleted: false } : { amount: 0, dailyAmount: 0, activeDays: [1,2,3,4,5] });
    } else if (accountId) {
      // New Bucket
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

    // Check if we should reuse an existing bucket definition (by name/account)
    // This supports the "Add existing expense to this month" flow implicitly
    let finalBucket = editingBucket;
    
    // If it's a new bucket (not in list), check for name collision in this account
    if (!buckets.find(b => b.id === editingBucket.id)) {
        const existingBucket = buckets.find(b => b.accountId === editingBucket.accountId && b.name.toLowerCase() === editingBucket.name.toLowerCase());
        if (existingBucket) {
            // Reuse existing bucket ID, just update its monthly data
            finalBucket = { ...existingBucket, ...editingBucket, id: existingBucket.id };
        }
    }

    // Merge the editingMonthData into the bucket's monthlyData
    const updatedMonthlyData = {
        ...finalBucket.monthlyData,
        [selectedMonth]: editingMonthData
    };

    const bucketToSave = {
        ...finalBucket,
        monthlyData: updatedMonthlyData
    };

    if (buckets.find(b => b.id === bucketToSave.id)) {
      updateBucket(bucketToSave);
    } else {
      addBucket(bucketToSave);
    }

    // SPECIAL LOGIC FOR GOALS
    // If it's a GOAL, check if we need to create/update the "Spending" bucket for the target date
    if (bucketToSave.type === 'GOAL' && bucketToSave.targetDate && bucketToSave.targetAmount > 0) {
        handleGoalSpendingBucket(bucketToSave);
    }

    setIsModalOpen(false);
  };

  const handleGoalSpendingBucket = (goalBucket: Bucket) => {
      // 1. Try to find an existing linked spending bucket
      // We search in the current `buckets` state.
      // NOTE: If we JUST added the goal, it might not be in `buckets` yet, but that's okay, 
      // because we only need the linked bucket if it existed before.
      let spendingBucket = buckets.find(b => b.linkedGoalId === goalBucket.id);
      
      const spendingMonth = goalBucket.targetDate; // e.g. "2026-07"
      
      // We want to replace the monthly data entirely so it ONLY appears on the spending month
      const newData = {
         [spendingMonth]: { amount: goalBucket.targetAmount, dailyAmount: 0, activeDays: [] }
      };

      if (spendingBucket) {
          // Update existing
          updateBucket({
              ...spendingBucket,
              name: `Utbetalning: ${goalBucket.name}`,
              monthlyData: newData, // Overwrite with new month to move it if date changed
              paymentSource: 'BALANCE', // Ensure it pulls from Balance
              targetAmount: 0, 
              isSavings: false,
          });
      } else {
          // Create new
          const newId = generateId();
          addBucket({
              id: newId,
              accountId: goalBucket.accountId,
              name: `Utbetalning: ${goalBucket.name}`,
              type: 'FIXED',
              isSavings: false, // It's spending!
              paymentSource: 'BALANCE', // Spend from savings, don't double-hit income
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

  const calculateCost = (bucket: Bucket) => {
    if (bucket.type === 'FIXED') return calculateFixedBucketCost(bucket, selectedMonth);
    if (bucket.type === 'DAILY') return calculateDailyBucketCost(bucket, selectedMonth, settings.payday);
    if (bucket.type === 'GOAL') return calculateGoalBucketCost(bucket, selectedMonth);
    return 0;
  };

  // When changing type to GOAL, set reasonable defaults if missing
  const setType = (type: Bucket['type']) => {
      if (!editingBucket) return;
      let updates: Partial<Bucket> = { type };
      
      if (type === 'GOAL') {
          updates.isSavings = true;
          updates.paymentSource = 'INCOME'; // Savings usually come from income
          if (!editingBucket.startSavingDate) updates.startSavingDate = selectedMonth;
          if (!editingBucket.targetDate) updates.targetDate = format(addMonths(parseISO(`${selectedMonth}-01`), 12), 'yyyy-MM');
      } else {
          // If switching back from Goal, maybe reset isSavings?
          // updates.isSavings = false; 
      }
      setEditingBucket({ ...editingBucket, ...updates });
  };

  return (
    <div className="space-y-6 pb-24 animate-in slide-in-from-right duration-300">
      <header>
        <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-rose-400 to-orange-400">Budget & Utgifter</h1>
        <p className="text-slate-400">Planera utgifterna för {format(new Date(selectedMonth), 'MMMM', {locale: sv})}.</p>
      </header>

      {accounts.map(account => {
        // Filter buckets: Only show those active in the selected month
        const accountBuckets = buckets.filter(b => b.accountId === account.id && isBucketActiveInMonth(b, selectedMonth));
        const accountTotal = accountBuckets.reduce((sum, b) => sum + calculateCost(b), 0);

        return (
          <div key={account.id} className="space-y-2">
            <div className="flex items-center justify-between px-2">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <span>{account.icon}</span> {account.name}
              </h2>
              <span className="text-slate-400 text-sm font-mono">{formatMoney(accountTotal)}</span>
            </div>
            
            <div className="grid gap-3">
              {accountBuckets.map(bucket => {
                const cost = calculateCost(bucket);
                // Check if this cost is inherited (i.e. not confirmed for this month yet)
                const { isInherited } = getEffectiveBucketData(bucket, selectedMonth);
                // Goals usually don't have inheritance in the same way, so ignore check button for them
                const showConfirmButton = isInherited && bucket.type !== 'GOAL';

                return (
                  <Card key={bucket.id} onClick={() => openModal(bucket)} className="flex items-center justify-between py-3 px-4 border-l-4 border-l-slate-600 hover:border-l-blue-500 cursor-pointer active:scale-[0.98] transition-all group">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                         <span className="font-medium text-white">{bucket.name}</span>
                         {bucket.isSavings && <span className="bg-indigo-500/20 text-indigo-300 text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider">Spar</span>}
                         {bucket.paymentSource === 'BALANCE' && <span className="bg-amber-500/20 text-amber-300 text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider">Saldo</span>}
                      </div>
                      <div className="text-xs text-slate-400 mt-1 flex gap-2">
                        {bucket.type === 'FIXED' && <span className="flex items-center gap-1"><Repeat className="w-3 h-3"/> Fast belopp</span>}
                        {bucket.type === 'DAILY' && <span className="flex items-center gap-1"><Calendar className="w-3 h-3"/> Rörligt (Dagligt)</span>}
                        {bucket.type === 'GOAL' && <span className="flex items-center gap-1"><Target className="w-3 h-3"/> Målsparande</span>}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                        {showConfirmButton && (
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    confirmBucketAmount(bucket.id, selectedMonth);
                                }}
                                title="Bekräfta beloppet för denna månad"
                                className="w-8 h-8 rounded-full bg-emerald-500/20 hover:bg-emerald-500 text-emerald-500 hover:text-white flex items-center justify-center transition-all animate-in zoom-in"
                            >
                                <Check className="w-4 h-4" />
                            </button>
                        )}
                        <div className={cn("text-right font-mono font-medium", showConfirmButton ? "text-slate-400 italic" : "text-rose-300")}>
                        -{formatMoney(cost)}
                        </div>
                    </div>
                  </Card>
                );
              })}
              
              <Button variant="ghost" className="border-dashed border border-slate-700 text-slate-500 hover:text-white" onClick={() => openModal(undefined, account.id)}>
                <Plus className="w-5 h-5" /> Lägg till utgift i {account.name}
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
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingBucket?.id && buckets.find(b => b.id === editingBucket.id) ? 'Redigera Utgift' : 'Ny Utgift'}>
        {editingBucket && (
          <div className="space-y-6">
            <Input label="Namn" value={editingBucket.name} onChange={e => setEditingBucket({...editingBucket, name: e.target.value})} autoFocus />
            
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
                  Dröm & Målsparande
                </button>
            </div>

            {/* HIDE PAYMENT SOURCE SELECTOR FOR GOALS (ALWAYS INCOME) */}
            {editingBucket.type !== 'GOAL' && (
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
            )}

            {/* HIDE SAVINGS TOGGLE FOR GOALS (ALWAYS TRUE) */}
            {editingBucket.type !== 'GOAL' && (
                <div className="flex items-center gap-3 bg-slate-800/50 p-3 rounded-xl">
                <span className="text-sm text-slate-300 flex-1">Är detta ett sparande?</span>
                <div className="flex bg-slate-900 rounded-lg p-1">
                    <button onClick={() => setEditingBucket({...editingBucket, isSavings: false})} className={cn("px-3 py-1 rounded text-xs font-bold transition-all", !editingBucket.isSavings ? "bg-rose-500 text-white" : "text-slate-500")}>Kostnad</button>
                    <button onClick={() => setEditingBucket({...editingBucket, isSavings: true})} className={cn("px-3 py-1 rounded text-xs font-bold transition-all", editingBucket.isSavings ? "bg-indigo-500 text-white" : "text-slate-500")}>Sparande</button>
                </div>
                </div>
            )}

            {/* FIXED INPUTS */}
            {editingBucket.type === 'FIXED' && (
              <Input label="Belopp per månad" type="number" value={editingMonthData.amount || ''} onChange={e => setEditingMonthData({...editingMonthData, amount: Number(e.target.value)})} />
            )}

            {/* DAILY INPUTS */}
            {editingBucket.type === 'DAILY' && (
              <div className="space-y-4">
                 <Input label="Kostnad per dag" type="number" value={editingMonthData.dailyAmount || ''} onChange={e => setEditingMonthData({...editingMonthData, dailyAmount: Number(e.target.value)})} />
                 <div>
                    <label className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2 block">Aktiva dagar</label>
                    <div className="flex justify-between gap-1">
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
                          className={cn("w-10 h-10 rounded-full text-sm font-bold flex items-center justify-center transition-all", editingMonthData.activeDays?.includes(i) ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-500")}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-slate-500 mt-2">
                        {(() => {
                            const {start, end} = getBudgetInterval(selectedMonth, settings.payday);
                            return `Period: ${format(start, 'd MMM', {locale: sv})} - ${format(end, 'd MMM', {locale: sv})}`;
                        })()}
                    </p>
                 </div>
              </div>
            )}

            {/* GOAL INPUTS */}
            {editingBucket.type === 'GOAL' && (
              <div className="space-y-4">
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
                    Systemet beräknar automatiskt sparandet fram till månaden innan måldatumet. En separat utgiftspost för hela beloppet (som dras från saldot) kommer skapas på måldatumet.
                 </p>
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
    </div>
  );
};