
import React, { useEffect, useState, useMemo } from 'react';
import { useApp } from '../store';
import { calculateSavedAmount, calculateGoalBucketCost, formatMoney, generateId, calculateReimbursementMap, getEffectiveAmount, getEffectiveBucketData } from '../utils';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { format, parseISO, isValid, addMonths, differenceInMonths } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Archive, CheckCircle, Pause, Play, Rocket, TrendingUp, Calendar, Trash2, Settings, Save, Search, Receipt, CheckSquare, Square, X, Unlink, Wallet, PiggyBank, PieChart as PieChartIcon, ChevronDown, ChevronRight, Plus, Target, Image as ImageIcon, Link, Calculator, ArrowRight, Plane, Landmark, RotateCcw } from 'lucide-react';
import { cn, Button, Modal, Input } from '../components/components';
import { Bucket, Transaction, MainCategory, SubCategory } from '../types';
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

interface DreamCardProps {
    goal: Bucket;
    isArchived: boolean;
    selectedMonth: string;
    transactions: Transaction[];
    onArchive: (id: string, name: string) => void;
    onDelete: (id: string, name: string) => void;
    onEdit: (goal: Bucket) => void;
    onShowStats: (goal: Bucket) => void;
    onEditAmount: (goal: Bucket, currentAmount: number) => void;
}

const DreamCard: React.FC<DreamCardProps> = ({ goal, isArchived, selectedMonth, transactions, onArchive, onDelete, onEdit, onShowStats, onEditAmount }) => {
    const { updateBucket } = useApp();
    const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);

    const saved = calculateSavedAmount(goal, selectedMonth);
    const progress = goal.targetAmount > 0 ? Math.min(100, (saved / goal.targetAmount) * 100) : 0;
    
    const reimbursementMap = useMemo(() => calculateReimbursementMap(transactions), [transactions]);
    const totalBooked = useMemo(() => {
        return transactions
            .filter(t => !t.isHidden && t.bucketId === goal.id && (t.type === 'EXPENSE' || (!t.type && t.amount < 0)))
            .reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);
    }, [transactions, goal.id, reimbursementMap]);

    const isPaused = goal.monthlyData[selectedMonth]?.isExplicitlyDeleted;
    // An override for a dream is present if there is an explicit amount set for that month in monthlyData
    const isOverridden = goal.monthlyData[selectedMonth]?.amount !== undefined && goal.monthlyData[selectedMonth]?.amount > 0;

    let dateLabel = goal.targetDate ? format(parseISO(`${goal.targetDate}-01`), 'MMM yyyy', {locale: sv}) : 'Ej satt';

    const handleIconSelect = async (emoji: string) => {
        await updateBucket({ ...goal, icon: emoji });
    };

    const handleRestore = async (e: React.MouseEvent) => {
        e.stopPropagation();
        const nextData = { ...goal.monthlyData };
        if (nextData[selectedMonth]) {
            const { amount, ...rest } = nextData[selectedMonth];
            if (Object.keys(rest).length === 0 || (Object.keys(rest).length === 1 && rest.isExplicitlyDeleted === false)) {
                delete nextData[selectedMonth];
            } else {
                nextData[selectedMonth] = { ...rest };
            }
        }
        await updateBucket({ ...goal, monthlyData: nextData });
    };

    return (
        <div className={cn("relative w-full rounded-2xl overflow-hidden shadow-lg group bg-slate-800 transition-all border border-slate-700/50", (isArchived || isPaused) ? "grayscale opacity-90" : "")}>
            <div className="absolute inset-0 z-0">
                <div className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105" style={{ backgroundImage: `url(${goal.backgroundImage || DREAM_IMAGES[0]})` }} />
                <div className="absolute inset-0 bg-gradient-to-r from-slate-900 via-slate-900/80 to-slate-900/30" />
            </div>

            <div className="relative z-10 p-5 flex flex-col gap-4">
                <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0 pr-2">
                        <div className="flex items-center gap-2">
                            <button 
                                onClick={(e) => { e.stopPropagation(); setIsIconPickerOpen(true); }}
                                className="text-2xl leading-none bg-black/20 hover:bg-black/40 p-1.5 rounded-xl transition-all active:scale-90"
                            >
                                {goal.icon || (isArchived ? "🏁" : "🎯")}
                            </button>
                            <h2 className="text-xl font-bold leading-tight text-white drop-shadow-md truncate">{goal.name}</h2>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                            {!isArchived && goal.paymentSource !== 'BALANCE' && (
                                <button onClick={(e) => { e.stopPropagation(); const newData = {...goal.monthlyData}; newData[selectedMonth] = {...(newData[selectedMonth]||{amount:0,dailyAmount:0,activeDays:[]}), isExplicitlyDeleted: !isPaused}; updateBucket({...goal, monthlyData: newData}); }} className={cn("text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wide flex items-center gap-1 border transition-all", isPaused ? "bg-amber-500/20 border-amber-500/50 text-amber-300" : "bg-black/30 border-white/10 text-white/70")}>{isPaused ? "Pausad" : "Aktiv"}</button>
                            )}
                            <p className="text-xs text-slate-300 font-medium drop-shadow-sm">{isArchived ? `Klar ${goal.archivedDate}` : dateLabel}</p>
                        </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                        <button onClick={(e) => { e.stopPropagation(); onShowStats(goal); }} className="p-2 bg-black/20 hover:bg-black/40 text-white/70 rounded-lg transition-colors border border-white/5" title="Detaljer & Transaktioner"><PieChartIcon className="w-4 h-4" /></button>
                        {!isArchived && (<><button onClick={(e) => { e.stopPropagation(); onEdit(goal); }} className="p-2 bg-black/20 hover:bg-black/40 text-white/70 rounded-lg transition-colors border border-white/5"><Settings className="w-4 h-4" /></button><button onClick={(e) => { e.stopPropagation(); onArchive(goal.id, goal.name); }} className="p-2 bg-black/20 hover:bg-black/40 text-white/70 rounded-lg transition-colors border border-white/5"><Archive className="w-4 h-4" /></button></>)}
                        {isArchived && <button onClick={(e) => { e.stopPropagation(); onDelete(goal.id, goal.name); }} className="p-2 bg-rose-500/20 hover:bg-rose-500/40 text-rose-300 rounded-lg transition-colors border border-rose-500/20"><Trash2 className="w-4 h-4" /></button>}
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-black/30 p-3 rounded-xl border border-white/5 backdrop-blur-sm relative">
                    <div className="text-[9px] font-bold uppercase tracking-widest text-purple-300 mb-0.5">Spara denna månad</div>
                    <div 
                        className={cn("text-xl font-bold font-mono transition-colors flex items-center gap-2 cursor-pointer", isOverridden ? "text-yellow-400" : "text-white hover:text-blue-400")}
                        onClick={(e) => { 
                            e.stopPropagation(); 
                            const cost = calculateGoalBucketCost(goal, selectedMonth);
                            onEditAmount(goal, cost); 
                        }}
                    >
                        {formatMoney(calculateGoalBucketCost(goal, selectedMonth))}
                        {isOverridden && (
                            <button onClick={handleRestore} className="text-slate-400 hover:text-white p-0.5"><RotateCcw size={12} /></button>
                        )}
                    </div>
                  </div>
                  <div className="bg-black/30 p-3 rounded-xl border border-white/5 backdrop-blur-sm">
                    <div className="text-[9px] font-bold uppercase tracking-widest text-rose-300 mb-0.5">Totalt Spenderat</div>
                    <div className="text-xl font-bold font-mono text-white">{formatMoney(totalBooked)}</div>
                  </div>
                </div>

                <div className="flex items-end justify-between">
                    <div className="flex-1 mr-4">
                        <div className="flex justify-between items-end mb-1">
                          <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400">{isArchived ? "Slutresultat" : "Sparat kvar"}</div>
                          <div className="text-xs font-bold text-white">{Math.round(progress)}%</div>
                        </div>
                        <div className="h-2 w-full bg-black/40 rounded-full overflow-hidden border border-white/5">
                          <div 
                            className={cn("h-full transition-all duration-1000", isArchived ? "bg-slate-500" : "bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.5)]")} 
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                    </div>
                    <Button 
                      variant="ghost" 
                      onClick={(e) => { e.stopPropagation(); onShowStats(goal); }}
                      className="text-[10px] py-1 px-3 h-auto uppercase font-bold tracking-wider text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 border border-purple-500/20"
                    >
                      Visa Detaljer
                    </Button>
                </div>
            </div>

            <EmojiPickerModal isOpen={isIconPickerOpen} onClose={() => setIsIconPickerOpen(false)} onSelect={handleIconSelect} title={`Ikon för ${goal.name}`} />
        </div>
    );
};

export const DreamsView: React.FC<{ onNavigate?: (view: any) => void }> = ({ onNavigate }) => {
    const { buckets, updateBucket, deleteBucket, archiveBucket, selectedMonth, addBucket, accounts, transactions, mainCategories, subCategories } = useApp();
    const [showArchived, setShowArchived] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingGoal, setEditingGoal] = useState<Bucket | null>(null);
    const [statsGoal, setStatsGoal] = useState<Bucket | null>(null);
    const [expandedMains, setExpandedMains] = useState<Set<string>>(new Set());

    // Interactive Edit state
    const [editingBucket, setEditingBucket] = useState<Bucket | null>(null);
    const [editAmount, setEditAmount] = useState('');

    const goals = useMemo(() => {
        return buckets.filter(b => b.type === 'GOAL').filter(b => showArchived ? !!b.archivedDate : !b.archivedDate).sort((a, b) => (a.targetDate || '') > (b.targetDate || '') ? 1 : -1);
    }, [buckets, showArchived]);

    const reimbursementMap = useMemo(() => calculateReimbursementMap(transactions), [transactions]);

    const statsData = useMemo(() => {
        if (!statsGoal) return null;
        const relevantTxs = transactions.filter(t => !t.isHidden && t.bucketId === statsGoal.id && (t.type === 'EXPENSE' || (!t.type && t.amount < 0)));
        const totalBooked = relevantTxs.reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);

        const breakdown = mainCategories.map(main => {
            const mainTxs = relevantTxs.filter(t => t.categoryMainId === main.id);
            if (mainTxs.length === 0) return null;
            const mainTotal = mainTxs.reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);
            
            const subs = subCategories.filter(s => s.mainCategoryId === main.id).map(sub => {
                const subTxs = mainTxs.filter(t => t.categorySubId === sub.id);
                if (subTxs.length === 0) return null;
                const subTotal = subTxs.reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);
                return { ...sub, total: subTotal, transactions: subTxs };
            }).filter((s): s is NonNullable<typeof s> => !!s).sort((a, b) => b.total - a.total);
            
            const uncatTxs = mainTxs.filter(t => !t.categorySubId);
            if (uncatTxs.length > 0) {
              const uncatTotal = uncatTxs.reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);
              subs.push({
                id: 'uncat-' + main.id,
                name: 'Ospecificerat',
                mainCategoryId: main.id,
                total: uncatTotal,
                transactions: uncatTxs
              } as any);
            }

            return { ...main, total: mainTotal, subs };
        }).filter((m): m is NonNullable<typeof m> => !!m).sort((a, b) => b.total - a.total);

        return { totalBooked, breakdown };
    }, [statsGoal, transactions, mainCategories, subCategories, reimbursementMap]);

    const toggleMain = (id: string) => {
        const next = new Set(expandedMains);
        if (next.has(id)) next.delete(id); else next.add(id);
        setExpandedMains(next);
    };

    const handleArchive = (id: string, name: string) => { if (confirm(`Är du säker på att du vill arkivera "${name}"?`)) archiveBucket(id, selectedMonth); };
    const handleDelete = (id: string, name: string) => { if (confirm(`VARNING: Detta tar bort "${name}" permanent. Vill du fortsätta?`)) deleteBucket(id, selectedMonth, 'ALL'); };

    const handleSaveGoal = async () => { 
        if (!editingGoal) return; 
        if (buckets.find(b => b.id === editingGoal.id)) await updateBucket(editingGoal); 
        else await addBucket(editingGoal); 
        setIsEditModalOpen(false); 
    };

    const handleEditBucket = (bucket: Bucket, currentAmount: number) => {
        setEditingBucket(bucket);
        setEditAmount(currentAmount.toString());
    };

    const saveDreamOverride = async () => {
        if (!editingBucket) return;
        const val = parseFloat(editAmount) || 0;
        const nextData = { ...editingBucket.monthlyData };
        nextData[selectedMonth] = { ...(nextData[selectedMonth] || { dailyAmount: 0, activeDays: [] }), amount: val, isExplicitlyDeleted: false };
        await updateBucket({ ...editingBucket, monthlyData: nextData });
        setEditingBucket(null);
    };

    return (
        <div className="space-y-6 pb-24 animate-in slide-in-from-right duration-300">
            <header className="flex flex-col gap-4">
                <div className="flex justify-between items-start">
                    <div>
                        <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">Drömmar & Mål</h1>
                        <p className="text-slate-400">Visualisera och nå dina sparmål.</p>
                    </div>
                    <div className="flex bg-slate-800 p-1 rounded-xl shadow-lg border border-slate-700/50">
                        <button onClick={() => setShowArchived(false)} className={cn("px-4 py-2 text-xs font-bold rounded-lg transition-all", !showArchived ? "bg-purple-600 text-white shadow-md" : "text-slate-400 hover:text-white")}>Aktiva</button>
                        <button onClick={() => setShowArchived(true)} className={cn("px-4 py-2 text-xs font-bold rounded-lg transition-all", showArchived ? "bg-purple-600 text-white shadow-md" : "text-slate-400 hover:text-white")}>Arkiverade</button>
                    </div>
                </div>
                {onNavigate && (
                    <button onClick={() => onNavigate('housing-calculator')} className="w-full bg-slate-800 border border-slate-700 p-4 rounded-2xl flex items-center justify-between group hover:bg-slate-700 transition-all shadow-lg border-l-4 border-l-orange-500">
                        <div className="flex items-center gap-3">
                            <div className="bg-orange-500/20 p-2 rounded-xl text-orange-400"><Calculator size={20}/></div>
                            <div className="text-left">
                                <div className="font-bold text-white">Boendekalkylator</div>
                                <div className="text-xs text-slate-400">Jämför månadskostnad vid flytt</div>
                            </div>
                        </div>
                        <ArrowRight size={18} className="text-slate-500 group-hover:text-white transition-colors" />
                    </button>
                )}
            </header>

            <div className="space-y-6">
                {goals.map(goal => (
                    <DreamCard 
                        key={goal.id} 
                        goal={goal} 
                        isArchived={!!goal.archivedDate} 
                        selectedMonth={selectedMonth} 
                        transactions={transactions} 
                        onArchive={handleArchive} 
                        onDelete={handleDelete} 
                        onEdit={(g) => {setEditingGoal(g); setIsEditModalOpen(true);}} 
                        onShowStats={(g) => setStatsGoal(g)}
                        onEditAmount={handleEditBucket}
                    />
                ))}
                {!showArchived && (
                  <Button 
                    variant="secondary" 
                    onClick={() => {
                        setEditingGoal({
                            id: generateId(),
                            accountId: accounts[0]?.id || '',
                            name: '',
                            type: 'GOAL',
                            isSavings: true,
                            paymentSource: 'INCOME',
                            monthlyData: {},
                            targetAmount: 0,
                            targetDate: format(addMonths(new Date(), 12), 'yyyy-MM'),
                            startSavingDate: selectedMonth,
                            backgroundImage: DREAM_IMAGES[Math.floor(Math.random() * DREAM_IMAGES.length)],
                            autoTagEvent: false
                        });
                        setIsEditModalOpen(true);
                    }} 
                    className="w-full border-dashed border-2 border-slate-700 py-6 text-slate-500 hover:text-purple-400 hover:border-purple-500/50 transition-all"
                  >
                      <Plus className="w-6 h-6 mr-2" /> Skapa Ny Dröm
                  </Button>
                )}
            </div>

            <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title={editingGoal?.name ? `Redigera ${editingGoal.name}` : "Ny Dröm"}>
                {editingGoal && (
                    <div className="space-y-5">
                        <Input label="Namn på drömmen" value={editingGoal.name} onChange={e => setEditingGoal({...editingGoal, name: e.target.value})} autoFocus placeholder="T.ex. Sommarresa, Ny bil, Buffert" />
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Kopplat Konto</label>
                          <select value={editingGoal.accountId} onChange={(e) => setEditingGoal({...editingGoal, accountId: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white">
                            {accounts.map(acc => (<option key={acc.id} value={acc.id}>{acc.icon} {acc.name}</option>))}
                          </select>
                        </div>
                        <Input label="Målbelopp (kr)" type="number" value={editingGoal.targetAmount} onChange={e => setEditingGoal({...editingGoal, targetAmount: Number(e.target.value)})} placeholder="0" />
                        <div className="grid grid-cols-2 gap-4">
                          <Input label="Startmånad" type="month" value={editingGoal.startSavingDate} onChange={e => setEditingGoal({...editingGoal, startSavingDate: e.target.value})} />
                          <Input label="Målmånad" type="month" value={editingGoal.targetDate} onChange={e => setEditingGoal({...editingGoal, targetDate: e.target.value})} />
                        </div>

                        {/* --- DATUMINSTÄLLNINGAR FÖR RESA/EVENT --- */}
                        <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700 space-y-4 mt-4">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-xl">✈️</span>
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                                    Reseplanering
                                </h4>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Startdatum</label>
                                    <input
                                        type="date"
                                        value={editingGoal.eventStartDate || ''}
                                        onChange={(e) => setEditingGoal({ ...editingGoal, eventStartDate: e.target.value })}
                                        className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Slutdatum</label>
                                    <input
                                        type="date"
                                        value={editingGoal.eventEndDate || ''}
                                        onChange={(e) => setEditingGoal({ ...editingGoal, eventEndDate: e.target.value })}
                                        className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                                    />
                                </div>
                            </div>

                            {/* SEPARAT CHECKBOX FÖR ATT AKTIVERA AUTOMATISK BOKFÖRING */}
                            {editingGoal.eventStartDate && editingGoal.eventEndDate && (
                                <div className="flex items-start gap-3 p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
                                    <input
                                        type="checkbox"
                                        id="autoTag"
                                        checked={editingGoal.autoTagEvent || false}
                                        onChange={(e) => setEditingGoal({ ...editingGoal, autoTagEvent: e.target.checked })}
                                        className="mt-1 w-4 h-4 rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-offset-slate-900"
                                    />
                                    <label htmlFor="autoTag" className="text-sm text-slate-300 cursor-pointer">
                                        <span className="block text-white font-medium mb-0.5">Automatisera Import</span>
                                        Alla kortköp som görs mellan dessa datum kommer automatiskt bokföras mot denna resa.
                                    </label>
                                </div>
                            )}
                        </div>

                        <div className="pt-4 flex gap-3">
                          <Button variant="secondary" onClick={() => setIsEditModalOpen(false)} className="flex-1">Avbryt</Button>
                          <Button onClick={handleSaveGoal} disabled={!editingGoal.name} className="flex-1 bg-purple-600">Spara Dröm</Button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* EDIT SAVING AMOUNT MODAL (DREAMS) */}
            <Modal isOpen={!!editingBucket} onClose={() => setEditingBucket(null)} title={`Ändra sparande: ${editingBucket?.name}`}>
                <div className="space-y-6">
                    <div className="bg-slate-800 p-4 rounded-xl text-center border border-slate-700">
                        <label className="text-xs text-slate-400 uppercase font-bold mb-2 block">Spara denna månad</label>
                        <Input 
                            type="number" 
                            value={editAmount} 
                            onChange={(e) => setEditAmount(e.target.value)}
                            className="text-center text-3xl font-mono"
                            autoFocus
                        />
                        <p className="text-[10px] text-slate-500 mt-2 italic leading-relaxed">
                            Ändringar denna månad justerar framtida sparbehov automatiskt för att nå målet.
                        </p>
                    </div>
                    <Button onClick={saveDreamOverride} className="w-full bg-purple-600">Bekräfta</Button>
                </div>
            </Modal>

            <Modal isOpen={!!statsGoal} onClose={() => setStatsGoal(null)} title={`Detaljer: ${statsGoal?.name}`}>
                {statsGoal && statsData && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700">
                                <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Mål/Budget</div>
                                <div className="text-xl font-mono font-bold text-white">{formatMoney(statsGoal.targetAmount)}</div>
                            </div>
                            <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700">
                                <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Spenderat</div>
                                <div className="text-xl font-mono font-bold text-rose-400">{formatMoney(statsData.totalBooked)}</div>
                            </div>
                        </div>
                        <div className="space-y-3">
                            {statsData.breakdown.map(main => {
                                const isExpanded = expandedMains.has(main.id);
                                return (
                                    <div key={main.id} className="bg-slate-900/50 rounded-xl border border-slate-700 overflow-hidden">
                                        <div className="flex justify-between items-center p-3 cursor-pointer hover:bg-slate-800 transition-colors" onClick={() => toggleMain(main.id)}>
                                          <div className="flex items-center gap-3">
                                            {isExpanded ? <ChevronDown size={16} className="text-blue-400"/> : <ChevronRight size={16} className="text-slate-500"/>}
                                            <span className="font-bold text-white text-sm">{main.name}</span>
                                          </div>
                                          <span className="font-mono text-white text-xs">{formatMoney(main.total)}</span>
                                        </div>
                                        {isExpanded && (
                                          <div className="bg-black/20 border-t border-slate-800 pb-2">
                                            {main.subs.map(sub => (
                                              <div key={sub.id} className="p-3 border-b border-white/5 last:border-0">
                                                <div className="flex justify-between items-center px-2 mb-2"><span className="text-xs text-slate-300 font-medium">{sub.name}</span><span className="text-xs font-mono text-slate-400">{formatMoney(sub.total)}</span></div>
                                                <div className="space-y-1.5 pl-2">{sub.transactions.map(t => (
                                                    <div key={t.id} className="flex justify-between items-center text-[10px] bg-white/5 p-2 rounded-lg"><div className="flex flex-col"><span className="text-slate-200 font-medium">{t.description}</span><span className="text-slate-500">{t.date}</span></div><span className="font-mono text-slate-400">{formatMoney(Math.abs(getEffectiveAmount(t, reimbursementMap)))}</span></div>
                                                ))}</div>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        <Button variant="secondary" onClick={() => setStatsGoal(null)} className="w-full">Stäng</Button>
                    </div>
                )}
            </Modal>
        </div>
    );
};
