

import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useApp } from '../store';
import { Transaction, ImportRule, Bucket, MainCategory, SubCategory, AppSettings, Account } from '../types';
import { parseBankFile, runImportPipeline } from '../services/importService';
import { categorizeTransactionsWithAi } from '../services/aiService';
import { cn, Button, Card, Modal, Input } from '../components/components';
import { Upload, Check, Wand2, Save, Trash2, Loader2, AlertTriangle, Zap, Clock, ArrowRightLeft, ShoppingCart, ArrowDownLeft, Sparkles, CheckCircle, Target, LayoutList, GalleryHorizontalEnd, ChevronLeft, ChevronRight, Search, Filter, Link2, CalendarClock, PlusCircle, CheckCircle2, Gavel, Edit2, FileText, X, Plus, XCircle, Smartphone, LayoutGrid, Square, CheckSquare, Layers, Plane, SlidersHorizontal, Unlink, Calendar } from 'lucide-react';
import { formatMoney, generateId, getBudgetInterval } from '../utils';
import { useTransferMatching } from '../hooks/useTransferMatching';
import { useSubscriptionDetection } from '../hooks/useSubscriptionDetection';
import { format, subMonths } from 'date-fns';

// --- SUB-COMPONENT: STAGING ROW (List View) ---

const TransactionRow: React.FC<{ 
    tx: Transaction; 
    buckets: Bucket[]; 
    mainCategories: MainCategory[];
    subCategories: SubCategory[];
    settings: AppSettings;
    onChange: (id: string, field: 'type'|'bucketId'|'categoryMainId'|'categorySubId'|'isManuallyApproved', value: string | boolean) => void;
    onUnapprove: (id: string) => void;
    onCreateRule: (tx: Transaction) => void;
    onAiGuess: (tx: Transaction) => void;
    isAiLoading: boolean;
}> = ({ tx, buckets, mainCategories, subCategories, settings, onChange, onUnapprove, onCreateRule, onAiGuess, isAiLoading }) => {
    
    // 1. Check Completeness (Data available?)
    const isTransfer = tx.type === 'TRANSFER';
    const isExpense = tx.type === 'EXPENSE';
    const isIncome = tx.type === 'INCOME';

    const hasRequiredData = 
        (isTransfer && !!tx.bucketId) || 
        (isExpense && !!tx.categoryMainId && !!tx.categorySubId) || 
        (isIncome && !!tx.categoryMainId);

    // 2. Check Approval Logic
    const isSystemMatch = tx.matchType === 'rule' || tx.matchType === 'history' || tx.matchType === 'event';
    const settingAllowsAuto = 
        (isTransfer && settings.autoApproveTransfer) ||
        (isExpense && settings.autoApproveExpense) ||
        (isIncome && settings.autoApproveIncome);

    const autoApproved = isSystemMatch && settingAllowsAuto;
    const isReady = hasRequiredData && (tx.isManuallyApproved || autoApproved);
    const needsManualApproval = hasRequiredData && !isReady;

    // Status UI
    let statusColor = "bg-slate-800 border-slate-700"; 
    let icon = <div className="w-4 h-4 rounded-full border border-slate-500"></div>;
    let title = "Ej kategoriserad";
    
    const matchType = tx.matchType || (tx.ruleMatch ? 'rule' : (tx.aiSuggested ? 'ai' : undefined));

    if (isReady) {
        statusColor = "bg-emerald-900/30 border-emerald-500/50 shadow-[inset_0_0_20px_-10px_rgba(16,185,129,0.3)]";
        icon = <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20"><Check className="w-3 h-3 text-white stroke-[3]" /></div>;
        title = "Klar";
    } else if (needsManualApproval) {
        statusColor = "bg-yellow-900/30 border-yellow-500/50";
        icon = <div className="w-5 h-5 rounded-full bg-yellow-500/20 flex items-center justify-center border border-yellow-500"><div className="w-2 h-2 rounded-full bg-yellow-500"></div></div>;
        title = "Kräver godkännande";
    } else if (matchType === 'rule') {
        statusColor = "bg-emerald-950/30 border-emerald-500/30";
        icon = <Zap className="w-4 h-4 text-emerald-500" />;
        title = "Matchad av regel";
    } else if (matchType === 'history') {
        statusColor = "bg-blue-950/30 border-blue-500/30";
        icon = <Clock className="w-4 h-4 text-blue-400" />;
        title = "Matchad via historik";
    } else if (matchType === 'event') {
        statusColor = "bg-purple-950/30 border-purple-500/30";
        icon = <Plane className="w-4 h-4 text-purple-400" />;
        title = "Matchad mot resa/event";
    } else if (matchType === 'ai') {
        statusColor = "bg-purple-950/30 border-purple-500/30";
        icon = <Wand2 className="w-4 h-4 text-purple-400" />;
        title = "AI-gissning";
    } else if (!hasRequiredData) {
        statusColor = "bg-slate-800 border-l-4 border-l-slate-500";
    }

    // Filter subcategories based on selected main category
    const validSubCats = useMemo(() => {
        if (!tx.categoryMainId) return [];
        return subCategories.filter(sc => sc.mainCategoryId === tx.categoryMainId);
    }, [tx.categoryMainId, subCategories]);

    return (
        <div className={cn("flex flex-col gap-3 p-3 rounded-lg border text-sm mb-2 transition-all hover:bg-slate-700/50", statusColor)}>
            {/* ROW 1: Info & Actions */}
            <div className="flex items-center gap-3">
                <div className="flex justify-center w-8 shrink-0" title={title}>
                    {isAiLoading ? <Loader2 className="w-4 h-4 animate-spin text-purple-400" /> : icon}
                </div>
                <div className="text-slate-400 text-xs w-24 shrink-0">{tx.date}</div>
                <div className="flex-1 font-medium text-white truncate min-w-0" title={tx.description}>
                    {tx.description}
                </div>
                <div className="font-mono text-right shrink-0">{formatMoney(tx.amount)}</div>
                
                {/* Actions Area */}
                <div className="flex items-center justify-end gap-1 w-24 shrink-0">
                     {!isReady && (
                        <button 
                            onClick={() => onAiGuess(tx)}
                            disabled={isAiLoading}
                            className="p-1.5 text-purple-400 hover:text-white hover:bg-purple-600/40 rounded transition-colors"
                            title="AI Gissning"
                        >
                            <Sparkles size={14} />
                        </button>
                    )}
                    {needsManualApproval && (
                        <button 
                            onClick={() => onChange(tx.id, 'isManuallyApproved', true)}
                            className="p-1.5 bg-yellow-500/20 hover:bg-emerald-500 text-yellow-500 hover:text-white rounded transition-colors animate-pulse"
                            title="Godkänn manuellt"
                        >
                            <CheckCircle className="w-4 h-4" />
                        </button>
                    )}
                    {isReady && (
                        <div className="flex items-center gap-1">
                             {matchType !== 'rule' && (
                                <button 
                                    onClick={() => onCreateRule(tx)}
                                    className="p-1.5 text-slate-400 hover:text-white hover:bg-blue-600 rounded transition-colors"
                                    title="Skapa regel för framtiden"
                                >
                                    <Save className="w-4 h-4" />
                                </button>
                             )}
                             <button
                                onClick={() => onUnapprove(tx.id)}
                                className="p-1.5 text-emerald-600 hover:text-rose-500 hover:bg-rose-500/20 rounded transition-colors"
                                title="Avmarkera / Ångra godkännande"
                            >
                                <XCircle className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* CONTROLS AREA (Row 2 & 3) */}
            <div className="flex flex-col gap-2 pl-11">
                 {/* ROW 2: TYPE SELECTOR */}
                <div className="flex bg-slate-900 rounded-lg p-1 w-full">
                    <button 
                        onClick={() => onChange(tx.id, 'type', 'EXPENSE')}
                        className={cn("flex-1 text-xs py-2 rounded-md flex items-center justify-center gap-2 transition-all", isExpense ? "bg-rose-500 text-white font-bold shadow-sm" : "text-slate-400 hover:text-white hover:bg-slate-800")}
                        title="Utgift / Konsumtion"
                    >
                        <ShoppingCart size={14} /> Utgift
                    </button>
                    <button 
                        onClick={() => onChange(tx.id, 'type', 'TRANSFER')}
                        className={cn("flex-1 text-xs py-2 rounded-md flex items-center justify-center gap-2 transition-all", isTransfer ? "bg-blue-500 text-white font-bold shadow-sm" : "text-slate-400 hover:text-white hover:bg-slate-800")}
                        title="Överföring till konto/budget"
                    >
                        <ArrowRightLeft size={14} /> Överföring
                    </button>
                    <button 
                        onClick={() => onChange(tx.id, 'type', 'INCOME')}
                        className={cn("flex-1 text-xs py-2 rounded-md flex items-center justify-center gap-2 transition-all", isIncome ? "bg-emerald-500 text-white font-bold shadow-sm" : "text-slate-400 hover:text-white hover:bg-slate-800")}
                        title="Inkomst"
                    >
                        <ArrowDownLeft size={14} /> Inkomst
                    </button>
                </div>

                {/* ROW 3: CATEGORY/BUCKET SELECTORS */}
                <div className="w-full">
                    {isTransfer && (
                        <select 
                            className={cn(
                                "w-full bg-slate-900 border rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none transition-colors",
                                !tx.bucketId ? "border-rose-500/50 text-rose-200" : "border-slate-600 text-blue-200"
                            )}
                            value={tx.bucketId || ""}
                            onChange={(e) => onChange(tx.id, 'bucketId', e.target.value)}
                            title="Budgetpost (Varifrån tas pengarna?)"
                        >
                            <option value="">-- Välj Destination --</option>
                            <option value="INTERNAL">Intern Överföring (Mellan egna konton)</option>
                            <option value="PAYOUT">Utbetalning (Till annat konto)</option>
                            <optgroup label="Budgetposter">
                                {buckets
                                    .filter(b => b.accountId === tx.accountId)
                                    .map(b => (
                                    <option key={b.id} value={b.id}>{b.name}</option>
                                ))}
                            </optgroup>
                        </select>
                    )}

                    {isExpense && (
                        <div className="flex gap-2 items-center">
                            <select 
                                className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 outline-none"
                                value={tx.categoryMainId || ""}
                                onChange={(e) => onChange(tx.id, 'categoryMainId', e.target.value)}
                                title="Huvudkategori"
                            >
                                <option value="">-- Kategori --</option>
                                {mainCategories.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                            <select 
                                className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 outline-none disabled:opacity-50"
                                value={tx.categorySubId || ""}
                                onChange={(e) => onChange(tx.id, 'categorySubId', e.target.value)}
                                disabled={!tx.categoryMainId || validSubCats.length === 0}
                                title="Underkategori"
                            >
                                <option value="">-- Specifikt --</option>
                                {validSubCats.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {isIncome && (
                        <select 
                            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white focus:border-emerald-500 outline-none"
                            value={tx.categoryMainId || ""}
                            onChange={(e) => onChange(tx.id, 'categoryMainId', e.target.value)}
                        >
                            <option value="">-- Typ av Inkomst --</option>
                            {mainCategories.filter(c => c.name.includes('Inkomst')).map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    )}
                </div>
            </div>
        </div>
    );
};

// --- SUB-COMPONENT: CARD VIEW ---

const TransactionCard: React.FC<{
    tx: Transaction;
    buckets: Bucket[];
    mainCategories: MainCategory[];
    subCategories: SubCategory[];
    settings: AppSettings;
    accounts: Account[];
    onChange: (id: string, field: 'type'|'bucketId'|'categoryMainId'|'categorySubId'|'isManuallyApproved', value: string | boolean) => void;
    onApprove: (id: string) => void;
    onNext: () => void;
    onPrev: () => void;
    isFirst: boolean;
    isLast: boolean;
}> = ({ tx, buckets, mainCategories, subCategories, settings, accounts, onChange, onApprove, onNext, onPrev, isFirst, isLast }) => {
    
    // Swipe Logic
    const [touchStart, setTouchStart] = useState<number | null>(null);
    const [touchEnd, setTouchEnd] = useState<number | null>(null);
    const minSwipeDistance = 50;

    const onTouchStart = (e: React.TouchEvent) => {
        setTouchEnd(null);
        setTouchStart(e.targetTouches[0].clientX);
    };
    const onTouchMove = (e: React.TouchEvent) => setTouchEnd(e.targetTouches[0].clientX);
    const onTouchEnd = () => {
        if (!touchStart || !touchEnd) return;
        const distance = touchStart - touchEnd;
        const isLeftSwipe = distance > minSwipeDistance;
        const isRightSwipe = distance < -minSwipeDistance;
        if (isLeftSwipe && !isLast) onNext();
        if (isRightSwipe && !isFirst) onPrev();
    };

    const isTransfer = tx.type === 'TRANSFER';
    const isExpense = tx.type === 'EXPENSE';
    const isIncome = tx.type === 'INCOME';

    const hasRequiredData = 
        (isTransfer && !!tx.bucketId) || 
        (isExpense && !!tx.categoryMainId && !!tx.categorySubId) || 
        (isIncome && !!tx.categoryMainId);

    const isSystemMatch = tx.matchType === 'rule' || tx.matchType === 'history';
    const autoApproved = isSystemMatch && ((isTransfer && settings.autoApproveTransfer) || (isExpense && settings.autoApproveExpense) || (isIncome && settings.autoApproveIncome));
    const isReady = hasRequiredData && (tx.isManuallyApproved || autoApproved);

    const validSubCats = useMemo(() => {
        if (!tx.categoryMainId) return [];
        return subCategories.filter(sc => sc.mainCategoryId === tx.categoryMainId);
    }, [tx.categoryMainId, subCategories]);

    const handleApproveAndNext = () => {
        onChange(tx.id, 'isManuallyApproved', true);
        setTimeout(() => {
            if (!isLast) onNext();
        }, 200); // Small delay for visual feedback
    };

    return (
        <div 
            className="flex flex-col h-full justify-between"
            onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        >
            <Card className="flex-1 flex flex-col justify-center items-center text-center space-y-6 relative overflow-hidden border-slate-700 bg-slate-800/80 p-6 min-h-[400px]">
                 {/* Navigation Hints */}
                 {!isFirst && <div className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-700 pointer-events-none"><ChevronLeft size={32} /></div>}
                 {!isLast && <div className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-700 pointer-events-none"><ChevronRight size={32} /></div>}

                 {/* Date & Account */}
                 <div className="text-sm text-slate-400 font-medium uppercase tracking-wider">
                     {tx.date} • {accounts.find(a => a.id === tx.accountId)?.name}
                 </div>

                 {/* Amount */}
                 <div className="text-5xl font-bold font-mono text-white tracking-tight">
                     {formatMoney(tx.amount)}
                 </div>

                 {/* Description */}
                 <div className="text-xl text-blue-100 font-medium break-words max-w-full px-4">
                     {tx.description}
                 </div>

                 {/* Match Badge */}
                 {(tx.matchType || tx.isManuallyApproved) && (
                     <div className="px-3 py-1 rounded-full text-xs font-bold uppercase flex items-center gap-2 bg-slate-700 text-slate-400">
                         {tx.matchType === 'rule' && <><Zap size={12}/> Regelmatch</>}
                         {tx.matchType === 'history' && <><Clock size={12}/> Historik</>}
                         {tx.matchType === 'ai' && <><Wand2 size={12}/> AI Gissning</>}
                         {tx.isManuallyApproved && <><CheckCircle size={12}/> Manuellt Godkänd</>}
                     </div>
                 )}

                 {/* Controls */}
                 <div className="w-full max-w-sm space-y-4 pt-4 border-t border-slate-700/50">
                    {/* Type Toggle */}
                    <div className="flex bg-slate-900 rounded-xl p-1 w-full shadow-inner">
                        <button onClick={() => onChange(tx.id, 'type', 'EXPENSE')} className={cn("flex-1 py-3 rounded-lg text-xs font-bold transition-all", isExpense ? "bg-rose-600 text-white shadow-lg" : "text-slate-500 hover:text-slate-300")}>Utgift</button>
                        <button onClick={() => onChange(tx.id, 'type', 'TRANSFER')} className={cn("flex-1 py-3 rounded-lg text-xs font-bold transition-all", isTransfer ? "bg-blue-600 text-white shadow-lg" : "text-slate-500 hover:text-slate-300")}>Överföring</button>
                        <button onClick={() => onChange(tx.id, 'type', 'INCOME')} className={cn("flex-1 py-3 rounded-lg text-xs font-bold transition-all", isIncome ? "bg-emerald-600 text-white shadow-lg" : "text-slate-500 hover:text-slate-300")}>Inkomst</button>
                    </div>

                    {/* Dropdowns */}
                    <div className="space-y-3">
                         {isTransfer && (
                            <select 
                                className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white focus:border-blue-500 outline-none"
                                value={tx.bucketId || ""}
                                onChange={(e) => onChange(tx.id, 'bucketId', e.target.value)}
                            >
                                <option value="">-- Välj Destination --</option>
                                <option value="INTERNAL">Intern Överföring</option>
                                <option value="PAYOUT">Utbetalning</option>
                                <optgroup label="Budgetposter">
                                    {buckets.filter(b => b.accountId === tx.accountId).map(b => (
                                        <option key={b.id} value={b.id}>{b.name}</option>
                                    ))}
                                </optgroup>
                            </select>
                         )}
                         
                         {isExpense && (
                             <div className="space-y-3">
                                <select 
                                    className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white focus:border-blue-500 outline-none"
                                    value={tx.categoryMainId || ""}
                                    onChange={(e) => onChange(tx.id, 'categoryMainId', e.target.value)}
                                >
                                    <option value="">-- Huvudkategori --</option>
                                    {mainCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                                <select 
                                    className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white focus:border-blue-500 outline-none disabled:opacity-50"
                                    value={tx.categorySubId || ""}
                                    onChange={(e) => onChange(tx.id, 'categorySubId', e.target.value)}
                                    disabled={!tx.categoryMainId}
                                >
                                    <option value="">-- Underkategori --</option>
                                    {validSubCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                             </div>
                         )}

                         {isIncome && (
                            <select 
                                className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white focus:border-emerald-500 outline-none"
                                value={tx.categoryMainId || ""}
                                onChange={(e) => onChange(tx.id, 'categoryMainId', e.target.value)}
                            >
                                <option value="">-- Typ av Inkomst --</option>
                                {mainCategories.filter(c => c.name.includes('Inkomst')).map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                         )}
                    </div>
                 </div>
            </Card>

            {/* ACTION BUTTONS */}
            <div className="grid grid-cols-2 gap-4 mt-6">
                <Button variant="secondary" onClick={onNext} className="py-4">
                     Hoppa över
                </Button>
                <Button 
                    variant="primary" 
                    onClick={handleApproveAndNext} 
                    disabled={!hasRequiredData}
                    className={cn("py-4 text-lg shadow-xl", isReady ? "bg-emerald-600 hover:bg-emerald-500" : "bg-blue-600 hover:bg-blue-500")}
                >
                    {isReady ? "Redan Klar (Nästa)" : "Godkänn & Nästa"}
                </Button>
            </div>
        </div>
    );
};

export const TransactionsView: React.FC = () => {
    const { 
        accounts, 
        buckets, 
        mainCategories, 
        subCategories, 
        settings, 
        addTransactions, 
        addImportRule, 
        importRules,
        deleteImportRule,
        updateImportRule,
        transactions,
        updateTransaction,
        addBucket,
        ignoredSubscriptions,
        addIgnoredSubscription,
        selectedMonth
    } = useApp();

    const [viewMode, setViewMode] = useState<'import' | 'history' | 'smart-transfers' | 'subscriptions' | 'rules'>('import');
    
    // View Format for Import Tab (List vs Cards)
    const [viewFormat, setViewFormat] = useState<'list'|'cards'>('list');
    
    // Search States
    const [importSearch, setImportSearch] = useState('');
    const [historySearch, setHistorySearch] = useState('');
    const [historyAccountFilter, setHistoryAccountFilter] = useState('');
    const [historyFilterMainCat, setHistoryFilterMainCat] = useState('');
    const [historyFilterSubCat, setHistoryFilterSubCat] = useState('');
    const [historyFilterAmountMin, setHistoryFilterAmountMin] = useState<string>('');
    const [historyFilterAmountMax, setHistoryFilterAmountMax] = useState<string>('');
    
    // --- NEW: History Date Filters & Pagination ---
    const [historyDateFrom, setHistoryDateFrom] = useState('');
    const [historyDateTo, setHistoryDateTo] = useState('');
    const [historyPage, setHistoryPage] = useState(0);
    const HISTORY_PAGE_SIZE = 50;

    // --- NEW: History View Filter States ---
    const [historyTypeFilter, setHistoryTypeFilter] = useState<'ALL' | 'EXPENSE' | 'TRANSFER' | 'INCOME'>('ALL');
    const [historyTransferScope, setHistoryTransferScope] = useState<'ALL' | 'UNLINKED' | 'LINKED'>('ALL');

    const [importedTransactions, setImportedTransactions] = useState<Transaction[]>([]);
    const [selectedAccount, setSelectedAccount] = useState<string>('');
    const [isAiLoading, setIsAiLoading] = useState(false);
    
    // For Card View Navigation
    const [currentCardIndex, setCurrentCardIndex] = useState(0);
    
    // Rule Modal State
    const [ruleModalOpen, setRuleModalOpen] = useState(false);
    const [ruleTransaction, setRuleTransaction] = useState<Transaction | null>(null);
    const [editingRule, setEditingRule] = useState<ImportRule | null>(null);
    const [ruleKeyword, setRuleKeyword] = useState('');
    const [ruleMatchType, setRuleMatchType] = useState<'contains' | 'exact' | 'starts_with'>('contains');
    const [ruleSign, setRuleSign] = useState<'positive' | 'negative' | undefined>(undefined);

    // Edit Transaction Modal State
    const [isEditTransactionModalOpen, setIsEditTransactionModalOpen] = useState(false);
    const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
    const [editDescription, setEditDescription] = useState('');
    const [editDate, setEditDate] = useState('');

    // History Bulk Selection State
    const [selectedHistoryIds, setSelectedHistoryIds] = useState<Set<string>>(new Set());
    const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
    
    // Bulk Edit Form State
    const [bulkTargetType, setBulkTargetType] = useState<'EXPENSE' | 'TRANSFER' | 'INCOME' | undefined>(undefined);
    const [bulkBucketId, setBulkBucketId] = useState('');
    const [bulkMainCatId, setBulkMainCatId] = useState('');
    const [bulkSubCatId, setBulkSubCatId] = useState('');
    const [bulkDreamId, setBulkDreamId] = useState(''); 

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Filtered transaction list for "History" tab
    const filteredHistoryTransactions = useMemo(() => {
        return transactions
            .filter(t => t.isVerified)
            .filter(t => {
                const matchesSearch = !historySearch || t.description.toLowerCase().includes(historySearch.toLowerCase());
                const matchesAccount = !historyAccountFilter || t.accountId === historyAccountFilter;
                
                // Date Filter
                const matchesFrom = !historyDateFrom || t.date >= historyDateFrom;
                const matchesTo = !historyDateTo || t.date <= historyDateTo;

                // Advanced Filters
                const matchesMainCat = !historyFilterMainCat || 
                    (historyFilterMainCat === '__UNCAT__' ? !t.categoryMainId : t.categoryMainId === historyFilterMainCat);
                
                const matchesSubCat = !historyFilterSubCat || 
                    (historyFilterSubCat === '__UNCAT__' ? !t.categorySubId : t.categorySubId === historyFilterSubCat);
                
                const amount = Math.abs(t.amount);
                const matchesMin = !historyFilterAmountMin || amount >= Number(historyFilterAmountMin);
                const matchesMax = !historyFilterAmountMax || amount <= Number(historyFilterAmountMax);

                // Type Filtering
                const matchesType = historyTypeFilter === 'ALL' || t.type === historyTypeFilter;

                // Transfer Scope Filtering
                let matchesTransferScope = true;
                if (historyTypeFilter === 'TRANSFER') {
                    if (historyTransferScope === 'UNLINKED') {
                        matchesTransferScope = !t.linkedTransactionId && (!t.bucketId || t.bucketId === 'INTERNAL');
                    } else if (historyTransferScope === 'LINKED') {
                        matchesTransferScope = !!t.linkedTransactionId;
                    }
                }

                return matchesSearch && matchesAccount && matchesFrom && matchesTo && matchesMainCat && matchesSubCat && matchesMin && matchesMax && matchesType && matchesTransferScope;
            })
            .sort((a, b) => b.date.localeCompare(a.date));
    }, [transactions, historySearch, historyAccountFilter, historyDateFrom, historyDateTo, historyFilterMainCat, historyFilterSubCat, historyFilterAmountMin, historyFilterAmountMax, historyTypeFilter, historyTransferScope]);

    // Paginated History
    const paginatedHistory = useMemo(() => {
        const start = historyPage * HISTORY_PAGE_SIZE;
        return filteredHistoryTransactions.slice(start, start + HISTORY_PAGE_SIZE);
    }, [filteredHistoryTransactions, historyPage]);
    
    const totalHistoryPages = Math.ceil(filteredHistoryTransactions.length / HISTORY_PAGE_SIZE);

    // Calculate latest transaction date per account
    const latestTransactionDates = useMemo(() => {
        const dates: Record<string, string> = {};
        transactions.forEach(t => {
            if (!dates[t.accountId] || t.date > dates[t.accountId]) {
                dates[t.accountId] = t.date;
            }
        });
        return dates;
    }, [transactions]);

    // Filtered transaction list for "Import" tab
    const filteredImportTransactions = useMemo(() => {
        if (!importSearch) return importedTransactions;
        const lower = importSearch.toLowerCase();
        return importedTransactions.filter(t => t.description.toLowerCase().includes(lower) || formatMoney(t.amount).includes(lower));
    }, [importedTransactions, importSearch]);

    // History Selection Logic
    const toggleHistorySelection = (id: string) => {
        const next = new Set(selectedHistoryIds);
        if (next.has(id)) next.delete(id); else next.add(id);
        setSelectedHistoryIds(next);
    };

    const selectAllHistory = () => {
        if (selectedHistoryIds.size === paginatedHistory.length) {
            setSelectedHistoryIds(new Set());
        } else {
            setSelectedHistoryIds(new Set(paginatedHistory.map(t => t.id)));
        }
    };

    const selectHistoryByType = (type: 'EXPENSE' | 'TRANSFER' | 'INCOME') => {
        const ids = paginatedHistory.filter(t => t.type === type).map(t => t.id);
        setSelectedHistoryIds(new Set(ids));
    };

    const handleBulkEdit = () => {
        // Reset form
        setBulkTargetType(undefined);
        setBulkBucketId('');
        setBulkMainCatId('');
        setBulkSubCatId('');
        setBulkDreamId('');
        setIsBulkEditOpen(true);
    };

    const handleBulkSave = async () => {
        if (!bulkTargetType) return;
        
        const updates: Promise<void>[] = [];
        const ids = Array.from(selectedHistoryIds);

        for (const id of ids) {
            const tx = transactions.find(t => t.id === id);
            if (!tx) continue;

            // Security check: Don't allow negative income
            if (bulkTargetType === 'INCOME' && tx.amount < 0) continue;

            const updateData: Partial<Transaction> = {
                type: bulkTargetType
            };

            if (bulkTargetType === 'TRANSFER') {
                updateData.bucketId = bulkBucketId || undefined;
                updateData.categoryMainId = undefined;
                updateData.categorySubId = undefined;
            } else if (bulkTargetType === 'EXPENSE') {
                updateData.bucketId = bulkDreamId || undefined; 
                if (bulkMainCatId) {
                    updateData.categoryMainId = bulkMainCatId;
                }
                if (bulkSubCatId) {
                    updateData.categorySubId = bulkSubCatId;
                }
            } else if (bulkTargetType === 'INCOME') {
                updateData.bucketId = undefined;
                if (bulkMainCatId) {
                    updateData.categoryMainId = bulkMainCatId;
                }
                updateData.categorySubId = undefined;
            }

            updates.push(updateTransaction({ ...tx, ...updateData }));
        }

        await Promise.all(updates);
        setIsBulkEditOpen(false);
        setSelectedHistoryIds(new Set());
    };

    const handleEditTransaction = (tx: Transaction) => {
        setEditingTransaction(tx);
        setEditDescription(tx.description);
        setEditDate(tx.date);
        setIsEditTransactionModalOpen(true);
    };

    const handleSaveTransactionEdit = async () => {
        if (!editingTransaction) return;
        
        const updatedTx = { ...editingTransaction };
        
        // IMPORTANT: If this is the first time we edit, ensure we save the original description
        // to originalText, so duplicate detection during import still works against the bank's text.
        if (!updatedTx.originalText) {
            updatedTx.originalText = updatedTx.description;
        }

        updatedTx.description = editDescription;

        // Date Change Logic: Keep original date for future duplicate detection
        if (editDate !== updatedTx.date) {
            if (!updatedTx.originalDate) {
                updatedTx.originalDate = updatedTx.date;
            }
            updatedTx.date = editDate;
        }

        await updateTransaction(updatedTx);
        setIsEditTransactionModalOpen(false);
    };

    const transferMatches = useTransferMatching(transactions);
    const subscriptionsRaw = useSubscriptionDetection(transactions);
    const subscriptions = useMemo(() => {
        const ignoredIds = new Set(ignoredSubscriptions.map(i => i.id));
        return subscriptionsRaw.filter(s => !ignoredIds.has(s.name));
    }, [subscriptionsRaw, ignoredSubscriptions]);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0 || !selectedAccount) return;
        try {
            const file = e.target.files[0];
            const rawTxs = await parseBankFile(file, selectedAccount);
            const processed = await runImportPipeline(rawTxs, transactions, importRules, buckets);
            setImportedTransactions(processed);
            setCurrentCardIndex(0);
        } catch (error) {
            alert("Kunde inte läsa filen. Kontrollera formatet.");
            console.error(error);
        }
    };

    const handleAiGuess = async (tx: Transaction) => {
        setIsAiLoading(true);
        const result = await categorizeTransactionsWithAi([tx], buckets, mainCategories, subCategories);
        const match = result[tx.id];
        if (match) {
            setImportedTransactions(prev => prev.map(t => {
                if (t.id !== tx.id) return t;
                return {
                    ...t,
                    bucketId: match.bucketId || t.bucketId,
                    categoryMainId: match.mainCatId || t.categoryMainId,
                    categorySubId: match.subCatId || t.categorySubId,
                    type: match.bucketId ? 'TRANSFER' : (match.mainCatId ? 'EXPENSE' : t.type),
                    matchType: 'ai',
                    aiSuggested: true
                };
            }));
        }
        setIsAiLoading(false);
    };

    const handleChange = (id: string, field: keyof Transaction, value: any) => {
        setImportedTransactions(prev => {
            const targetTx = prev.find(t => t.id === id);
            if (!targetTx) return prev;
            const updatedTx = { ...targetTx, [field]: value };
            if (field === 'type' && value === 'TRANSFER') {
                updatedTx.categoryMainId = undefined;
                updatedTx.categorySubId = undefined;
            }
            if (field === 'type' && value === 'EXPENSE') {
                updatedTx.bucketId = undefined;
            }
            if (field === 'bucketId' || field === 'categoryMainId' || field === 'categorySubId' || field === 'type') {
                 return prev.map(t => {
                     if (t.description !== targetTx.description) return t.id === id ? updatedTx : t;
                     if ((t.amount < 0) !== (targetTx.amount < 0)) return t.id === id ? updatedTx : t;
                     const isTransfer = t.type === 'TRANSFER';
                     const isExpense = t.type === 'EXPENSE';
                     const isIncome = t.type === 'INCOME';
                     const hasData = (isTransfer && !!t.bucketId) || (isExpense && !!t.categoryMainId && !!t.categorySubId) || (isIncome && !!t.categoryMainId);
                     const isSystemMatch = t.matchType === 'rule' || t.matchType === 'history';
                     const autoApproved = isSystemMatch && ((isTransfer && settings.autoApproveTransfer) || (isExpense && settings.autoApproveExpense) || (isIncome && settings.autoApproveIncome));
                     const isReady = hasData && (t.isManuallyApproved || autoApproved);
                     if (isReady || t.isVerified) return t.id === id ? updatedTx : t;
                     const propagated = { ...t, [field]: value };
                     if (field === 'type' && value === 'TRANSFER') {
                         propagated.categoryMainId = undefined;
                         propagated.categorySubId = undefined;
                     }
                     if (field === 'type' && value === 'EXPENSE') {
                         propagated.bucketId = undefined;
                     }
                     propagated.matchType = 'history';
                     return propagated;
                 });
            }
            return prev.map(t => t.id === id ? updatedTx : t);
        });
    };

    const handleUnapprove = (id: string) => {
        setImportedTransactions(prev => prev.map(t => {
            if (t.id !== id) return t;
            return { ...t, isManuallyApproved: false, matchType: undefined };
        }));
    };

    const handleCommit = async () => {
        const ready = importedTransactions.filter(t => {
            const isTransfer = t.type === 'TRANSFER';
            const isExpense = t.type === 'EXPENSE';
            const isIncome = t.type === 'INCOME';
            const hasData = (isTransfer && !!t.bucketId) || (isExpense && !!t.categoryMainId && !!t.categorySubId) || (isIncome && !!t.categoryMainId);
            const isAuto = (isTransfer && settings.autoApproveTransfer) || (isExpense && settings.autoApproveExpense) || (isIncome && settings.autoApproveIncome);
            const isSystemMatch = t.matchType === 'rule' || t.matchType === 'history';
            return hasData && (t.isManuallyApproved || (isSystemMatch && isAuto));
        });
        if (ready.length === 0) return;
        const verified = ready.map(t => ({ ...t, isVerified: true }));
        await addTransactions(verified);
        const remaining = importedTransactions.filter(t => !ready.find(r => r.id === t.id));
        setImportedTransactions(remaining);
        setCurrentCardIndex(0);
    };

    const openRuleModal = (tx: Transaction | null, existingRule?: ImportRule) => {
        if (existingRule) {
            setEditingRule(existingRule);
            setRuleKeyword(existingRule.keyword);
            setRuleMatchType(existingRule.matchType);
            setRuleSign(existingRule.sign);
            setRuleTransaction(null);
        } else if (tx) {
            setRuleTransaction(tx);
            setEditingRule(null);
            setRuleKeyword(tx.description);
            setRuleMatchType('contains');
            setRuleSign(tx.amount < 0 ? 'negative' : 'positive');
        }
        setRuleModalOpen(true);
    };

    const handleSaveRule = async () => {
        if (!ruleKeyword) return;
        const baseRule: any = {
            id: editingRule ? editingRule.id : generateId(),
            keyword: ruleKeyword,
            accountId: editingRule ? editingRule.accountId : (ruleTransaction ? ruleTransaction.accountId : undefined),
            matchType: ruleMatchType,
            sign: ruleSign
        };
        if (editingRule) {
             baseRule.targetType = editingRule.targetType;
             baseRule.targetBucketId = editingRule.targetBucketId;
             baseRule.targetCategoryMainId = editingRule.targetCategoryMainId;
             baseRule.targetCategorySubId = editingRule.targetCategorySubId;
        } else if (ruleTransaction) {
             baseRule.targetType = ruleTransaction.type;
             baseRule.targetBucketId = ruleTransaction.bucketId;
             baseRule.targetCategoryMainId = ruleTransaction.categoryMainId;
             baseRule.targetCategorySubId = ruleTransaction.categorySubId;
        }
        if (editingRule) {
            await updateImportRule(baseRule);
        } else {
            await addImportRule(baseRule);
        }
        setRuleModalOpen(false);
        if (!editingRule && ruleTransaction) {
            const reProcessed = await runImportPipeline(importedTransactions, transactions, [...importRules, baseRule], buckets);
            setImportedTransactions(reProcessed);
        }
    };
    
    const handleDeleteRule = async (id: string) => {
        if (confirm("Är du säker på att du vill ta bort denna regel?")) {
            await deleteImportRule(id);
        }
    };

    const handleLinkTransactions = async (t1: Transaction, t2: Transaction) => {
        // Find other matches that are identical in description and amount to the selected pair
        const similarMatches = transferMatches.filter(m => 
            m.from.description === t1.description &&
            m.to.description === t2.description &&
            m.from.amount === t1.amount
        );

        const targets = similarMatches.length > 0 ? similarMatches : [{ from: t1, to: t2 }];
        const updates: Promise<void>[] = [];

        targets.forEach(match => {
             updates.push(updateTransaction({ ...match.from, type: 'TRANSFER', linkedTransactionId: match.to.id, isVerified: true, categoryMainId: undefined, categorySubId: undefined, bucketId: 'INTERNAL' }));
             updates.push(updateTransaction({ ...match.to, type: 'TRANSFER', linkedTransactionId: match.from.id, isVerified: true, categoryMainId: undefined, categorySubId: undefined, bucketId: 'INTERNAL' }));
        });

        await Promise.all(updates);
        
        if (targets.length > 1) {
             alert(`Kopplade ${targets.length} liknande par av överföringar automatiskt.`);
        }
    };

    const handleCreateSubscription = async (sub: any) => {
        const newBucket: Bucket = {
            id: generateId(),
            accountId: sub.accountId,
            name: sub.name,
            type: 'FIXED',
            isSavings: false,
            monthlyData: {
                [format(new Date(), 'yyyy-MM')]: { amount: sub.avgAmount, dailyAmount: 0, activeDays: [] }
            },
            targetAmount: 0,
            targetDate: '',
            startSavingDate: ''
        };
        await addBucket(newBucket);
        alert(`Skapade fast utgift för ${sub.name}!`);
    };

    const handleIgnoreSubscription = async (name: string) => {
        if (confirm(`Är du säker på att du vill ignorera "${name}" från prenumerationslistan? Detta val sparas.`)) {
            await addIgnoredSubscription(name);
        }
    };

    const setDateFilterByMonth = (monthKey: string) => {
        const { start, end } = getBudgetInterval(monthKey, settings.payday);
        setHistoryDateFrom(format(start, 'yyyy-MM-dd'));
        setHistoryDateTo(format(end, 'yyyy-MM-dd'));
        setHistoryPage(0);
    };

    const isBudgeted = (name: string) => buckets.some(b => b.name.toLowerCase() === name.toLowerCase());

    return (
        <div className="space-y-6 pb-24 animate-in slide-in-from-right duration-300">
            <header className="flex flex-col gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">Transaktioner</h1>
                    <p className="text-slate-400">Importera från bank eller granska historik</p>
                </div>
                
                <div className="w-full flex flex-col gap-2">
                     <div className="flex bg-slate-800 p-1 rounded-lg w-full">
                        <button onClick={() => setViewMode('import')} className={cn("flex-1 px-4 py-2 rounded text-sm font-medium transition-all", viewMode === 'import' ? "bg-blue-600 text-white shadow" : "text-slate-400 hover:text-white")}>Importera</button>
                        <button onClick={() => setViewMode('history')} className={cn("flex-1 px-4 py-2 rounded text-sm font-medium transition-all", viewMode === 'history' ? "bg-blue-600 text-white shadow" : "text-slate-400 hover:text-white")}>Historik</button>
                        <button onClick={() => setViewMode('rules')} className={cn("flex-1 px-4 py-2 rounded text-sm font-medium transition-all", viewMode === 'rules' ? "bg-blue-600 text-white shadow" : "text-slate-400 hover:text-white")}>Regler</button>
                    </div>
                    
                    <div className="flex bg-slate-800 p-1 rounded-lg w-full gap-1">
                        <button onClick={() => setViewMode('smart-transfers')} className={cn("flex-1 px-4 py-2 rounded text-sm font-medium flex items-center justify-center gap-2", viewMode === 'smart-transfers' ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white")}>
                            <Sparkles size={14} /> Smarta Överföringar {transferMatches.length > 0 && <span className="bg-indigo-500 text-white text-[10px] px-1.5 rounded-full">{transferMatches.length}</span>}
                        </button>
                        <button onClick={() => setViewMode('subscriptions')} className={cn("flex-1 px-4 py-2 rounded text-sm font-medium flex items-center justify-center gap-2", viewMode === 'subscriptions' ? "bg-pink-600 text-white" : "text-slate-400 hover:text-white")}>
                            <CalendarClock size={14} /> Prenumerationer {subscriptions.length > 0 && <span className="bg-pink-500 text-white text-[10px] px-1.5 rounded-full">{subscriptions.length}</span>}
                        </button>
                    </div>
                </div>
            </header>

            {viewMode === 'import' && (
                <div className="space-y-4">
                    {importedTransactions.length === 0 ? (
                        <div className="bg-slate-800/50 border-2 border-dashed border-slate-700 rounded-2xl p-8 flex flex-col items-center justify-center text-center space-y-4">
                            <div className="bg-slate-800 p-4 rounded-full">
                                <Upload className="w-8 h-8 text-blue-400" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-white">Ladda upp fil</h3>
                                <p className="text-sm text-slate-400 mt-1">Stödjer CSV och Excel från din bank</p>
                            </div>
                            <select className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white w-64" value={selectedAccount} onChange={(e) => setSelectedAccount(e.target.value)}>
                                <option value="">Välj konto...</option>
                                {accounts.map(acc => {
                                    const lastDate = latestTransactionDates[acc.id];
                                    return (
                                        <option key={acc.id} value={acc.id}>
                                            {acc.icon} {acc.name} {lastDate ? `(${lastDate})` : ''}
                                        </option>
                                    );
                                })}
                            </select>
                            <Button onClick={() => fileInputRef.current?.click()} disabled={!selectedAccount} className="w-64">Välj fil</Button>
                            <input type="file" ref={fileInputRef} className="hidden" accept=".csv,.xlsx,.xls" onChange={handleFileUpload} />
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex flex-col gap-2">
                                <div className="flex gap-2">
                                    <div className="flex-1 bg-slate-900 rounded-lg flex items-center px-3 border border-slate-700">
                                        <Search size={16} className="text-slate-400 mr-2" />
                                        <input placeholder="Sök transaktion..." className="bg-transparent border-none outline-none text-white text-sm w-full py-2 placeholder-slate-500" value={importSearch} onChange={(e) => setImportSearch(e.target.value)} />
                                        {importSearch && <button onClick={() => setImportSearch('')}><X size={14} className="text-slate-400"/></button>}
                                    </div>
                                    <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-700 shrink-0">
                                        <button onClick={() => setViewFormat('list')} className={cn("p-1.5 rounded transition-colors", viewFormat === 'list' ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white")} title="Lista"><LayoutList size={18} /></button>
                                        <button onClick={() => setViewFormat('cards')} className={cn("p-1.5 rounded transition-colors", viewFormat === 'cards' ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white")} title="Kort (Swipe)"><Smartphone size={18} /></button>
                                    </div>
                                </div>
                                <div className="flex justify-between items-center">
                                    <div className="text-sm text-slate-400">Visar {filteredImportTransactions.length} av {importedTransactions.length}</div>
                                    <div className="flex gap-2">
                                        <Button variant="danger" onClick={() => { setImportedTransactions([]); setImportSearch(''); }} className="px-3 py-1.5 text-xs">Rensa</Button>
                                        <Button variant="primary" onClick={handleCommit} className="px-3 py-1.5 text-xs">Bokför ({importedTransactions.filter(t => t.isManuallyApproved || ((t.matchType === 'rule' || t.matchType === 'history') && ((t.type === 'TRANSFER' && settings.autoApproveTransfer) || (t.type === 'EXPENSE' && settings.autoApproveExpense)))).length})</Button>
                                    </div>
                                </div>
                            </div>
                            {viewFormat === 'list' && (
                                <div className="space-y-2">
                                    {filteredImportTransactions.map((tx) => (
                                        <TransactionRow key={tx.id} tx={tx} buckets={buckets} mainCategories={mainCategories} subCategories={subCategories} settings={settings} onChange={handleChange} onUnapprove={handleUnapprove} onCreateRule={(t) => openRuleModal(t)} onAiGuess={handleAiGuess} isAiLoading={isAiLoading} />
                                    ))}
                                    {filteredImportTransactions.length === 0 && <div className="text-center py-10 text-slate-500">Inga transaktioner matchade sökningen.</div>}
                                </div>
                            )}
                            {viewFormat === 'cards' && (
                                <div className="relative h-[600px] w-full max-w-md mx-auto">
                                    {filteredImportTransactions.length > 0 ? (
                                        <TransactionCard tx={filteredImportTransactions[currentCardIndex]} buckets={buckets} mainCategories={mainCategories} subCategories={subCategories} settings={settings} accounts={accounts} onChange={handleChange} onApprove={(id) => handleChange(id, 'isManuallyApproved', true)} onNext={() => setCurrentCardIndex(prev => Math.min(prev + 1, filteredImportTransactions.length - 1))} onPrev={() => setCurrentCardIndex(prev => Math.max(prev - 1, 0))} isFirst={currentCardIndex === 0} isLast={currentCardIndex === filteredImportTransactions.length - 1} />
                                    ) : (
                                        <div className="text-center py-10 text-slate-500">Inga transaktioner att visa.</div>
                                    )}
                                    <div className="text-center mt-4 text-sm text-slate-400">Kort {currentCardIndex + 1} av {filteredImportTransactions.length}</div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {viewMode === 'history' && (
                 <div className="space-y-4">
                     
                     {/* --- DATE FILTER SECTION --- */}
                     <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-700 flex flex-col gap-2">
                         <div className="flex gap-2 text-xs overflow-x-auto no-scrollbar pb-1">
                             <button 
                                onClick={() => setDateFilterByMonth(selectedMonth)}
                                className="px-3 py-1.5 bg-blue-600/20 text-blue-300 border border-blue-500/30 rounded-full whitespace-nowrap hover:bg-blue-600/30"
                             >
                                 Nuvarande budgetmånad
                             </button>
                             <button 
                                onClick={() => setDateFilterByMonth(format(subMonths(new Date(`${selectedMonth}-01`), 1), 'yyyy-MM'))}
                                className="px-3 py-1.5 bg-slate-700/50 text-slate-400 border border-slate-600 rounded-full whitespace-nowrap hover:bg-slate-700"
                             >
                                 Föregående budgetmånad
                             </button>
                             <button 
                                onClick={() => { setHistoryDateFrom(''); setHistoryDateTo(''); }}
                                className="px-3 py-1.5 bg-slate-700/50 text-slate-400 border border-slate-600 rounded-full whitespace-nowrap hover:bg-slate-700"
                             >
                                 Visa allt
                             </button>
                         </div>
                         <div className="flex gap-2 items-center">
                             <div className="flex-1">
                                 <label className="text-[10px] text-slate-500 uppercase font-bold mb-1 block">Från</label>
                                 <input 
                                    type="date" 
                                    className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-xs text-white" 
                                    value={historyDateFrom} 
                                    onChange={(e) => setHistoryDateFrom(e.target.value)} 
                                 />
                             </div>
                             <div className="flex-1">
                                 <label className="text-[10px] text-slate-500 uppercase font-bold mb-1 block">Till</label>
                                 <input 
                                    type="date" 
                                    className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-xs text-white" 
                                    value={historyDateTo} 
                                    onChange={(e) => setHistoryDateTo(e.target.value)} 
                                 />
                             </div>
                         </div>
                     </div>

                     {/* --- NEW: TYPE FILTER & SEARCH --- */}
                     <div className="flex flex-col gap-3">
                         
                         {/* Filter Buttons */}
                         <div className="flex bg-slate-900 p-1 rounded-lg w-full overflow-x-auto no-scrollbar">
                             <button onClick={() => setHistoryTypeFilter('ALL')} className={cn("flex-1 px-3 py-2 rounded text-xs font-bold whitespace-nowrap transition-all", historyTypeFilter === 'ALL' ? "bg-slate-700 text-white shadow" : "text-slate-400 hover:text-white")}>Alla</button>
                             <button onClick={() => setHistoryTypeFilter('EXPENSE')} className={cn("flex-1 px-3 py-2 rounded text-xs font-bold whitespace-nowrap transition-all", historyTypeFilter === 'EXPENSE' ? "bg-rose-600 text-white shadow" : "text-slate-400 hover:text-white")}>Utgifter</button>
                             <button onClick={() => setHistoryTypeFilter('TRANSFER')} className={cn("flex-1 px-3 py-2 rounded text-xs font-bold whitespace-nowrap transition-all", historyTypeFilter === 'TRANSFER' ? "bg-blue-600 text-white shadow" : "text-slate-400 hover:text-white")}>Överföringar</button>
                             <button onClick={() => setHistoryTypeFilter('INCOME')} className={cn("flex-1 px-3 py-2 rounded text-xs font-bold whitespace-nowrap transition-all", historyTypeFilter === 'INCOME' ? "bg-emerald-600 text-white shadow" : "text-slate-400 hover:text-white")}>Inkomst</button>
                         </div>

                         {/* Sub-filter for Transfers */}
                         {historyTypeFilter === 'TRANSFER' && (
                             <div className="flex gap-2 animate-in slide-in-from-top-2">
                                  <button 
                                     onClick={() => setHistoryTransferScope('ALL')}
                                     className={cn("px-3 py-1.5 rounded-full text-xs font-bold border transition-colors", 
                                        historyTransferScope === 'ALL' ? "bg-blue-500/20 border-blue-500 text-blue-300" : "bg-slate-800 border-slate-700 text-slate-400"
                                     )}
                                  >
                                      Alla Överföringar
                                  </button>
                                  <button 
                                     onClick={() => setHistoryTransferScope('UNLINKED')}
                                     className={cn("px-3 py-1.5 rounded-full text-xs font-bold border transition-colors flex items-center gap-1", 
                                        historyTransferScope === 'UNLINKED' ? "bg-orange-500/20 border-orange-500 text-orange-300" : "bg-slate-800 border-slate-700 text-slate-400"
                                     )}
                                  >
                                      <Unlink size={12} /> Utan koppling
                                  </button>
                                  <button 
                                     onClick={() => setHistoryTransferScope('LINKED')}
                                     className={cn("px-3 py-1.5 rounded-full text-xs font-bold border transition-colors flex items-center gap-1", 
                                        historyTransferScope === 'LINKED' ? "bg-indigo-500/20 border-indigo-500 text-indigo-300" : "bg-slate-800 border-slate-700 text-slate-400"
                                     )}
                                  >
                                      <Link2 size={12} /> Kopplade
                                  </button>
                             </div>
                         )}

                         <div className="flex gap-2">
                             <div className="bg-slate-900 rounded-lg flex items-center px-3 border border-slate-700 flex-[2]">
                                <Search size={16} className="text-slate-400 mr-2" />
                                <input placeholder="Sök i historik..." className="bg-transparent border-none outline-none text-white text-sm w-full py-2 placeholder-slate-500" value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} />
                                {historySearch && <button onClick={() => setHistorySearch('')}><X size={14} className="text-slate-400"/></button>}
                             </div>
                             <div className="bg-slate-900 rounded-lg flex items-center px-2 border border-slate-700 flex-1">
                                <Filter size={16} className="text-slate-400 mr-2" />
                                <select className="bg-transparent border-none outline-none text-white text-sm w-full py-2 cursor-pointer" value={historyAccountFilter} onChange={(e) => setHistoryAccountFilter(e.target.value)}>
                                    <option value="">Konto</option>
                                    {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                                </select>
                             </div>
                         </div>

                         {/* Advanced Filters */}
                         <div className="bg-slate-900/50 p-2 rounded-lg border border-slate-700 grid grid-cols-2 gap-2">
                             <select className="bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-xs text-white outline-none" value={historyFilterMainCat} onChange={(e) => setHistoryFilterMainCat(e.target.value)}>
                                 <option value="">Alla Kategorier</option>
                                 <option value="__UNCAT__">Odefinierad (Okategoriserad)</option>
                                 {mainCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                             </select>
                             <select className="bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-xs text-white outline-none" value={historyFilterSubCat} onChange={(e) => setHistoryFilterSubCat(e.target.value)}>
                                 <option value="">Alla Underkategorier</option>
                                 <option value="__UNCAT__">Odefinierad (Okategoriserad)</option>
                                 {subCategories.filter(s => !historyFilterMainCat || s.mainCategoryId === historyFilterMainCat).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                             </select>
                             <input type="number" placeholder="Min Belopp" className="bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-xs text-white outline-none" value={historyFilterAmountMin} onChange={(e) => setHistoryFilterAmountMin(e.target.value)} />
                             <input type="number" placeholder="Max Belopp" className="bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-xs text-white outline-none" value={historyFilterAmountMax} onChange={(e) => setHistoryFilterAmountMax(e.target.value)} />
                         </div>
                     </div>

                     {/* Bulk Selection Actions */}
                     <div className="bg-slate-800/80 p-2 rounded-lg border border-slate-700 flex flex-wrap gap-2 items-center text-xs">
                         <button onClick={selectAllHistory} className="flex items-center gap-1.5 px-3 py-1.5 rounded hover:bg-slate-700 text-slate-300 transition-colors">
                             {selectedHistoryIds.size === paginatedHistory.length && paginatedHistory.length > 0 ? <CheckSquare size={14} className="text-blue-400" /> : <Square size={14} />}
                             <span>Välj alla på sidan</span>
                         </button>
                         <div className="w-px h-4 bg-slate-700 mx-1" />
                         <span className="text-slate-500 font-medium mr-1">Snabbval:</span>
                         <button onClick={() => selectHistoryByType('EXPENSE')} className="px-2 py-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors">Utgifter</button>
                         <button onClick={() => selectHistoryByType('TRANSFER')} className="px-2 py-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors">Överföringar</button>
                         <button onClick={() => selectHistoryByType('INCOME')} className="px-2 py-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors">Inkomster</button>
                     </div>
                    
                    {/* Floating Action Button for Bulk Edit */}
                    {selectedHistoryIds.size > 0 && (
                        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 fade-in">
                            <div className="bg-blue-600 text-white shadow-xl rounded-full px-6 py-3 flex items-center gap-4 border border-blue-400">
                                <span className="font-bold text-sm whitespace-nowrap">{selectedHistoryIds.size} valda</span>
                                <button onClick={handleBulkEdit} className="flex items-center gap-2 bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-full transition-colors font-medium text-xs">
                                    <Edit2 size={14} /> Redigera
                                </button>
                                <button onClick={() => setSelectedHistoryIds(new Set())} className="hover:text-blue-200"><X size={16}/></button>
                            </div>
                        </div>
                    )}

                     <div className="space-y-2">
                         {paginatedHistory.map(tx => {
                             const isSelected = selectedHistoryIds.has(tx.id);
                             const account = accounts.find(a => a.id === tx.accountId);
                             const linkedGoal = buckets.find(b => b.id === tx.bucketId && b.type === 'GOAL');
                             
                             let categoryLabel = '';
                             if (tx.type === 'EXPENSE') {
                                 const main = mainCategories.find(c => c.id === tx.categoryMainId)?.name;
                                 const sub = subCategories.find(c => c.id === tx.categorySubId)?.name;
                                 categoryLabel = main ? `${main} ${sub ? '/ ' + sub : ''}` : 'Okategoriserad';
                             } else if (tx.type === 'TRANSFER') {
                                 if (tx.bucketId === 'INTERNAL') categoryLabel = 'Intern Överföring';
                                 else if (tx.bucketId === 'PAYOUT') categoryLabel = 'Utbetalning';
                                 else categoryLabel = buckets.find(b => b.id === tx.bucketId)?.name || 'Okänd budgetpost';
                             } else if (tx.type === 'INCOME') {
                                 categoryLabel = mainCategories.find(c => c.id === tx.categoryMainId)?.name || 'Inkomst';
                             }

                             return (
                                 <div 
                                    key={tx.id} 
                                    className={cn(
                                        "bg-slate-800 p-3 rounded-lg border flex gap-3 items-start transition-all cursor-pointer group",
                                        isSelected ? "border-blue-500 bg-blue-900/10" : "border-slate-700 hover:bg-slate-700/50"
                                    )}
                                    onClick={() => toggleHistorySelection(tx.id)}
                                 >
                                     <div className="pt-1 text-slate-400 group-hover:text-white transition-colors">
                                         {isSelected ? <CheckSquare size={18} className="text-blue-500" /> : <Square size={18} />}
                                     </div>
                                     
                                     <div className="flex-1 min-w-0">
                                         <div className="flex justify-between items-start">
                                             <div className="text-white font-medium truncate pr-2 group flex items-center gap-2">
                                                {tx.description}
                                                {/* --- NEW: Edit Button --- */}
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); handleEditTransaction(tx); }}
                                                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-white transition-opacity bg-slate-700/50 rounded"
                                                    title="Redigera namn och detaljer"
                                                >
                                                    <Edit2 size={10} />
                                                </button>
                                             </div>
                                             <div className="font-mono font-bold text-white whitespace-nowrap">{formatMoney(tx.amount)}</div>
                                         </div>
                                         
                                         <div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                                             <span>{tx.date}</span>
                                             <span>•</span>
                                             <span className="flex items-center gap-0.5">{account?.icon} {account?.name}</span>
                                         </div>
                                         
                                         <div className="flex flex-wrap gap-2 mt-2">
                                             <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-bold uppercase", 
                                                 tx.type === 'EXPENSE' ? "bg-rose-950 text-rose-300 border border-rose-900" : 
                                                 (tx.type === 'TRANSFER' ? "bg-blue-950 text-blue-300 border border-blue-900" : "bg-emerald-950 text-emerald-300 border border-emerald-900")
                                             )}>
                                                 {tx.type === 'EXPENSE' ? 'Utgift' : (tx.type === 'TRANSFER' ? 'Överföring' : 'Inkomst')}
                                             </span>
                                             
                                             <span className="text-[10px] bg-slate-900 text-slate-300 px-1.5 py-0.5 rounded border border-slate-700 truncate max-w-[150px]">
                                                 {categoryLabel}
                                             </span>
                                             
                                             {tx.linkedTransactionId && (
                                                 <span className="text-[10px] bg-indigo-900/50 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-900 flex items-center gap-1">
                                                     <Link2 size={8} /> Kopplad
                                                 </span>
                                             )}

                                             {linkedGoal && (
                                                 <span className="text-[10px] bg-purple-900/50 text-purple-300 px-1.5 py-0.5 rounded border border-purple-900 flex items-center gap-1">
                                                     <Plane size={8} /> {linkedGoal.name}
                                                 </span>
                                             )}
                                             
                                             {!tx.linkedTransactionId && !tx.bucketId && tx.type === 'TRANSFER' && (
                                                  <span className="text-[10px] bg-orange-900/30 text-orange-400 px-1.5 py-0.5 rounded border border-orange-500/30 flex items-center gap-1">
                                                     <AlertTriangle size={8} /> Okopplad
                                                 </span>
                                             )}
                                         </div>
                                     </div>
                                 </div>
                             );
                         })}
                         {filteredHistoryTransactions.length === 0 && (
                             <div className="text-center text-slate-500 py-10">Ingen historik matchade filtret.</div>
                         )}
                     </div>

                     {/* PAGINATION CONTROLS */}
                     {filteredHistoryTransactions.length > HISTORY_PAGE_SIZE && (
                         <div className="flex justify-center items-center gap-4 pt-4">
                             <Button 
                                variant="secondary" 
                                disabled={historyPage === 0} 
                                onClick={() => setHistoryPage(p => p - 1)}
                                className="px-4 py-2"
                             >
                                 Föregående
                             </Button>
                             <span className="text-sm text-slate-400">
                                 Sida {historyPage + 1} av {totalHistoryPages}
                             </span>
                             <Button 
                                variant="secondary" 
                                disabled={historyPage >= totalHistoryPages - 1} 
                                onClick={() => setHistoryPage(p => p + 1)}
                                className="px-4 py-2"
                             >
                                 Nästa
                             </Button>
                         </div>
                     )}
                 </div>
            )}

            {viewMode === 'smart-transfers' && (
                <div className="space-y-4">
                    {transferMatches.length === 0 ? (
                        <div className="text-center text-slate-500 py-10">Inga matchande överföringar hittades just nu.</div>
                    ) : (
                        transferMatches.map((match, idx) => (
                            <div key={idx} className="bg-slate-800/50 border border-indigo-500/30 rounded-xl p-4 flex flex-col md:flex-row items-center gap-4 animate-in fade-in">
                                <div className="flex-1 bg-slate-900/50 p-3 rounded-lg border border-slate-700 w-full opacity-75">
                                    <div className="text-xs text-slate-400 mb-1">{match.from.date} • {accounts.find(a => a.id === match.from.accountId)?.name}</div>
                                    <div className="font-bold text-white">{match.from.description}</div>
                                    <div className="text-rose-400 font-mono font-bold">{formatMoney(match.from.amount)}</div>
                                </div>
                                <div className="flex flex-col items-center text-indigo-400">
                                    <ArrowRightLeft size={24} />
                                    <span className="text-[10px] uppercase font-bold mt-1">Matchar?</span>
                                </div>
                                <div className="flex-1 bg-slate-900/50 p-3 rounded-lg border border-slate-700 w-full opacity-75">
                                    <div className="text-xs text-slate-400 mb-1">{match.to.date} • {accounts.find(a => a.id === match.to.accountId)?.name}</div>
                                    <div className="font-bold text-white">{match.to.description}</div>
                                    <div className="text-emerald-400 font-mono font-bold">+{formatMoney(Math.abs(match.to.amount))}</div>
                                </div>
                                <div className="flex flex-row md:flex-col gap-2 min-w-[120px]">
                                    <Button onClick={() => handleLinkTransactions(match.from, match.to)} className="bg-indigo-600 hover:bg-indigo-500 text-white w-full">
                                        <Link2 size={16} className="mr-2" /> Koppla
                                    </Button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}

            {viewMode === 'subscriptions' && (
                <div className="space-y-6 animate-in fade-in">
                    <div className="bg-gradient-to-br from-pink-900/40 to-slate-900 border border-pink-500/30 p-5 rounded-2xl flex justify-between items-center">
                        <div>
                            <h3 className="text-pink-300 font-bold uppercase text-xs tracking-wider mb-1">Månatliga Fasta Utgifter</h3>
                            <p className="text-2xl font-mono font-bold text-white">
                                {formatMoney(subscriptions.reduce((sum, s) => sum + s.avgAmount, 0))}
                                <span className="text-sm text-slate-400 font-sans font-normal"> / mån (uppskattat)</span>
                            </p>
                        </div>
                        <div className="h-10 w-10 bg-pink-500/20 rounded-full flex items-center justify-center">
                            <CalendarClock className="text-pink-400" />
                        </div>
                    </div>
                    <div className="space-y-3">
                        {subscriptions.map((sub) => {
                            const alreadyAdded = isBudgeted(sub.name);
                            return (
                                <div key={sub.id} className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 flex justify-between items-center hover:bg-slate-800 transition-colors group">
                                    <div className="flex items-center gap-4">
                                        <div className="h-10 w-10 rounded-full bg-slate-700 flex items-center justify-center text-lg font-bold text-slate-300">{sub.name.charAt(0).toUpperCase()}</div>
                                        <div>
                                            <div className="font-bold text-white flex items-center gap-2">
                                                {sub.name}
                                                {alreadyAdded && <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full flex items-center gap-1"><CheckCircle2 size={10}/> Budgeterad</span>}
                                                {sub.confidence === 'medium' && <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full flex items-center gap-1" title="Varierande belopp men återkommande datum">⚠️ Varierande</span>}
                                            </div>
                                            <div className="text-xs text-slate-400 mt-0.5">{sub.frequency === 'monthly' ? 'Månadsvis' : 'Återkommande'} • {sub.occurrences} betalningar hittade</div>
                                            <div className="text-xs text-slate-500 mt-0.5">Senast: {sub.lastDate}</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="flex flex-col items-end gap-2">
                                            <span className="font-mono font-bold text-white text-lg">{formatMoney(sub.avgAmount)}</span>
                                            {!alreadyAdded ? (
                                                <button onClick={() => handleCreateSubscription(sub)} className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors">
                                                    <PlusCircle size={14} /> Skapa Budgetpost
                                                </button>
                                            ) : (
                                                <span className="text-xs text-slate-500 italic">Redan tillagd</span>
                                            )}
                                        </div>
                                        <button onClick={() => handleIgnoreSubscription(sub.name)} className="p-2 text-slate-600 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity" title="Dölj detta förslag permanent">
                                            <X size={16} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                        {subscriptions.length === 0 && <div className="text-center text-slate-500 py-10">Inga prenumerationer hittades.</div>}
                    </div>
                </div>
            )}

            {viewMode === 'rules' && (
                <div className="space-y-4">
                    <div className="space-y-2">
                        {importRules.map(rule => {
                            const account = accounts.find(a => a.id === rule.accountId);
                            return (
                                <div key={rule.id} className="bg-slate-800 p-3 rounded-lg border border-slate-700 flex justify-between items-center group">
                                    <div className="flex items-center gap-3">
                                        {rule.sign && (
                                            <div className={cn("w-6 h-6 rounded flex items-center justify-center text-xs font-bold", rule.sign === 'negative' ? "bg-rose-500/20 text-rose-400" : "bg-emerald-500/20 text-emerald-400")}>
                                                {rule.sign === 'negative' ? '-' : '+'}
                                            </div>
                                        )}
                                        <div>
                                            <div className="font-bold text-white flex items-center gap-2">
                                                {rule.keyword}
                                                <span className="text-[10px] bg-slate-700 text-slate-300 px-1.5 rounded">{rule.matchType}</span>
                                                {rule.accountId && <span className="text-[10px] bg-blue-900 text-blue-300 px-1.5 rounded flex items-center gap-1">{accounts.find(a => a.id === rule.accountId)?.icon} {accounts.find(a => a.id === rule.accountId)?.name}</span>}
                                            </div>
                                            <div className="text-xs text-slate-400">
                                                {rule.targetType === 'TRANSFER' 
                                                    ? `Överföring till ${buckets.find(b => b.id === rule.targetBucketId)?.name || 'Okänd'}` 
                                                    : `Utgift: ${mainCategories.find(c => c.id === rule.targetCategoryMainId)?.name || 'Okänd'} ${rule.targetCategorySubId ? ' / ' + (subCategories.find(s => s.id === rule.targetCategorySubId)?.name || 'Okänd') : ''}`
                                                }
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => openRuleModal(null, rule)} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded"><Edit2 size={14} /></button>
                                        <button onClick={() => handleDeleteRule(rule.id)} className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded"><Trash2 size={14} /></button>
                                    </div>
                                </div>
                            );
                        })}
                        {importRules.length === 0 && <div className="text-center text-slate-500 py-10">Inga regler skapade än.</div>}
                    </div>
                    <Button variant="secondary" onClick={() => { setEditingRule(null); setRuleTransaction(null); setRuleKeyword(''); setRuleModalOpen(true); }} className="w-full">
                        <Plus className="w-4 h-4 mr-2" /> Skapa ny regel manuellt
                    </Button>
                </div>
            )}

            {/* RULE MODAL */}
            <Modal isOpen={ruleModalOpen} onClose={() => setRuleModalOpen(false)} title={editingRule ? "Redigera Regel" : "Skapa Ny Regel"}>
                <div className="space-y-4">
                    <Input label="Nyckelord / Text" value={ruleKeyword} onChange={(e) => setRuleKeyword(e.target.value)} />
                    <div>
                        <label className="text-xs font-medium text-slate-400 uppercase tracking-wider block mb-1">Matchningstyp</label>
                        <div className="flex bg-slate-900 rounded-lg p-1">
                            <button onClick={() => setRuleMatchType('contains')} className={cn("flex-1 text-xs py-2 rounded transition-all", ruleMatchType === 'contains' ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white")}>Innehåller</button>
                            <button onClick={() => setRuleMatchType('starts_with')} className={cn("flex-1 text-xs py-2 rounded transition-all", ruleMatchType === 'starts_with' ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white")}>Börjar med</button>
                            <button onClick={() => setRuleMatchType('exact')} className={cn("flex-1 text-xs py-2 rounded transition-all", ruleMatchType === 'exact' ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white")}>Exakt</button>
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-medium text-slate-400 uppercase tracking-wider block mb-1">Gäller för tecken</label>
                        <div className="flex bg-slate-900 rounded-lg p-1">
                            <button onClick={() => setRuleSign('negative')} className={cn("flex-1 text-xs py-2 rounded transition-all", ruleSign === 'negative' ? "bg-rose-600 text-white" : "text-slate-400 hover:text-white")}>Utgifter (-)</button>
                            <button onClick={() => setRuleSign('positive')} className={cn("flex-1 text-xs py-2 rounded transition-all", ruleSign === 'positive' ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-white")}>Inkomster (+)</button>
                            <button onClick={() => setRuleSign(undefined)} className={cn("flex-1 text-xs py-2 rounded transition-all", !ruleSign ? "bg-slate-600 text-white" : "text-slate-400 hover:text-white")}>Båda</button>
                        </div>
                    </div>
                    {ruleTransaction && (
                        <div className="bg-slate-800 p-3 rounded-lg text-xs text-slate-300">Baserat på: <span className="font-bold text-white">{ruleTransaction.description}</span></div>
                    )}
                    <Button onClick={handleSaveRule} disabled={!ruleKeyword} className="w-full">Spara Regel</Button>
                </div>
            </Modal>

            {/* BULK EDIT MODAL */}
            <Modal isOpen={isBulkEditOpen} onClose={() => setIsBulkEditOpen(false)} title={`Redigera ${selectedHistoryIds.size} transaktioner`}>
                <div className="space-y-6">
                    <div>
                        <label className="text-xs font-medium text-slate-400 uppercase tracking-wider block mb-1">Ny Typ</label>
                        <div className="flex bg-slate-900 rounded-lg p-1 w-full">
                            <button onClick={() => setBulkTargetType('EXPENSE')} className={cn("flex-1 py-2 rounded text-xs font-bold transition-all", bulkTargetType === 'EXPENSE' ? "bg-rose-600 text-white" : "text-slate-400 hover:text-white")}>
                                <ShoppingCart size={14} className="mx-auto mb-1"/> Utgift
                            </button>
                            <button onClick={() => setBulkTargetType('TRANSFER')} className={cn("flex-1 py-2 rounded text-xs font-bold transition-all", bulkTargetType === 'TRANSFER' ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white")}>
                                <ArrowRightLeft size={14} className="mx-auto mb-1"/> Överföring
                            </button>
                            <button onClick={() => setBulkTargetType('INCOME')} disabled={Array.from(selectedHistoryIds).some(id => { const t = transactions.find(tx => tx.id === id); return t && t.amount < 0; })} className={cn("flex-1 py-2 rounded text-xs font-bold transition-all disabled:opacity-20 disabled:cursor-not-allowed", bulkTargetType === 'INCOME' ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-white")} title="Endast positiva belopp kan vara inkomst">
                                <ArrowDownLeft size={14} className="mx-auto mb-1"/> Inkomst
                            </button>
                        </div>
                    </div>

                    <div className="space-y-3">
                         {bulkTargetType === 'TRANSFER' && (
                             <div>
                                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider block mb-1">Ny Budgetpost</label>
                                <select className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-blue-500 outline-none" value={bulkBucketId} onChange={(e) => setBulkBucketId(e.target.value)}>
                                    <option value="">-- Behåll nuvarande (om möjligt) --</option>
                                    <option value="INTERNAL">Intern Överföring</option>
                                    <option value="PAYOUT">Utbetalning</option>
                                    <optgroup label="Budgetposter">
                                        {buckets.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                    </optgroup>
                                </select>
                             </div>
                         )}

                         {bulkTargetType === 'EXPENSE' && (
                             <div className="space-y-3">
                                <div>
                                    <label className="text-xs font-medium text-slate-400 uppercase tracking-wider block mb-1">Ny Huvudkategori</label>
                                    <select className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-blue-500 outline-none" value={bulkMainCatId} onChange={(e) => setBulkMainCatId(e.target.value)}>
                                        <option value="">-- Behåll nuvarande --</option>
                                        {mainCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-slate-400 uppercase tracking-wider block mb-1">Ny Underkategori</label>
                                    <select className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-blue-500 outline-none disabled:opacity-50" value={bulkSubCatId} onChange={(e) => setBulkSubCatId(e.target.value)} disabled={!bulkMainCatId}>
                                        <option value="">-- Välj Specifikt --</option>
                                        {subCategories.filter(s => s.mainCategoryId === bulkMainCatId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                </div>
                                <div className="border-t border-slate-700 pt-3 mt-3">
                                    <label className="text-xs font-medium text-purple-400 uppercase tracking-wider block mb-1 flex items-center gap-1"><Plane size={12}/> Koppla till Dröm/Resa (Valfritt)</label>
                                    <select className="w-full bg-slate-900 border border-purple-500/30 rounded-xl px-4 py-3 text-white focus:border-purple-500 outline-none" value={bulkDreamId} onChange={(e) => setBulkDreamId(e.target.value)}>
                                        <option value="">-- Ingen koppling --</option>
                                        {buckets.filter(b => b.type === 'GOAL' && !b.archivedDate).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                    </select>
                                </div>
                             </div>
                         )}

                        {bulkTargetType === 'INCOME' && (
                             <div>
                                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider block mb-1">Ny Inkomsttyp</label>
                                <select className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-blue-500 outline-none" value={bulkMainCatId} onChange={(e) => setBulkMainCatId(e.target.value)}>
                                    <option value="">-- Behåll nuvarande --</option>
                                    {mainCategories.filter(c => c.name.includes('Inkomst')).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                             </div>
                        )}
                    </div>
                    <Button onClick={handleBulkSave} disabled={!bulkTargetType} className="w-full">Uppdatera transaktioner</Button>
                </div>
            </Modal>
            
            {/* EDIT SINGLE TRANSACTION MODAL */}
            <Modal isOpen={isEditTransactionModalOpen} onClose={() => setIsEditTransactionModalOpen(false)} title="Redigera Transaktion">
                {editingTransaction && (
                    <div className="space-y-4">
                        <Input 
                            label="Beskrivning" 
                            value={editDescription} 
                            onChange={(e) => setEditDescription(e.target.value)}
                            placeholder="T.ex. Veckohandling" 
                        />
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-medium text-slate-500 uppercase tracking-wider block mb-1">Datum</label>
                                <input 
                                    type="date"
                                    className="w-full bg-slate-900/50 border border-slate-700 rounded px-3 py-2 text-white text-sm focus:border-blue-500 outline-none"
                                    value={editDate}
                                    onChange={(e) => setEditDate(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-slate-500 uppercase tracking-wider block mb-1">Belopp (Ej ändrbart)</label>
                                <div className="bg-slate-900/50 border border-slate-800 rounded px-3 py-2 text-slate-400 text-sm font-mono">
                                    {formatMoney(editingTransaction.amount)}
                                </div>
                            </div>
                        </div>

                        {editingTransaction.originalText && (
                            <div className="text-xs text-slate-500 italic bg-slate-800/30 p-2 rounded">
                                Ursprunglig banktext: "{editingTransaction.originalText}"
                            </div>
                        )}

                        <Button onClick={handleSaveTransactionEdit} disabled={!editDescription.trim()} className="w-full">
                            Spara Ändringar
                        </Button>
                    </div>
                )}
            </Modal>
        </div>
    );
};