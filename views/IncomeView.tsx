import React, { useState, useMemo } from 'react';
import { useApp } from '../store';
import { useBudgetMonth } from '../hooks/useBudgetMonth';
import { Card, Button, Modal } from '../components/components';
import { User, Wallet, Shield, Baby, Calendar, Check, Search, Keyboard, AlertCircle, ChevronRight } from 'lucide-react';
import { formatMoney, getTotalFamilyIncome, getLatestDailyDeduction } from '../utils';
import { cn } from '../components/components';
import { Transaction } from '../types';

// --- HELPER: Inkomstkällor som ikoner ---
const getIconForType = (type: string) => {
    switch (type) {
        case 'salary': return <Wallet className="w-5 h-5 text-emerald-400" />;
        case 'childBenefit': return <Baby className="w-5 h-5 text-pink-400" />;
        case 'insurance': return <Shield className="w-5 h-5 text-blue-400" />;
        default: return <Wallet className="w-5 h-5 text-slate-400" />;
    }
};

const getLabelForType = (type: string) => {
    switch (type) {
        case 'salary': return 'Lön (Netto)';
        case 'childBenefit': return 'Barnbidrag';
        case 'insurance': return 'Försäkringskassan';
        default: return 'Inkomst';
    }
};

export const IncomeView: React.FC = () => {
  const { users, selectedMonth, transactions, updateUserIncome, updateUserName } = useApp();
  const { startStr, endStr, intervalLabel } = useBudgetMonth(selectedMonth);
  const totalIncome = getTotalFamilyIncome(users, selectedMonth);

  // State for Modal
  const [activeField, setActiveField] = useState<{ userId: string, type: 'salary'|'childBenefit'|'insurance' } | null>(null);
  const [manualValue, setManualValue] = useState<string>('');
  const [isManualMode, setIsManualMode] = useState(false);

  // 1. Get Relevant Income Transactions based on Payday Rule
  const incomeTransactions = useMemo(() => {
      return transactions
        .filter(t => t.type === 'INCOME' && t.date >= startStr && t.date <= endStr)
        .sort((a, b) => b.date.localeCompare(a.date));
  }, [transactions, startStr, endStr]);

  // 2. Logic to detect "Used" transactions
  // Since we don't store transaction IDs in the User object yet, we match by exact Amount.
  // We greedily assign transactions to existing income values to see what's left.
  const usageMap = useMemo(() => {
      const map = new Set<string>(); // Set of Transaction IDs that are "taken"
      
      // Collect all current income values
      const currentIncomes: { userId: string, type: string, amount: number }[] = [];
      users.forEach(u => {
          const d = u.incomeData[selectedMonth];
          if (d?.salary) currentIncomes.push({ userId: u.id, type: 'salary', amount: d.salary });
          if (d?.childBenefit) currentIncomes.push({ userId: u.id, type: 'childBenefit', amount: d.childBenefit });
          if (d?.insurance) currentIncomes.push({ userId: u.id, type: 'insurance', amount: d.insurance });
      });

      // Try to match transactions to these incomes
      // We prioritize exact matches.
      currentIncomes.forEach(inc => {
          // Find a transaction with this amount that hasn't been used yet
          const tx = incomeTransactions.find(t => t.amount === inc.amount && !map.has(t.id));
          if (tx) {
              map.add(tx.id);
          }
      });

      return map;
  }, [users, selectedMonth, incomeTransactions]);

  const handleOpenModal = (userId: string, type: 'salary'|'childBenefit'|'insurance', currentValue: number) => {
      setActiveField({ userId, type });
      setManualValue(currentValue > 0 ? currentValue.toString() : '');
      setIsManualMode(false);
  };

  const handleSelectTransaction = (tx: Transaction) => {
      if (!activeField) return;
      updateUserIncome(activeField.userId, selectedMonth, activeField.type, tx.amount);
      setActiveField(null);
  };

  const handleSaveManual = () => {
      if (!activeField) return;
      const val = parseFloat(manualValue);
      updateUserIncome(activeField.userId, selectedMonth, activeField.type, isNaN(val) ? 0 : val);
      setActiveField(null);
  };

  return (
    <div className="space-y-6 pb-24 animate-in slide-in-from-right duration-300">
      <header className="mb-6">
        <div className="flex items-center justify-between">
            <div>
                <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">Inkomstkällor</h1>
                <div className="flex items-center gap-2 mt-1">
                    <span className="text-slate-400 text-sm">Period:</span>
                    <span className="text-xs font-mono bg-slate-800 px-2 py-0.5 rounded text-slate-300">{intervalLabel}</span>
                </div>
            </div>
        </div>
        <div className="mt-4 text-4xl font-mono font-bold text-white tracking-tight">
          {formatMoney(totalIncome)}
        </div>
      </header>

      <div className="grid gap-4">
        {users.map(user => {
          const data = user.incomeData[selectedMonth] || { salary: 0, childBenefit: 0, insurance: 0, incomeLoss: 0, vabDays: 0, dailyDeduction: 0 };
          const userTotal = (data.salary || 0) + (data.childBenefit || 0) + (data.insurance || 0);
          const share = totalIncome > 0 ? (userTotal / totalIncome) * 100 : 0;
          
          const latestDeduction = getLatestDailyDeduction(user, selectedMonth);
          const currentDailyDeduction = data.dailyDeduction !== undefined ? data.dailyDeduction : latestDeduction;
          const totalLoss = (data.vabDays || 0) * currentDailyDeduction;

          return (
            <Card key={user.id} className="border-emerald-500/20 bg-gradient-to-br from-surface to-emerald-950/10">
              <div className="flex items-center gap-3 mb-4">
                <div className="text-2xl bg-slate-800 rounded-full w-12 h-12 flex items-center justify-center shadow-inner">
                  {user.avatar}
                </div>
                <div className="flex-1 min-w-0">
                  <input 
                    type="text"
                    value={user.name}
                    onChange={(e) => updateUserName(user.id, e.target.value)}
                    className="bg-transparent font-bold text-lg text-white focus:outline-none border-b border-transparent focus:border-emerald-500/50 w-full placeholder-emerald-500/30 transition-all p-0"
                    placeholder="Namn"
                  />
                  <div className="flex items-center gap-2 text-xs font-medium mt-1">
                    <span className="bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">
                      {share.toFixed(1)}% av totalen
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold text-emerald-400">{formatMoney(userTotal)}</div>
                </div>
              </div>

              <div className="space-y-3 bg-slate-900/30 p-3 rounded-xl">
                
                {/* SALARY ROW */}
                <div 
                    onClick={() => handleOpenModal(user.id, 'salary', data.salary || 0)}
                    className="flex items-center gap-3 p-3 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 hover:border-emerald-500/50 rounded-xl cursor-pointer transition-all group"
                >
                  <div className="p-2 bg-slate-900 rounded-lg">{getIconForType('salary')}</div>
                  <div className="flex-1">
                      <div className="text-xs text-slate-400 font-medium uppercase">Lön (Netto)</div>
                      <div className={cn("text-lg font-mono font-bold", data.salary ? "text-white" : "text-slate-600")}>
                          {data.salary ? formatMoney(data.salary) : "Ange belopp"}
                      </div>
                  </div>
                  <ChevronRight className="text-slate-600 group-hover:text-emerald-400" size={18} />
                </div>

                {/* CHILD BENEFIT ROW */}
                <div 
                    onClick={() => handleOpenModal(user.id, 'childBenefit', data.childBenefit || 0)}
                    className="flex items-center gap-3 p-3 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 hover:border-pink-500/50 rounded-xl cursor-pointer transition-all group"
                >
                  <div className="p-2 bg-slate-900 rounded-lg">{getIconForType('childBenefit')}</div>
                  <div className="flex-1">
                      <div className="text-xs text-slate-400 font-medium uppercase">Barnbidrag</div>
                      <div className={cn("text-lg font-mono font-bold", data.childBenefit ? "text-white" : "text-slate-600")}>
                          {data.childBenefit ? formatMoney(data.childBenefit) : "Ange belopp"}
                      </div>
                  </div>
                  <ChevronRight className="text-slate-600 group-hover:text-pink-400" size={18} />
                </div>

                {/* INSURANCE ROW */}
                <div 
                    onClick={() => handleOpenModal(user.id, 'insurance', data.insurance || 0)}
                    className="flex items-center gap-3 p-3 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 hover:border-blue-500/50 rounded-xl cursor-pointer transition-all group"
                >
                  <div className="p-2 bg-slate-900 rounded-lg">{getIconForType('insurance')}</div>
                  <div className="flex-1">
                      <div className="text-xs text-slate-400 font-medium uppercase">Försäkringskassan</div>
                      <div className={cn("text-lg font-mono font-bold", data.insurance ? "text-white" : "text-slate-600")}>
                          {data.insurance ? formatMoney(data.insurance) : "Ange belopp"}
                      </div>
                  </div>
                  <ChevronRight className="text-slate-600 group-hover:text-blue-400" size={18} />
                </div>

                {/* VAB / Income Loss Section (Manuell input for now) */}
                {(data.insurance > 0 || (data.vabDays || 0) > 0 || totalLoss > 0) && (
                    <div className="mt-2 p-3 bg-rose-500/10 rounded-lg border border-rose-500/20 animate-in slide-in-from-top-2">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-xs text-rose-300 font-bold uppercase">Löneavdrag (VAB/Sjuk)</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3 mb-2">
                            <div className="flex flex-col gap-1">
                                <label className="text-[10px] text-slate-400 uppercase">Antal Dagar</label>
                                <div className="flex items-center bg-slate-900/50 rounded-xl border border-rose-500/30 focus-within:border-rose-500">
                                    <span className="pl-3 text-rose-400"><Calendar className="w-4 h-4"/></span>
                                    <input 
                                        type="number"
                                        value={data.vabDays || ''}
                                        onChange={(e) => updateUserIncome(user.id, selectedMonth, 'vabDays', Number(e.target.value))}
                                        className="w-full bg-transparent px-2 py-2 text-right text-white focus:outline-none"
                                    />
                                </div>
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-[10px] text-slate-400 uppercase">Avdrag per dag</label>
                                <input 
                                    type="number"
                                    placeholder={latestDeduction ? `${latestDeduction}` : "0"}
                                    value={data.dailyDeduction || (latestDeduction > 0 ? latestDeduction : '')}
                                    onChange={(e) => updateUserIncome(user.id, selectedMonth, 'dailyDeduction', Number(e.target.value))}
                                    className="w-full bg-slate-900/50 rounded-xl border border-rose-500/30 px-3 py-2 text-right text-white focus:outline-none focus:border-rose-500"
                                />
                            </div>
                        </div>
                        
                        <div className="flex justify-between items-center text-xs pt-1 border-t border-rose-500/10">
                           <span className="text-slate-400">Total inkomstförlust:</span>
                           <span className="text-rose-300 font-mono font-bold">-{formatMoney(totalLoss)}</span>
                        </div>
                        
                        <p className="text-[10px] text-slate-400 mt-2">
                            Detta belopp läggs tillbaka på din "teoretiska inkomst" för att rättvist beräkna din andel av fickpengarna.
                        </p>
                    </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* TRANSACTION PICKER MODAL */}
      <Modal 
        isOpen={!!activeField} 
        onClose={() => setActiveField(null)} 
        title={activeField ? `Välj inkomst: ${getLabelForType(activeField.type)}` : 'Välj inkomst'}
      >
          <div className="space-y-4">
              
              {!isManualMode && (
                  <div className="space-y-2">
                      <div className="flex justify-between items-center px-1">
                          <span className="text-xs text-slate-400 uppercase font-bold tracking-wider">Hittade transaktioner ({intervalLabel})</span>
                      </div>
                      
                      <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                          {incomeTransactions.length === 0 ? (
                              <div className="text-center py-8 text-slate-500 italic bg-slate-900/30 rounded-xl border border-slate-800">
                                  Inga inkomster hittades denna period.
                              </div>
                          ) : (
                              incomeTransactions.map(tx => {
                                  // Check if this transaction amount is likely already used by another field
                                  // Note: If the amount matches the CURRENT field's value, we consider it "Selected" not "Used by other"
                                  const isCurrentValue = activeField && manualValue && parseFloat(manualValue) === tx.amount;
                                  const isUsedElsewhere = usageMap.has(tx.id) && !isCurrentValue;

                                  return (
                                      <div 
                                        key={tx.id}
                                        onClick={() => !isUsedElsewhere && handleSelectTransaction(tx)}
                                        className={cn(
                                            "flex items-center justify-between p-3 rounded-xl border transition-all relative overflow-hidden",
                                            isCurrentValue 
                                                ? "bg-emerald-500/20 border-emerald-500 ring-1 ring-emerald-500" 
                                                : isUsedElsewhere 
                                                    ? "bg-slate-900 border-slate-800 opacity-50 grayscale cursor-not-allowed" 
                                                    : "bg-slate-800 border-slate-700 hover:bg-slate-700 cursor-pointer"
                                        )}
                                      >
                                          <div className="flex-1 min-w-0 pr-2">
                                              <div className="font-bold text-white truncate">{tx.description}</div>
                                              <div className="text-xs text-slate-400 flex items-center gap-2">
                                                  <span>{tx.date}</span>
                                                  {isUsedElsewhere && <span className="text-orange-400 flex items-center gap-1"><AlertCircle size={10}/> Redan vald</span>}
                                              </div>
                                          </div>
                                          <div className="text-right">
                                              <div className={cn("font-mono font-bold", isUsedElsewhere ? "text-slate-500" : "text-emerald-400")}>
                                                  +{formatMoney(tx.amount)}
                                              </div>
                                              {isCurrentValue && <div className="text-[10px] text-emerald-400 font-bold uppercase">Vald</div>}
                                          </div>
                                          
                                          {isCurrentValue && (
                                              <div className="absolute right-0 top-0 bottom-0 w-1 bg-emerald-500"></div>
                                          )}
                                      </div>
                                  );
                              })
                          )}
                      </div>
                  </div>
              )}

              {isManualMode ? (
                  <div className="space-y-4 pt-2 animate-in fade-in slide-in-from-right-4">
                      <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                          <label className="text-xs text-slate-400 uppercase font-bold mb-2 block">Ange belopp manuellt</label>
                          <div className="flex items-center gap-2">
                              <input 
                                type="number" 
                                className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-xl text-white font-mono focus:border-emerald-500 outline-none"
                                placeholder="0"
                                value={manualValue}
                                onChange={(e) => setManualValue(e.target.value)}
                                autoFocus
                              />
                              <span className="text-slate-500 font-bold">kr</span>
                          </div>
                          <p className="text-xs text-slate-500 mt-2 italic">
                              Används för inkomster som inte syns på banken (t.ex. kontanter eller framtida lön).
                          </p>
                      </div>
                      <div className="flex gap-2">
                          <Button variant="secondary" onClick={() => setIsManualMode(false)} className="flex-1">Avbryt</Button>
                          <Button onClick={handleSaveManual} className="flex-1 bg-emerald-600 hover:bg-emerald-500">Spara</Button>
                      </div>
                  </div>
              ) : (
                  <div className="pt-2 border-t border-slate-700">
                      <button 
                        onClick={() => setIsManualMode(true)}
                        className="w-full flex items-center justify-center gap-2 p-3 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors text-sm font-medium border border-dashed border-slate-700"
                      >
                          <Keyboard size={16} />
                          Fyll i belopp manuellt
                      </button>
                  </div>
              )}
          </div>
      </Modal>
    </div>
  );
};