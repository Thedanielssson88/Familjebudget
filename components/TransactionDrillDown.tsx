
import React, { useState } from 'react';
import { Modal, cn, Button } from './components';
import { useBudgetActuals } from '../hooks/useBudgetActuals';
import { formatMoney } from '../utils';
import { Transaction, Bucket } from '../types';
import { useApp } from '../store';
import { ArrowRight, Wallet, ChevronRight } from 'lucide-react';

interface Props {
    bucketId?: string;
    bucketName: string;
    month: string;
    payday: number;
    onClose: () => void;
    filterType?: 'TRANSFER' | 'EXPENSE' | 'INCOME';
    unallocatedOnly?: boolean; // New prop for showing untagged transfers
    accountId?: string; // Needed when unallocatedOnly is true
}

export const TransactionDrillDown: React.FC<Props> = ({ bucketId, bucketName, month, payday, onClose, filterType, unallocatedOnly, accountId }) => {
  const { buckets, updateTransaction } = useApp();
  const actuals = useBudgetActuals(month, payday);
  const [mappingTx, setMappingTx] = useState<Transaction | null>(null);
  
  // Filtrera fram transaktionerna
  const transactions = (actuals?.transactions || [])
    .filter(t => {
        // If filtering by TRANSFER, we also accept INCOME as "Funding"
        const typeMatch = !filterType || t.type === filterType || (filterType === 'TRANSFER' && t.type === 'INCOME');

        if (unallocatedOnly) {
            // Must have no bucket ID OR be INTERNAL/PAYOUT, match the account, and be of type TRANSFER/INCOME
            const isUnallocated = !t.bucketId || t.bucketId === 'INTERNAL' || t.bucketId === 'PAYOUT';
            return isUnallocated && t.accountId === accountId && typeMatch;
        }
        return t.bucketId === bucketId && typeMatch;
    })
    .sort((a, b) => b.date.localeCompare(a.date)); // Nyast först

  const isTransferView = filterType === 'TRANSFER';

  const totalSpent = transactions.reduce((sum, t) => {
      if (isTransferView) {
          // If unallocated view, we just sum the raw amount (signed)
          if (unallocatedOnly) return sum + t.amount;
          
          // For regular transfer bucket view, we usually sum absolute magnitude (Funding)
          // But consistency might be better? Let's stick to absolute for buckets
          return sum + Math.abs(t.amount);
      }
      // For expenses, we sum the consumption (negative amounts = positive cost)
      if (t.amount < 0) return sum + Math.abs(t.amount);
      return sum - t.amount;
  }, 0);

  const handleMapToBucket = async (bucketId: string) => {
      if (!mappingTx) return;
      
      await updateTransaction({
          ...mappingTx,
          bucketId: bucketId,
          // If mapping to a bucket, we ensure it is categorized as a transfer (usually already is, but safety first)
          type: 'TRANSFER'
      });
      
      setMappingTx(null);
  };

  // Filter buckets available for the account of the selected transaction
  const availableBuckets = mappingTx 
    ? buckets.filter(b => b.accountId === mappingTx.accountId && !b.archivedDate)
    : [];

  return (
    <>
        <Modal isOpen={true} onClose={onClose} title={`Transaktioner: ${bucketName}`}>
        <div className="space-y-4">
            <div className="flex justify-between items-center bg-slate-800 p-4 rounded-xl border border-slate-700">
                <span className="text-slate-400 text-sm font-medium uppercase tracking-wider">
                    {isTransferView ? (unallocatedOnly ? 'Nettoflöde' : 'Totalt Överfört/Insatt') : 'Totalt Bokfört'}
                </span>
                <span className={cn("text-2xl font-bold font-mono", (unallocatedOnly && totalSpent < 0) ? "text-rose-400" : "text-white")}>
                    {(!unallocatedOnly && isTransferView) && '+'}{formatMoney(totalSpent)}
                </span>
            </div>

            <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1 no-scrollbar">
                {transactions.length === 0 ? (
                    <div className="text-center py-8">
                        <p className="text-slate-500 italic">Inga transaktioner hittades.</p>
                    </div>
                ) : (
                    transactions.map(t => {
                        // Logic for display amount:
                        // Transfers (Bucket): Always show Positive (Inflow/Funding)
                        // Transfers (Unallocated): Show actual sign
                        // Expenses: Show actual signed amount (usually negative)
                        
                        let displayAmount = t.amount;
                        let showPlus = false;

                        if (isTransferView && !unallocatedOnly) {
                            displayAmount = Math.abs(t.amount);
                            showPlus = true;
                        } 
                        
                        // Color logic
                        let amountColor = "text-slate-200";
                        if (showPlus) amountColor = "text-emerald-400";
                        else if (unallocatedOnly) {
                            amountColor = t.amount > 0 ? "text-emerald-400" : "text-rose-400";
                        }
                        
                        return (
                            <div 
                                key={t.id} 
                                onClick={() => unallocatedOnly && setMappingTx(t)}
                                className={cn(
                                    "flex justify-between items-center p-3 bg-slate-900/50 border border-slate-800 rounded-lg transition-colors group",
                                    unallocatedOnly ? "cursor-pointer hover:bg-slate-800 hover:border-blue-500/50" : ""
                                )}
                            >
                                <div className="overflow-hidden mr-4">
                                    <div className="text-white font-medium truncate flex items-center gap-2">
                                        {t.description}
                                        {unallocatedOnly && <ChevronRight className="w-3 h-3 text-slate-600 group-hover:text-blue-400 transition-colors" />}
                                    </div>
                                    <div className="text-xs text-slate-500 font-mono">{t.date}</div>
                                </div>
                                <div className={cn("font-mono font-bold whitespace-nowrap", amountColor)}>
                                    {showPlus && '+'}{formatMoney(displayAmount)}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
        </Modal>

        {/* MAPPING MODAL */}
        <Modal isOpen={!!mappingTx} onClose={() => setMappingTx(null)} title="Koppla till Budgetpost">
            <div className="space-y-4">
                <div className="bg-slate-800 p-3 rounded-lg text-sm mb-4 border border-slate-700">
                    <div className="text-slate-400 text-xs uppercase mb-1">Transaktion</div>
                    <div className="font-bold text-white">{mappingTx?.description}</div>
                    <div className="font-mono text-white">{formatMoney(mappingTx?.amount || 0)}</div>
                </div>

                <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                    <p className="text-xs text-slate-400 uppercase font-bold tracking-wider px-1">Välj Bucket</p>
                    {availableBuckets.map(b => (
                        <button
                            key={b.id}
                            onClick={() => handleMapToBucket(b.id)}
                            className="w-full text-left p-3 rounded-xl bg-slate-700/50 hover:bg-blue-600 hover:text-white transition-all flex items-center gap-3 group"
                        >
                            <div className="p-2 bg-slate-800 rounded-lg text-slate-400 group-hover:bg-white/20 group-hover:text-white">
                                <Wallet size={16} />
                            </div>
                            <div className="flex-1">
                                <div className="font-bold text-sm">{b.name}</div>
                                <div className="text-xs opacity-70 group-hover:text-blue-100">
                                    {b.type === 'FIXED' ? 'Fast' : (b.type === 'DAILY' ? 'Rörlig' : 'Mål')}
                                </div>
                            </div>
                            <ArrowRight size={16} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                    ))}
                    {availableBuckets.length === 0 && (
                        <div className="text-center text-slate-500 py-4 italic">Inga budgetposter hittades för detta konto.</div>
                    )}
                </div>
            </div>
        </Modal>
    </>
  );
};
