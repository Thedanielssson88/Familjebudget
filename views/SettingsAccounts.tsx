
import React, { useState } from 'react';
import { useApp } from '../store';
import { Trash2, Plus } from 'lucide-react';
import { Button, Input, Modal } from '../components/components';
import { Account } from '../types';

export const SettingsAccounts: React.FC = () => {
  const { accounts, addAccount, updateAccount, deleteAccount } = useApp();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Partial<Account>>({});

  const handleSave = async () => {
    if (!editingAccount.name) return;
    
    if (editingAccount.id) {
        // Uppdatera befintligt
        await updateAccount(editingAccount as Account);
    } else {
        // Skapa nytt (ID genereras i store)
        await addAccount(editingAccount.name, editingAccount.type || 'CHECKING', editingAccount.icon || '💳');
    }
    setIsModalOpen(false);
  };

  const openNew = () => {
      setEditingAccount({ name: '', type: 'CHECKING', icon: '💳' });
      setIsModalOpen(true);
  };

  const openEdit = (acc: Account) => {
      setEditingAccount(acc);
      setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
      if(confirm('Är du säker på att du vill ta bort detta konto?')) {
          await deleteAccount(id);
      }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-2">
         <h3 className="font-bold text-sm text-slate-400 uppercase">Dina Konton</h3>
      </div>

      <div className="space-y-2">
        {accounts.map(acc => (
          <div key={acc.id} className="bg-slate-800 p-3 rounded-lg border border-slate-700 flex justify-between items-center group">
             <div className="flex items-center gap-3 cursor-pointer flex-1" onClick={() => openEdit(acc)}>
                 <div className="text-xl bg-slate-900 p-2 rounded">{acc.icon}</div>
                 <div>
                     <div className="font-bold text-white text-sm">{acc.name}</div>
                     <div className="text-[10px] text-slate-500 uppercase">
                        {acc.type === 'CHECKING' && 'Brukskonto'}
                        {acc.type === 'SAVINGS' && 'Sparkonto'}
                        {acc.type === 'CREDIT' && 'Kreditkort'}
                     </div>
                 </div>
             </div>
             <button 
                onClick={() => handleDelete(acc.id)} 
                className="text-slate-600 hover:text-rose-400 p-2 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Ta bort konto"
             >
                 <Trash2 size={14} />
             </button>
          </div>
        ))}
      </div>

      <Button variant="secondary" onClick={openNew} className="w-full border-dashed border-slate-700">
          <Plus size={16} className="mr-2"/> Lägg till konto
      </Button>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingAccount.id ? "Redigera Konto" : "Nytt Konto"}>
          <div className="space-y-4">
              <Input 
                label="Namn på kontot" 
                value={editingAccount.name || ''} 
                onChange={e => setEditingAccount({...editingAccount, name: e.target.value})} 
                autoFocus
              />
              
              <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">Kontotyp</label>
                  <select 
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500"
                    value={editingAccount.type || 'CHECKING'}
                    onChange={e => setEditingAccount({...editingAccount, type: e.target.value})}
                  >
                      <option value="CHECKING">Lönekonto / Brukskonto</option>
                      <option value="SAVINGS">Sparkonto</option>
                      <option value="CREDIT">Kreditkort</option>
                  </select>
              </div>

              <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">Välj Ikon</label>
                  <div className="flex gap-2">
                      {['💳', '🏦', '💰', '🐷', '💎', '🏠', '🚗'].map(icon => (
                          <button 
                            key={icon}
                            onClick={() => setEditingAccount({...editingAccount, icon})}
                            className={`text-2xl p-2 rounded-lg border transition-all ${editingAccount.icon === icon ? 'bg-blue-600 border-blue-400 scale-110' : 'bg-slate-800 border-slate-700 hover:bg-slate-700'}`}
                          >
                              {icon}
                          </button>
                      ))}
                  </div>
              </div>

              <Button onClick={handleSave} className="w-full">Spara</Button>
          </div>
      </Modal>
    </div>
  );
};
