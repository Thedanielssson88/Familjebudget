
import React, { useState } from 'react';
import { useApp } from '../store';
import { ChevronRight, ChevronDown, Plus, Trash2, RefreshCw, PiggyBank } from 'lucide-react';
import { Button, Input, Modal, cn } from '../components/components';
import { EmojiPickerModal } from '../components/EmojiPicker';

export const SettingsCategories: React.FC = () => {
  const { 
    mainCategories, subCategories, 
    addMainCategory, deleteMainCategory, 
    addSubCategory, deleteSubCategory,
    updateSubCategory,
    resetCategoriesToDefault
  } = useApp();

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [newMainName, setNewMainName] = useState('');
  const [newSubNames, setNewSubNames] = useState<Record<string, string>>({});
  const [newSubIsSavings, setNewSubIsSavings] = useState<Record<string, boolean>>({});
  const [showResetModal, setShowResetModal] = useState(false);
  
  // Icon Picker State
  const [iconPickerTarget, setIconPickerTarget] = useState<{ id: string, name: string } | null>(null);

  const toggleExpand = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  };

  const handleAddMain = async () => {
    if (!newMainName.trim()) return;
    await addMainCategory(newMainName.trim());
    setNewMainName('');
  };

  const handleAddSub = async (mainId: string) => {
    const name = newSubNames[mainId];
    const isSavings = newSubIsSavings[mainId] || false;
    if (!name?.trim()) return;
    await addSubCategory(mainId, name.trim(), isSavings);
    setNewSubNames(prev => ({ ...prev, [mainId]: '' }));
    setNewSubIsSavings(prev => ({ ...prev, [mainId]: false }));
  };

  const handleIconSelect = async (emoji: string) => {
      if (!iconPickerTarget) return;
      const sub = subCategories.find(s => s.id === iconPickerTarget.id);
      if (sub) await updateSubCategory({ ...sub, icon: emoji });
      setIconPickerTarget(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-2">
         <h3 className="font-bold text-sm text-slate-400 uppercase">Kategorier</h3>
         <button 
           onClick={() => setShowResetModal(true)}
           className="text-xs flex items-center gap-1 text-slate-500 hover:text-white transition-colors"
         >
           <RefreshCw size={12} /> Återställ standards
         </button>
      </div>

      <div className="space-y-2">
        {mainCategories.map(main => {
          const isExpanded = expanded.has(main.id);
          const subs = subCategories.filter(s => s.mainCategoryId === main.id);

          return (
            <div key={main.id} className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
              <div 
                className="flex items-center justify-between p-3 cursor-pointer hover:bg-slate-700/50"
                onClick={() => toggleExpand(main.id)}
              >
                <div className="flex items-center gap-2">
                  {isExpanded ? <ChevronDown size={16} className="text-blue-400" /> : <ChevronRight size={16} className="text-slate-500" />}
                  <span className="font-medium text-white">{main.name}</span>
                  <span className="text-xs text-slate-500">({subs.length})</span>
                </div>
                <button 
                  onClick={(e) => { e.stopPropagation(); deleteMainCategory(main.id); }}
                  className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {isExpanded && (
                <div className="bg-slate-900/50 border-t border-slate-700 p-3 space-y-2 animate-in slide-in-from-top-1">
                  {subs.map(sub => (
                    <div key={sub.id} className="flex items-center justify-between pl-6 pr-2 py-1.5 rounded hover:bg-white/5 group">
                       <div className="flex items-center gap-3">
                           <button 
                             onClick={() => setIconPickerTarget({ id: sub.id, name: sub.name })}
                             className="w-8 h-8 flex items-center justify-center bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors"
                           >
                             {sub.icon || (sub.isSavings ? "💰" : "💳")}
                           </button>
                           <span className="text-sm text-slate-300">{sub.name}</span>
                           {sub.isSavings && <PiggyBank size={12} className="text-emerald-400" />}
                       </div>
                       <button 
                         onClick={() => deleteSubCategory(sub.id)}
                         className="opacity-0 group-hover:opacity-100 p-1 text-slate-600 hover:text-rose-400 transition-all"
                       >
                         <Trash2 size={12} />
                       </button>
                    </div>
                  ))}
                  
                  {/* Add Sub Input */}
                  <div className="flex gap-2 pl-6 mt-2 pt-2 border-t border-slate-700/50">
                    <input 
                      type="text"
                      placeholder="Ny underkategori..."
                      className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm text-white focus:border-blue-500 outline-none"
                      value={newSubNames[main.id] || ''}
                      onChange={(e) => setNewSubNames(prev => ({ ...prev, [main.id]: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddSub(main.id)}
                    />
                    <button 
                      onClick={() => setNewSubIsSavings(prev => ({ ...prev, [main.id]: !prev[main.id] }))}
                      className={cn("p-1.5 rounded transition-colors", newSubIsSavings[main.id] ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-500 border border-slate-600")}
                      title="Markera som sparande"
                    >
                      <PiggyBank size={16} />
                    </button>
                    <button 
                      onClick={() => handleAddSub(main.id)}
                      disabled={!newSubNames[main.id]?.trim()}
                      className="p-1.5 bg-blue-600 text-white rounded hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <EmojiPickerModal
        isOpen={!!iconPickerTarget}
        onClose={() => setIconPickerTarget(null)}
        onSelect={handleIconSelect}
        title={iconPickerTarget ? `Ikon för ${iconPickerTarget.name}` : undefined}
      />

      {/* Add Main Input */}
      <div className="flex gap-2 pt-2">
        <input 
          type="text"
          placeholder="Ny huvudkategori..."
          className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 outline-none"
          value={newMainName}
          onChange={(e) => setNewMainName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddMain()}
        />
        <Button onClick={handleAddMain} disabled={!newMainName.trim()} className="py-2 px-3">
          <Plus size={18} />
        </Button>
      </div>

      <Modal isOpen={showResetModal} onClose={() => setShowResetModal(false)} title="Återställ kategorier">
         <div className="space-y-4">
            <p className="text-slate-300">
              Är du säker? Detta tar bort alla dina egna kategorier och återställer till standardlistan.
            </p>
            <div className="flex gap-2">
               <Button variant="danger" className="flex-1" onClick={async () => { await resetCategoriesToDefault(); setShowResetModal(false); }}>
                 Ja, återställ
               </Button>
               <Button variant="secondary" className="flex-1" onClick={() => setShowResetModal(false)}>
                 Avbryt
               </Button>
            </div>
         </div>
      </Modal>
    </div>
  );
};
