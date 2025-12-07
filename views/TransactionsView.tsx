import React, { useState, useRef, useMemo } from 'react';
import { useApp } from '../store';
import { Transaction, ImportRule, Bucket, MainCategory, SubCategory, AppSettings } from '../types';
import { parseBankFile, runImportPipeline } from '../services/importService';
import { categorizeTransactionsWithAi } from '../services/aiService';
import { cn, Button, Card, Modal, Input } from '../components/components';
import { Upload, Check, Wand2, Save, Trash2, Loader2, AlertTriangle, Zap, Clock, ArrowRightLeft, ShoppingCart, ArrowDownLeft, Sparkles, CheckCircle, Target } from 'lucide-react';
import { formatMoney, generateId } from '../utils';

// --- SUB-COMPONENT: STAGING ROW ---

const TransactionRow: React.FC<{ 
    tx: Transaction; 
    buckets: Bucket[]; 
    mainCategories: MainCategory[];
    subCategories: SubCategory[];
    settings: AppSettings;
    onChange: (id: string, field: 'type'|'bucketId'|'categoryMainId'|'categorySubId'|'isManuallyApproved', value: string | boolean) => void;
    onCreateRule: (tx: Transaction) => void;
    onAiGuess: (tx: Transaction) => void;
    isAiLoading: boolean;
}> = ({ tx, buckets, mainCategories, subCategories, settings, onChange, onCreateRule, onAiGuess, isAiLoading }) => {
    
    // 1. Check Completeness (Data available?)
    const isTransfer = tx.type === 'TRANSFER';
    const isExpense = tx.type === 'EXPENSE';
    const isIncome = tx.type === 'INCOME';

    const hasRequiredData = 
        (isTransfer && !!tx.bucketId) || 
        (isExpense && !!tx.categoryMainId && !!tx.categorySubId) || 
        (isIncome && !!tx.categoryMainId);

    // 2. Check Approval Logic
    const isSystemMatch = tx.matchType === 'rule' || tx.matchType === 'history';
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
                <div className="flex items-center justify-end gap-1 w-20 shrink-0">
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
                    {isReady && matchType !== 'rule' && (
                        <button 
                            onClick={() => onCreateRule(tx)}
                            className="p-1.5 text-slate-400 hover:text-white hover:bg-blue-600 rounded transition-colors"
                            title="Skapa regel för framtiden"
                        >
                            <Save className="w-4 h-4" />
                        </button>
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
                            <option value="">-- Välj Budget (Krävs) --</option>
                            {buckets
                                .filter(b => b.accountId === tx.accountId)
                                .map(b => (
                                <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
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
                            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500 outline-none"
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

export const TransactionsView: React.FC = () => {
    const { 
        accounts, buckets, transactions, importRules, mainCategories, subCategories, settings,
        addTransactions, addImportRule, deleteTransaction
    } = useApp();
    
    const [viewMode, setViewMode] = useState<'import' | 'history'>('import');
    const [stagingTransactions, setStagingTransactions] = useState<Transaction[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isAiAnalysisRunning, setIsAiAnalysisRunning] = useState(false);
    const [loadingAiId, setLoadingAiId] = useState<string | null>(null);
    const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id || '');
    
    // Error Logging State
    const [errorLog, setErrorLog] = useState<string | null>(null);
    
    // Rule Creation Modal
    const [ruleModalOpen, setRuleModalOpen] = useState(false);
    const [ruleDraft, setRuleDraft] = useState<Partial<ImportRule>>({});
    
    // File Input
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !selectedAccountId) return;

        setIsProcessing(true);
        setErrorLog(null); // Clear previous errors

        try {
            // 1. Parse
            const raw = await parseBankFile(file, selectedAccountId);
            
            if (raw.length === 0) {
                throw new Error("Inga giltiga transaktioner hittades i filen. Kontrollera filformatet och rubrikerna.");
            }

            // 2. Run Pipeline (Fast: Duplicates, Rules, History only)
            const processed = await runImportPipeline(raw, transactions, importRules, buckets);
            
            setStagingTransactions(processed);
        } catch (err: any) {
            console.error("Import Error:", err);
            // Capture detailed error info
            const message = err instanceof Error ? err.message : String(err);
            const stack = err instanceof Error ? err.stack : '';
            setErrorLog(`${message}\n\nTechnical Details:\n${stack}`);
        } finally {
            setIsProcessing(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleChange = (txId: string, field: 'type'|'bucketId'|'categoryMainId'|'categorySubId'|'isManuallyApproved', value: string | boolean) => {
        setStagingTransactions(prev => prev.map(t => {
            if (t.id !== txId) return t;
            
            const updates: any = { [field]: value };

            if (field !== 'isManuallyApproved') {
                // Changing data resets approval state (force re-verify) and system match flags
                updates.aiSuggested = false;
                updates.ruleMatch = false; 
                updates.matchType = undefined;
                updates.isManuallyApproved = true; // User interacted, so it's manually approved
            }
            
            // Logic reset when changing type
            if (field === 'type') {
                updates.bucketId = undefined;
                updates.categoryMainId = undefined;
                updates.categorySubId = undefined;
            }

            // Reset subcategory if main category changes
            if (field === 'categoryMainId') {
                updates.categorySubId = '';
                // If selecting a category, ensure bucketId is cleared (mutually exclusive)
                updates.bucketId = undefined;
            }

            // If selecting a bucket for expense, clear categories
            if (field === 'bucketId' && t.type === 'EXPENSE' && value) {
                updates.categoryMainId = undefined;
                updates.categorySubId = undefined;
            }
            
            return { ...t, ...updates };
        }));
    };

    const handleAiGuess = async (tx: Transaction) => {
        setLoadingAiId(tx.id);
        try {
            // Use static import now
            const result = await categorizeTransactionsWithAi([tx], buckets, mainCategories, subCategories);
            const suggestion = result[tx.id];

            if (suggestion) {
                setStagingTransactions(prev => prev.map(t => {
                    if (t.id !== tx.id) return t;
                    
                    // The AI service returns IDs. If we have categories, assume Expense. If bucket, assume Transfer.
                    // Prioritize Category if both exist (usually safer)
                    const newType = suggestion.mainCatId ? 'EXPENSE' : (suggestion.bucketId ? 'TRANSFER' : t.type);

                    return {
                        ...t,
                        type: newType,
                        bucketId: suggestion.bucketId || t.bucketId,
                        categoryMainId: suggestion.mainCatId || t.categoryMainId,
                        categorySubId: suggestion.subCatId || t.categorySubId,
                        matchType: 'ai' as const,
                        aiSuggested: true
                    };
                }));
            }
        } catch (e) {
            console.error("AI Single Guess Failed", e);
        } finally {
            setLoadingAiId(null);
        }
    };

    const handleRunAiAnalysis = async () => {
        const unassigned = stagingTransactions.filter(t => !t.bucketId && !t.categoryMainId);
        if (unassigned.length === 0) return;

        setIsAiAnalysisRunning(true);
        try {
            const aiMapping = await categorizeTransactionsWithAi(unassigned, buckets, mainCategories, subCategories);
            
            setStagingTransactions(prev => prev.map(t => {
                const suggestion = aiMapping[t.id];
                if (suggestion && !t.bucketId && !t.categoryMainId) {
                    const newType = suggestion.mainCatId ? 'EXPENSE' : (suggestion.bucketId ? 'TRANSFER' : t.type);
                    return {
                        ...t,
                        type: newType,
                        bucketId: suggestion.bucketId,
                        categoryMainId: suggestion.mainCatId,
                        categorySubId: suggestion.subCatId,
                        matchType: 'ai' as const,
                        aiSuggested: true
                    };
                }
                return t;
            }));
        } catch (e) {
            console.error("Bulk AI Analysis failed", e);
            setErrorLog(`AI Analysis Failed: ${e}`);
        } finally {
            setIsAiAnalysisRunning(false);
        }
    };

    const handleCommit = async () => {
        // Only commit items that are READY (Green)
        
        const toCommit = stagingTransactions.filter(tx => {
            const isTransfer = tx.type === 'TRANSFER';
            const isExpense = tx.type === 'EXPENSE';
            const isIncome = tx.type === 'INCOME';

            const hasRequiredData = 
                (isTransfer && !!tx.bucketId) || 
                (isExpense && !!tx.categoryMainId && !!tx.categorySubId) ||
                (isIncome && !!tx.categoryMainId);

            if (!hasRequiredData) return false;

            const isSystemMatch = tx.matchType === 'rule' || tx.matchType === 'history';
            const settingAllowsAuto = 
                (isTransfer && settings.autoApproveTransfer) ||
                (isExpense && settings.autoApproveExpense) ||
                (isIncome && settings.autoApproveIncome);

            const autoApproved = isSystemMatch && settingAllowsAuto;
            const isReady = hasRequiredData && (tx.isManuallyApproved || autoApproved);
            
            return isReady;
        });

        const count = toCommit.length;
        if (count === 0) return;

        // Mark as verified and remove transient flags
        const verified = toCommit.map(t => {
            const { isManuallyApproved, matchType, ruleMatch, aiSuggested, ...rest } = t;
            return { ...rest, isVerified: true };
        });
        
        await addTransactions(verified);
        
        // Remove only the committed ones from staging
        const committedIds = new Set(verified.map(v => v.id));
        const remaining = stagingTransactions.filter(t => !committedIds.has(t.id));
        setStagingTransactions(remaining);
        
        // If everything is done, switch view. Otherwise stay to let user fix the rest.
        if (remaining.length === 0) {
            setViewMode('history');
        }
    };

    const openRuleModal = (tx: Transaction) => {
        setRuleDraft({
            keyword: tx.description,
            targetType: tx.type,
            targetBucketId: tx.bucketId,
            targetCategoryMainId: tx.categoryMainId,
            targetCategorySubId: tx.categorySubId,
            matchType: 'contains'
        });
        setRuleModalOpen(true);
    };

    const saveRule = async () => {
        if (!ruleDraft.keyword) return;
        
        const newRule: ImportRule = {
            id: generateId(),
            keyword: ruleDraft.keyword,
            targetType: ruleDraft.targetType,
            targetBucketId: ruleDraft.targetBucketId,
            targetCategoryMainId: ruleDraft.targetCategoryMainId,
            targetCategorySubId: ruleDraft.targetCategorySubId,
            matchType: ruleDraft.matchType as any
        };

        await addImportRule(newRule);
        setRuleModalOpen(false);
        
        // Apply new rule to current staging
        const updatedStaging = stagingTransactions.map(t => {
            if (t.description.toLowerCase().includes(newRule.keyword!.toLowerCase())) {
                 return {
                     ...t,
                     type: newRule.targetType || t.type,
                     bucketId: newRule.targetBucketId || t.bucketId,
                     categoryMainId: newRule.targetCategoryMainId || t.categoryMainId,
                     categorySubId: newRule.targetCategorySubId || t.categorySubId,
                     ruleMatch: true,
                     matchType: 'rule' as const,
                     isManuallyApproved: false // Reset manual approval since rule changed it, let setting decide
                 };
            }
            return t;
        });
        setStagingTransactions(updatedStaging);
    };

    // Count valid transactions for commit
    const validForCommitCount = stagingTransactions.filter(tx => {
            const isTransfer = tx.type === 'TRANSFER';
            const isExpense = tx.type === 'EXPENSE';
            const isIncome = tx.type === 'INCOME';

            const hasRequiredData = 
                (isTransfer && !!tx.bucketId) || 
                (isExpense && !!tx.categoryMainId && !!tx.categorySubId) ||
                (isIncome && !!tx.categoryMainId);

            if (!hasRequiredData) return false;

            const isSystemMatch = tx.matchType === 'rule' || tx.matchType === 'history';
            const settingAllowsAuto = 
                (isTransfer && settings.autoApproveTransfer) ||
                (isExpense && settings.autoApproveExpense) ||
                (isIncome && settings.autoApproveIncome);

            const autoApproved = isSystemMatch && settingAllowsAuto;
            const isReady = hasRequiredData && (tx.isManuallyApproved || autoApproved);
            
            return isReady;
    }).length;

    return (
        <div className="space-y-6 pb-24 animate-in slide-in-from-right duration-300">
            <header className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-bold text-white">Transaktioner</h1>
                    <p className="text-slate-400">Importera från bank eller granska historik</p>
                </div>
                
                <div className="flex bg-slate-800 rounded-lg p-1">
                    <button 
                        onClick={() => setViewMode('import')}
                        className={cn("px-4 py-1.5 rounded text-sm font-medium transition-all", viewMode === 'import' ? "bg-blue-600 text-white shadow" : "text-slate-400 hover:text-white")}
                    >
                        Importera
                    </button>
                    <button 
                        onClick={() => setViewMode('history')}
                        className={cn("px-4 py-1.5 rounded text-sm font-medium transition-all", viewMode === 'history' ? "bg-blue-600 text-white shadow" : "text-slate-400 hover:text-white")}
                    >
                        Historik
                    </button>
                </div>
            </header>

            {viewMode === 'import' && (
                <div className="space-y-6">
                    {/* UPLOAD SECTION */}
                    {stagingTransactions.length === 0 ? (
                        <Card className="p-8 border-dashed border-2 border-slate-700 bg-slate-800/20 flex flex-col items-center justify-center text-center space-y-4">
                            <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center text-blue-400 mb-2">
                                <Upload className="w-8 h-8" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-white">Ladda upp bankfil</h3>
                                <p className="text-slate-400 text-sm max-w-xs mx-auto mt-1">
                                    Stöder CSV (Swedbank, Handelsbanken, m.fl) och Excel.
                                </p>
                            </div>
                            
                            <div className="flex gap-2 items-center">
                                <select 
                                    className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"
                                    value={selectedAccountId}
                                    onChange={e => setSelectedAccountId(e.target.value)}
                                >
                                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                </select>
                                <label className="cursor-pointer">
                                    <input 
                                        type="file" 
                                        accept=".csv,.xlsx,.xls" 
                                        className="hidden" 
                                        onChange={handleFileUpload} 
                                        ref={fileInputRef}
                                    />
                                    <span className={cn("px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2", isProcessing ? "bg-slate-700 text-slate-500" : "bg-blue-600 hover:bg-blue-500 text-white")}>
                                        {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                                        {isProcessing ? 'Bearbetar...' : 'Välj fil'}
                                    </span>
                                </label>
                            </div>
                            {errorLog && (
                                <div className="mt-4 p-4 bg-red-950/30 border border-red-500/30 rounded text-left w-full overflow-auto max-h-32">
                                    <div className="text-red-400 font-bold text-xs mb-1 flex items-center gap-2"><AlertTriangle size={12}/> Fel vid import</div>
                                    <pre className="text-[10px] text-red-300 whitespace-pre-wrap font-mono">{errorLog}</pre>
                                </div>
                            )}
                        </Card>
                    ) : (
                        <div className="animate-in slide-in-from-bottom-4 space-y-4">
                            {/* ACTION BAR */}
                            <div className="flex justify-between items-center bg-slate-800 p-3 rounded-xl border border-slate-700 sticky top-16 z-30 shadow-xl">
                                <div className="flex items-center gap-4">
                                    <button onClick={() => setStagingTransactions([])} className="text-slate-400 hover:text-white text-sm flex items-center gap-1">
                                        <Trash2 className="w-4 h-4" /> Rensa
                                    </button>
                                    <div className="h-4 w-px bg-slate-700"></div>
                                    <button 
                                        onClick={handleRunAiAnalysis} 
                                        disabled={isAiAnalysisRunning}
                                        className="text-purple-400 hover:text-purple-300 text-sm flex items-center gap-1 disabled:opacity-50"
                                    >
                                        {isAiAnalysisRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                                        AI-Analysera alla
                                    </button>
                                </div>

                                <Button 
                                    onClick={handleCommit} 
                                    disabled={validForCommitCount === 0}
                                    className={cn("transition-all", validForCommitCount > 0 ? "bg-emerald-600 hover:bg-emerald-500" : "bg-slate-700 text-slate-500")}
                                >
                                    <Check className="w-4 h-4 mr-2" />
                                    Bokför {validForCommitCount} st
                                </Button>
                            </div>

                            {/* LIST */}
                            <div className="space-y-2 pb-20">
                                {stagingTransactions.map(tx => (
                                    <TransactionRow 
                                        key={tx.id} 
                                        tx={tx} 
                                        buckets={buckets}
                                        mainCategories={mainCategories}
                                        subCategories={subCategories}
                                        settings={settings}
                                        onChange={handleChange}
                                        onCreateRule={openRuleModal}
                                        onAiGuess={handleAiGuess}
                                        isAiLoading={loadingAiId === tx.id}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
            
            {viewMode === 'history' && (
                <div className="space-y-4 animate-in slide-in-from-right">
                    <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700 text-center text-sm text-slate-400">
                        Visar de senaste 50 transaktionerna
                    </div>
                    {transactions.slice().sort((a,b) => b.date.localeCompare(a.date)).slice(0, 50).map(tx => (
                        <div key={tx.id} className="bg-slate-800 p-3 rounded-lg border border-slate-700 flex justify-between items-center">
                            <div>
                                <div className="font-bold text-white text-sm mb-1">{tx.description}</div>
                                <div className="text-[10px] text-slate-500 mb-2 flex items-center gap-2">
                                    <span>{tx.date}</span>
                                    <span>•</span>
                                    <span>{accounts.find(a=>a.id===tx.accountId)?.name}</span>
                                </div>
                                
                                {/* CATEGORIES DISPLAY */}
                                <div className="flex flex-wrap gap-2">
                                    {tx.categoryMainId && (
                                        <div className="flex items-center gap-1 px-2 py-1 rounded bg-slate-700 text-xs text-slate-300 border border-slate-600">
                                            <span className="font-bold">{mainCategories.find(c => c.id === tx.categoryMainId)?.name}</span>
                                        </div>
                                    )}
                                    {tx.categorySubId && (
                                        <div className="flex items-center gap-1 px-2 py-1 rounded bg-slate-700 text-xs text-slate-300 border border-slate-600">
                                            <span>{subCategories.find(s => s.id === tx.categorySubId)?.name}</span>
                                        </div>
                                    )}
                                    {tx.bucketId && (
                                        <span className="px-2 py-1 rounded bg-blue-900/50 text-xs text-blue-300 border border-blue-500/30">
                                            ➡ {buckets.find(b => b.id === tx.bucketId)?.name}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="text-right">
                                <div className={cn("font-mono font-bold", tx.amount < 0 ? "text-white" : "text-emerald-400")}>{formatMoney(tx.amount)}</div>
                                <button onClick={() => deleteTransaction(tx.id)} className="text-xs text-rose-400 hover:text-white mt-1 opacity-50 hover:opacity-100">Ta bort</button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
            
            {/* Rule Modal */}
            <Modal isOpen={ruleModalOpen} onClose={() => setRuleModalOpen(false)} title="Skapa importregel">
                <div className="space-y-4">
                    <div>
                         <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Innehåller text</label>
                         <Input 
                            value={ruleDraft.keyword || ''} 
                            onChange={e => setRuleDraft({...ruleDraft, keyword: e.target.value})} 
                         />
                    </div>
                    
                    <div>
                         <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Åtgärd</label>
                         <div className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-sm space-y-2">
                             <div>
                                 <span className="text-slate-400">Typ:</span> <span className="text-white font-bold">{ruleDraft.targetType === 'EXPENSE' ? 'Utgift' : (ruleDraft.targetType === 'TRANSFER' ? 'Överföring' : 'Inkomst')}</span>
                             </div>
                             {ruleDraft.targetType === 'TRANSFER' && (
                                 <div>
                                     <span className="text-slate-400">Budgetpost:</span> <span className="text-white">{buckets.find(b => b.id === ruleDraft.targetBucketId)?.name || 'Ingen vald'}</span>
                                 </div>
                             )}
                             {(ruleDraft.targetType === 'EXPENSE' || ruleDraft.targetType === 'INCOME') && (
                                 <div>
                                     <span className="text-slate-400">Kategori:</span> <span className="text-white">
                                         {mainCategories.find(c => c.id === ruleDraft.targetCategoryMainId)?.name} 
                                         {ruleDraft.targetCategorySubId && ` > ${subCategories.find(s => s.id === ruleDraft.targetCategorySubId)?.name}`}
                                     </span>
                                 </div>
                             )}
                         </div>
                    </div>

                    <Button onClick={saveRule} disabled={!ruleDraft.keyword}>Spara Regel</Button>
                </div>
            </Modal>
        </div>
    );
};