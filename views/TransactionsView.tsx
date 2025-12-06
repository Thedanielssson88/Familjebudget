import React, { useState, useRef, useMemo } from 'react';
import { useApp } from '../store';
import { Transaction, ImportRule, Bucket, MainCategory, SubCategory } from '../types';
import { parseBankFile, runImportPipeline } from '../services/importService';
import { categorizeTransactionsWithAi } from '../services/aiService';
import { cn, Button, Card, Modal, Input } from '../components/components';
import { Upload, Check, Wand2, Save, Trash2, ArrowRight, Clock, Zap, Sparkles, Loader2 } from 'lucide-react';
import { formatMoney, generateId } from '../utils';

// --- SUB-COMPONENT: STAGING ROW ---

const TransactionRow: React.FC<{ 
    tx: Transaction; 
    buckets: Bucket[]; 
    mainCategories: MainCategory[];
    subCategories: SubCategory[];
    onChange: (id: string, field: 'bucketId'|'categoryMainId'|'categorySubId', value: string) => void;
    onCreateRule: (tx: Transaction) => void;
    onAiGuess: (tx: Transaction) => void;
    isAiLoading: boolean;
}> = ({ tx, buckets, mainCategories, subCategories, onChange, onCreateRule, onAiGuess, isAiLoading }) => {
    
    // Check completeness
    const isComplete = !!(tx.bucketId && tx.categoryMainId && tx.categorySubId);

    // Determine status color & icon based on matchType or completeness
    let statusColor = "bg-slate-800 border-slate-700"; 
    let icon = <div className="w-4 h-4 rounded-full border border-slate-500"></div>;
    let title = "Ej kategoriserad";
    
    const matchType = tx.matchType || (tx.ruleMatch ? 'rule' : (tx.aiSuggested ? 'ai' : undefined));

    if (isComplete) {
        statusColor = "bg-emerald-900/30 border-emerald-500/50 shadow-[inset_0_0_20px_-10px_rgba(16,185,129,0.3)]";
        icon = <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20"><Check className="w-3 h-3 text-white stroke-[3]" /></div>;
        title = "Klar";
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
    } else if (!tx.bucketId && !tx.categoryMainId) {
        statusColor = "bg-slate-800 border-l-4 border-l-slate-500";
    }

    // Filter subcategories based on selected main category
    const validSubCats = useMemo(() => {
        if (!tx.categoryMainId) return [];
        return subCategories.filter(sc => sc.mainCategoryId === tx.categoryMainId);
    }, [tx.categoryMainId, subCategories]);

    return (
        <div className={cn("grid grid-cols-12 gap-2 items-start p-3 rounded-lg border text-sm mb-2 transition-all hover:bg-slate-700/50", statusColor)}>
            <div className="col-span-1 flex justify-center mt-2" title={title}>
                {isAiLoading ? <Loader2 className="w-4 h-4 animate-spin text-purple-400" /> : icon}
            </div>
            <div className="col-span-2 text-slate-400 mt-2 text-xs">{tx.date}</div>
            <div className="col-span-3 font-medium text-white truncate mt-2" title={tx.description}>{tx.description}</div>
            <div className="col-span-1 text-right font-mono mt-2">{formatMoney(tx.amount)}</div>
            
            <div className="col-span-4 flex flex-col gap-1">
                {/* Budget Source */}
                <select 
                    className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-blue-200 focus:border-blue-500 outline-none"
                    value={tx.bucketId || ""}
                    onChange={(e) => onChange(tx.id, 'bucketId', e.target.value)}
                    title="Budgetpost (Varifrån tas pengarna?)"
                >
                    <option value="">-- Välj Budget --</option>
                    {buckets.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                </select>

                {/* Categories Row */}
                <div className="flex gap-1 items-center">
                    <select 
                        className="w-1/2 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-white focus:border-blue-500 outline-none"
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
                        className="w-1/2 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-white focus:border-blue-500 outline-none disabled:opacity-50"
                        value={tx.categorySubId || ""}
                        onChange={(e) => onChange(tx.id, 'categorySubId', e.target.value)}
                        disabled={!tx.categoryMainId || validSubCats.length === 0}
                        title="Underkategori"
                    >
                        <option value="">-- Underkategori --</option>
                        {validSubCats.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>

                    {/* AI Button - Show if not complete */}
                    {!isComplete && (
                        <button 
                            onClick={() => onAiGuess(tx)}
                            disabled={isAiLoading}
                            className="bg-purple-600/20 hover:bg-purple-600/40 text-purple-300 border border-purple-500/30 p-1.5 rounded transition-colors flex-shrink-0"
                            title="AI Gissning"
                        >
                            <Sparkles size={12} />
                        </button>
                    )}
                </div>
            </div>
            
            <div className="col-span-1 flex justify-center mt-2">
                {(tx.bucketId || tx.categoryMainId) && matchType !== 'rule' && (
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
    );
};

export const TransactionsView: React.FC = () => {
    const { 
        accounts, buckets, transactions, importRules, mainCategories, subCategories,
        addTransactions, addImportRule, deleteTransaction
    } = useApp();
    
    const [viewMode, setViewMode] = useState<'import' | 'history'>('import');
    const [stagingTransactions, setStagingTransactions] = useState<Transaction[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [loadingAiId, setLoadingAiId] = useState<string | null>(null);
    const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id || '');
    
    // Rule Creation Modal
    const [ruleModalOpen, setRuleModalOpen] = useState(false);
    const [ruleDraft, setRuleDraft] = useState<Partial<ImportRule>>({});
    
    // File Input
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !selectedAccountId) return;

        setIsProcessing(true);
        try {
            // 1. Parse
            const raw = await parseBankFile(file, selectedAccountId);
            
            // 2. Run Pipeline (Duplicates, Rules, History, AI)
            const processed = await runImportPipeline(raw, transactions, importRules, buckets, mainCategories, subCategories);
            
            setStagingTransactions(processed);
        } catch (err) {
            console.error(err);
            alert("Något gick fel vid importen. Kontrollera filen.");
        } finally {
            setIsProcessing(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleChange = (txId: string, field: 'bucketId'|'categoryMainId'|'categorySubId', value: string) => {
        setStagingTransactions(prev => prev.map(t => {
            if (t.id !== txId) return t;
            
            const updates: any = { [field]: value, aiSuggested: false, ruleMatch: false, matchType: undefined };
            
            // Reset subcategory if main category changes
            if (field === 'categoryMainId') {
                updates.categorySubId = '';
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
                    return {
                        ...t,
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

    const handleCommit = async () => {
        // Allow committing even if only one field is set, but preferably at least one classification
        const toCommit = stagingTransactions.filter(t => t.bucketId || t.categoryMainId);
        const count = toCommit.length;
        if (count === 0) return;

        // Mark as verified
        const verified = toCommit.map(t => ({ ...t, isVerified: true }));
        
        await addTransactions(verified);
        setStagingTransactions([]);
        setViewMode('history');
    };

    const openRuleModal = (tx: Transaction) => {
        setRuleDraft({
            keyword: tx.description,
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
                     bucketId: newRule.targetBucketId || t.bucketId,
                     categoryMainId: newRule.targetCategoryMainId || t.categoryMainId,
                     categorySubId: newRule.targetCategorySubId || t.categorySubId,
                     ruleMatch: true,
                     matchType: 'rule' as const
                 };
            }
            return t;
        });
        setStagingTransactions(updatedStaging);
    };

    // Filter subcategories for Rule Modal
    const validRuleSubCats = subCategories.filter(sc => sc.mainCategoryId === ruleDraft.targetCategoryMainId);

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
                                <h3 className="text-lg font-bold text-white">Ladda upp Bankfil</h3>
                                <p className="text-sm text-slate-400 max-w-xs mx-auto">Stöder CSV och Excel från de flesta banker. Dubbletter filtreras automatiskt bort.</p>
                            </div>
                            
                            <div className="flex flex-col gap-4 w-full max-w-xs">
                                <select 
                                    className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white outline-none focus:border-blue-500"
                                    value={selectedAccountId}
                                    onChange={(e) => setSelectedAccountId(e.target.value)}
                                >
                                    {accounts.map(acc => (
                                        <option key={acc.id} value={acc.id}>{acc.icon} {acc.name}</option>
                                    ))}
                                </select>
                                
                                <input 
                                    type="file" 
                                    ref={fileInputRef}
                                    onChange={handleFileUpload}
                                    accept=".csv, .xlsx, .xls"
                                    className="hidden" 
                                    id="file-upload"
                                />
                                <Button 
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isProcessing || !selectedAccountId}
                                    className="w-full"
                                >
                                    {isProcessing ? "Analyserar..." : "Välj fil"}
                                </Button>
                            </div>
                        </Card>
                    ) : (
                        <div className="space-y-4">
                            {/* ACTIONS BAR */}
                            <div className="flex justify-between items-center bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                                <div>
                                    <div className="text-sm font-bold text-white">
                                        Hittade {stagingTransactions.length} transaktioner
                                    </div>
                                    <div className="flex gap-2 text-xs text-slate-400 mt-1">
                                         <span className="flex items-center gap-1"><Zap className="w-3 h-3 text-emerald-500"/> Regler</span>
                                         <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-blue-400"/> Historik</span>
                                         <span className="flex items-center gap-1"><Wand2 className="w-3 h-3 text-purple-400"/> AI</span>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <Button variant="secondary" onClick={() => setStagingTransactions([])}>
                                        Avbryt
                                    </Button>
                                    <Button onClick={handleCommit} disabled={stagingTransactions.filter(t => t.bucketId || t.categoryMainId).length === 0}>
                                        <Check className="w-4 h-4 mr-2" />
                                        Bokför ({stagingTransactions.filter(t => t.bucketId || t.categoryMainId).length})
                                    </Button>
                                </div>
                            </div>

                            {/* STAGING LIST */}
                            <div className="bg-surface rounded-xl border border-slate-700 overflow-hidden">
                                <div className="grid grid-cols-12 gap-2 p-3 bg-slate-900 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-700">
                                    <div className="col-span-1 text-center">Status</div>
                                    <div className="col-span-2">Datum</div>
                                    <div className="col-span-3">Beskrivning</div>
                                    <div className="col-span-1 text-right">Belopp</div>
                                    <div className="col-span-4">Klassificering</div>
                                    <div className="col-span-1 text-center">Regel</div>
                                </div>
                                <div className="max-h-[60vh] overflow-y-auto p-2">
                                    {stagingTransactions.map(tx => (
                                        <TransactionRow 
                                            key={tx.id} 
                                            tx={tx} 
                                            buckets={buckets}
                                            mainCategories={mainCategories}
                                            subCategories={subCategories}
                                            onChange={handleChange}
                                            onCreateRule={openRuleModal}
                                            onAiGuess={handleAiGuess}
                                            isAiLoading={loadingAiId === tx.id}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {viewMode === 'history' && (
                <div className="bg-surface rounded-xl border border-slate-700 overflow-hidden">
                     {transactions.length === 0 ? (
                         <div className="p-8 text-center text-slate-500">Inga transaktioner bokförda än.</div>
                     ) : (
                         <div className="max-h-[70vh] overflow-y-auto">
                             <table className="w-full text-sm text-left">
                                 <thead className="bg-slate-900 text-xs text-slate-400 uppercase font-bold sticky top-0">
                                     <tr>
                                         <th className="p-3">Datum</th>
                                         <th className="p-3">Beskrivning</th>
                                         <th className="p-3">Budget</th>
                                         <th className="p-3">Kategori</th>
                                         <th className="p-3 text-right">Belopp</th>
                                         <th className="p-3 w-10"></th>
                                     </tr>
                                 </thead>
                                 <tbody className="divide-y divide-slate-800">
                                     {[...transactions].sort((a,b) => b.date.localeCompare(a.date)).map(tx => {
                                         const bucket = buckets.find(b => b.id === tx.bucketId);
                                         const category = mainCategories.find(c => c.id === tx.categoryMainId);
                                         
                                         return (
                                             <tr key={tx.id} className="hover:bg-slate-800/50">
                                                 <td className="p-3 text-slate-300 font-mono">{tx.date}</td>
                                                 <td className="p-3 font-medium text-white">{tx.description}</td>
                                                 <td className="p-3">
                                                     {bucket ? (
                                                         <span className="bg-blue-900/40 text-blue-300 px-2 py-1 rounded text-xs border border-blue-500/20">
                                                             {bucket.name}
                                                         </span>
                                                     ) : <span className="text-slate-600">-</span>}
                                                 </td>
                                                 <td className="p-3">
                                                     {category ? (
                                                         <span className="text-slate-300">{category.name}</span>
                                                     ) : <span className="text-slate-600">-</span>}
                                                 </td>
                                                 <td className="p-3 text-right font-mono font-bold text-white">
                                                     {formatMoney(tx.amount)}
                                                 </td>
                                                 <td className="p-3 text-center">
                                                     <button 
                                                        onClick={() => deleteTransaction(tx.id)}
                                                        className="text-slate-600 hover:text-red-400 transition-colors"
                                                     >
                                                         <Trash2 className="w-4 h-4" />
                                                     </button>
                                                 </td>
                                             </tr>
                                         );
                                     })}
                                 </tbody>
                             </table>
                         </div>
                     )}
                </div>
            )}

            {/* RULE MODAL */}
            <Modal isOpen={ruleModalOpen} onClose={() => setRuleModalOpen(false)} title="Skapa Importregel">
                <div className="space-y-4">
                    <p className="text-sm text-slate-400">
                        När texten innehåller detta nyckelord, applicera följande:
                    </p>
                    <Input 
                        label="Sökord"
                        value={ruleDraft.keyword || ''}
                        onChange={(e) => setRuleDraft({...ruleDraft, keyword: e.target.value})}
                    />
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                             <label className="text-xs font-medium text-blue-300 uppercase tracking-wider block mb-1">Budgetpost (Finansiering)</label>
                             <select 
                                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                value={ruleDraft.targetBucketId || ''}
                                onChange={(e) => setRuleDraft({...ruleDraft, targetBucketId: e.target.value})}
                            >
                                <option value="">Ingen vald (Manuell)</option>
                                {buckets.map(b => (
                                    <option key={b.id} value={b.id}>{b.name}</option>
                                ))}
                            </select>
                        </div>
                        
                        <div>
                             <label className="text-xs font-medium text-purple-300 uppercase tracking-wider block mb-1">Huvudkategori</label>
                             <select 
                                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                value={ruleDraft.targetCategoryMainId || ''}
                                onChange={(e) => setRuleDraft({...ruleDraft, targetCategoryMainId: e.target.value, targetCategorySubId: ''})}
                            >
                                <option value="">Ingen vald</option>
                                {mainCategories.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                             <label className="text-xs font-medium text-purple-300 uppercase tracking-wider block mb-1">Underkategori</label>
                             <select 
                                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                                value={ruleDraft.targetCategorySubId || ''}
                                onChange={(e) => setRuleDraft({...ruleDraft, targetCategorySubId: e.target.value})}
                                disabled={!ruleDraft.targetCategoryMainId}
                            >
                                <option value="">Ingen vald</option>
                                {validRuleSubCats.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="col-span-2">
                             <label className="text-xs font-medium text-slate-400 uppercase tracking-wider block mb-1">Matchningstyp</label>
                             <select 
                                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                value={ruleDraft.matchType || 'contains'}
                                onChange={(e) => setRuleDraft({...ruleDraft, matchType: e.target.value as any})}
                            >
                                <option value="contains">Innehåller (Texten finns i beskrivningen)</option>
                                <option value="starts_with">Börjar med (Texten är i början)</option>
                                <option value="exact">Exakt matchning (Hela texten måste stämma)</option>
                            </select>
                        </div>
                    </div>

                    <div className="flex gap-3 pt-4 border-t border-slate-700">
                        <Button variant="secondary" onClick={() => setRuleModalOpen(false)} className="flex-1">Avbryt</Button>
                        <Button onClick={saveRule} className="flex-1">Spara Regel</Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};