
import React, { useState, useRef } from 'react';
import { useApp } from '../store';
import { Transaction, ImportRule, Bucket } from '../types';
import { parseBankFile, runImportPipeline } from '../services/importService';
import { cn, Button, Card, Modal, Input } from '../components/components';
import { Upload, Check, Wand2, Save, Trash2 } from 'lucide-react';
import { formatMoney, generateId } from '../utils';

// --- SUB-COMPONENT: STAGING ROW ---

const TransactionRow: React.FC<{ 
    tx: Transaction; 
    buckets: Bucket[]; 
    onCategoryChange: (id: string, catId: string) => void;
    onCreateRule: (tx: Transaction) => void;
}> = ({ tx, buckets, onCategoryChange, onCreateRule }) => {
    
    // Determine status color
    let statusColor = "bg-slate-800 border-slate-700"; // Default
    let icon = <div className="w-4 h-4 rounded-full border border-slate-500"></div>;
    
    if (tx.ruleMatch) {
        statusColor = "bg-emerald-950/30 border-emerald-500/30";
        icon = <Check className="w-4 h-4 text-emerald-500" />;
    } else if (tx.aiSuggested) {
        statusColor = "bg-purple-950/30 border-purple-500/30";
        icon = <Wand2 className="w-4 h-4 text-purple-400" />;
    } else if (!tx.categoryId) {
        statusColor = "bg-slate-800 border-l-4 border-l-slate-500";
    }

    return (
        <div className={cn("grid grid-cols-12 gap-2 items-center p-3 rounded-lg border text-sm mb-2 transition-all hover:bg-slate-700/50", statusColor)}>
            <div className="col-span-1 flex justify-center">{icon}</div>
            <div className="col-span-2 text-slate-400">{tx.date}</div>
            <div className="col-span-3 font-medium text-white truncate" title={tx.description}>{tx.description}</div>
            <div className="col-span-2 text-right font-mono">{formatMoney(tx.amount)}</div>
            
            <div className="col-span-3">
                <select 
                    className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-white focus:border-blue-500 outline-none"
                    value={tx.categoryId || ""}
                    onChange={(e) => onCategoryChange(tx.id, e.target.value)}
                >
                    <option value="">-- Välj Kategori --</option>
                    {buckets.map(b => (
                        <option key={b.id} value={b.id}>{b.name} ({b.type === 'GOAL' ? 'Mål' : 'Utgift'})</option>
                    ))}
                </select>
            </div>
            
            <div className="col-span-1 flex justify-center">
                {tx.categoryId && !tx.ruleMatch && (
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
        accounts, buckets, transactions, importRules, 
        addTransactions, addImportRule, deleteTransaction
    } = useApp();
    
    const [viewMode, setViewMode] = useState<'import' | 'history'>('import');
    const [stagingTransactions, setStagingTransactions] = useState<Transaction[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
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
            
            // 2. Run Pipeline (Duplicates, Rules, AI)
            const processed = await runImportPipeline(raw, transactions, importRules, buckets);
            
            setStagingTransactions(processed);
        } catch (err) {
            console.error(err);
            alert("Något gick fel vid importen. Kontrollera filen.");
        } finally {
            setIsProcessing(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleCategoryChange = (txId: string, categoryId: string) => {
        setStagingTransactions(prev => prev.map(t => 
            t.id === txId ? { ...t, categoryId, aiSuggested: false, ruleMatch: false } : t
        ));
    };

    const handleCommit = async () => {
        const toCommit = stagingTransactions.filter(t => t.categoryId);
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
            targetBucketId: tx.categoryId,
            matchType: 'contains'
        });
        setRuleModalOpen(true);
    };

    const saveRule = async () => {
        if (!ruleDraft.keyword || !ruleDraft.targetBucketId) return;
        
        const newRule: ImportRule = {
            id: generateId(),
            keyword: ruleDraft.keyword,
            targetBucketId: ruleDraft.targetBucketId,
            matchType: ruleDraft.matchType as any
        };

        await addImportRule(newRule);
        setRuleModalOpen(false);
        
        // Optional: Re-run matching on current staging to apply the new rule immediately
        const updatedStaging = stagingTransactions.map(t => {
            if (!t.categoryId && t.description.toLowerCase().includes(newRule.keyword.toLowerCase())) {
                return { ...t, categoryId: newRule.targetBucketId, ruleMatch: true };
            }
            return t;
        });
        setStagingTransactions(updatedStaging);
    };

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
                                    <div className="text-xs text-slate-400">
                                        {stagingTransactions.filter(t => t.categoryId).length} kategoriserade, 
                                        {stagingTransactions.filter(t => !t.categoryId).length} saknar kategori
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <Button variant="secondary" onClick={() => setStagingTransactions([])}>
                                        Avbryt
                                    </Button>
                                    <Button onClick={handleCommit} disabled={stagingTransactions.filter(t => t.categoryId).length === 0}>
                                        <Check className="w-4 h-4 mr-2" />
                                        Bokför ({stagingTransactions.filter(t => t.categoryId).length})
                                    </Button>
                                </div>
                            </div>

                            {/* STAGING LIST */}
                            <div className="bg-surface rounded-xl border border-slate-700 overflow-hidden">
                                <div className="grid grid-cols-12 gap-2 p-3 bg-slate-900 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-700">
                                    <div className="col-span-1 text-center">Status</div>
                                    <div className="col-span-2">Datum</div>
                                    <div className="col-span-3">Beskrivning</div>
                                    <div className="col-span-2 text-right">Belopp</div>
                                    <div className="col-span-3">Kategori</div>
                                    <div className="col-span-1 text-center">Regel</div>
                                </div>
                                <div className="max-h-[60vh] overflow-y-auto p-2">
                                    {stagingTransactions.map(tx => (
                                        <TransactionRow 
                                            key={tx.id} 
                                            tx={tx} 
                                            buckets={buckets} 
                                            onCategoryChange={handleCategoryChange}
                                            onCreateRule={openRuleModal}
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
                                         <th className="p-3">Konto</th>
                                         <th className="p-3">Beskrivning</th>
                                         <th className="p-3">Kategori</th>
                                         <th className="p-3 text-right">Belopp</th>
                                         <th className="p-3 w-10"></th>
                                     </tr>
                                 </thead>
                                 <tbody className="divide-y divide-slate-800">
                                     {[...transactions].sort((a,b) => b.date.localeCompare(a.date)).map(tx => {
                                         const bucket = buckets.find(b => b.id === tx.categoryId);
                                         const account = accounts.find(a => a.id === tx.accountId);
                                         return (
                                             <tr key={tx.id} className="hover:bg-slate-800/50">
                                                 <td className="p-3 text-slate-300 font-mono">{tx.date}</td>
                                                 <td className="p-3 text-slate-400">{account?.icon}</td>
                                                 <td className="p-3 font-medium text-white">{tx.description}</td>
                                                 <td className="p-3">
                                                     <span className="bg-slate-700 px-2 py-1 rounded text-xs text-slate-300">
                                                         {bucket?.name || 'Okänd'}
                                                     </span>
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
                        Automatisera framtida importer genom att koppla text till en kategori.
                    </p>
                    <Input 
                        label="Om texten innehåller:"
                        value={ruleDraft.keyword || ''}
                        onChange={(e) => setRuleDraft({...ruleDraft, keyword: e.target.value})}
                    />
                    
                    <div className="flex flex-col gap-1 w-full">
                        <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Koppla till kategori</label>
                        <select 
                            className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={ruleDraft.targetBucketId || ''}
                            onChange={(e) => setRuleDraft({...ruleDraft, targetBucketId: e.target.value})}
                        >
                            <option value="">Välj...</option>
                            {buckets.map(b => (
                                <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="pt-2">
                        <Button onClick={saveRule} className="w-full">Spara Regel</Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
