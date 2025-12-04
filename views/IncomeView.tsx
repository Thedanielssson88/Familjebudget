
import React from 'react';
import { useApp } from '../store';
import { Card, Input } from '../components/components';
import { User, Wallet, Shield, Baby } from 'lucide-react';
import { formatMoney, getTotalFamilyIncome } from '../utils';

export const IncomeView: React.FC = () => {
  const { users, selectedMonth, updateUserIncome, updateUserName } = useApp();
  const totalIncome = getTotalFamilyIncome(users, selectedMonth);

  return (
    <div className="space-y-6 pb-24 animate-in slide-in-from-right duration-300">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">Inkomstkällor</h1>
        <p className="text-slate-400">Total inkomst för familjen denna månad</p>
        <div className="mt-4 text-4xl font-mono font-bold text-white tracking-tight">
          {formatMoney(totalIncome)}
        </div>
      </header>

      <div className="grid gap-4">
        {users.map(user => {
          const data = user.incomeData[selectedMonth] || { salary: 0, childBenefit: 0, insurance: 0 };
          const userTotal = (data.salary || 0) + (data.childBenefit || 0) + (data.insurance || 0);
          const share = totalIncome > 0 ? (userTotal / totalIncome) * 100 : 0;

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
                <div className="flex items-center gap-3">
                  <Wallet className="w-5 h-5 text-slate-500" />
                  <Input 
                    type="number" 
                    placeholder="Lön (Netto)" 
                    value={data.salary || ''} 
                    onChange={(e) => updateUserIncome(user.id, selectedMonth, 'salary', Number(e.target.value))}
                    className="flex-1 py-2 text-right"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Baby className="w-5 h-5 text-slate-500" />
                  <Input 
                    type="number" 
                    placeholder="Barnbidrag" 
                    value={data.childBenefit || ''} 
                    onChange={(e) => updateUserIncome(user.id, selectedMonth, 'childBenefit', Number(e.target.value))}
                    className="flex-1 py-2 text-right"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Shield className="w-5 h-5 text-slate-500" />
                  <Input 
                    type="number" 
                    placeholder="Försäkringskassan/Övrigt" 
                    value={data.insurance || ''} 
                    onChange={(e) => updateUserIncome(user.id, selectedMonth, 'insurance', Number(e.target.value))}
                    className="flex-1 py-2 text-right"
                  />
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
