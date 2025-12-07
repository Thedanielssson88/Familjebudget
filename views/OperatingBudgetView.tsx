import React, { useMemo, useState } from 'react';
import { useApp } from '../store';
import { formatMoney, getEffectiveBudgetGroupData } from '../utils';
import { ChevronRight, ChevronDown, Check, AlertTriangle, PieChart, Edit2, Plus, Wallet, Trash2, X, Settings } from 'lucide-react';
import { BudgetProgressBar } from '../components/BudgetProgressBar';
import { cn, Button, Modal, Input } from '../components/components';
import { BudgetGroup, SubCategory } from '../types';

export const OperatingBudgetView: React.FC = () => {
  const { selectedMonth, budgetGroups, subCategories, mainCategories, transactions, addBudgetGroup, updateBudgetGroup, deleteBudgetGroup, updateSubCategory, addSubCategory } = useApp();
  
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedMains, setExpandedMains] = useState<Set<string>>(new Set());
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<BudgetGroup | null>(null);
  const [editingLimit, setEditingLimit] = useState<number>(0);
  const [deleteMode, setDeleteMode] = useState(false);
  
  // New Category State (inside modal)
  const [newSubName, setNewSubName] = useState('');
  const [selectedMainId, setSelectedMainId] = useState('');

  // --- DATA PROCESSING ---
  const data = useMemo(() => {
    // 1. Filter Transactions (Expenses Only for this Month)
    const txForMonth = transactions.filter(t => 
        t.date.startsWith(selectedMonth) && 
        (t.type === 'EXPENSE' || (!t.type && t.amount < 0))
    );

    // 2. Build Hierarchy per Budget Group
    const groupStats = budgetGroups.map(group => {
        // Resolve limit for current month
        const { data: monthlyData } = getEffectiveBudgetGroupData(group, selectedMonth);
        const monthlyLimit = monthlyData?.limit || 0;
        const isDeleted = monthlyData?.isExplicitlyDeleted;

        // Skip if deleted for this month (unless CatchAll)
        if (isDeleted && !group.isCatchAll) return null;

        // Find all subcategories explicitly assigned to this group
        const assignedSubs = subCategories.filter(s => s.budgetGroupId === group.id);
        const assignedSubIds = new Set(assignedSubs.map(s => s.id));
        
        // Filter transactions belonging to this group
        const groupTxs = txForMonth.filter(t => {
            if (t.categorySubId && assignedSubIds.has(t.categorySubId)) return true;
            if (group.isCatchAll) {
                if (!t.categorySubId) return true;
                const sub = subCategories.find(s => s.id === t.categorySubId);
                if (!sub || !sub.budgetGroupId) return true;
            }
            return false;
        });

        // Sum total spent for Group
        const groupSpent = groupTxs.reduce((sum, t) => sum + Math.abs(t.amount), 0);

        // Group by Main Category within this Budget Group
        const relevantMainIds = new Set<string>();
        assignedSubs.forEach(s => relevantMainIds.add(s.mainCategoryId));
        groupTxs.forEach(t => {
            if (t.categoryMainId) relevantMainIds.add(t.categoryMainId);
        });

        const mainStats = Array.from(relevantMainIds).map(mainId => {
            const mainCat = mainCategories.find(m => m.id === mainId);
            const mainName = mainCat?.name || (group.isCatchAll ? 'Ospecificerat' : 'Okänd Huvudkategori');

            const mainTxs = groupTxs.filter(t => {
                if (t.categoryMainId) return t.categoryMainId === mainId;
                return false;
            });
            
            const relevantSubs = assignedSubs.filter(s => s.mainCategoryId === mainId);
            
            const subStats = relevantSubs.map(sub => {
                const subTxs = mainTxs.filter(t => t.categorySubId === sub.id);
                const subSpent = subTxs.reduce((sum, t) => sum + Math.abs(t.amount), 0);
                return {
                    id: sub.id,
                    name: sub.name,
                    spent: subSpent,
                    transactions: subTxs
                };
            }).sort((a,b) => b.spent - a.spent);

            const unassignedInMain = mainTxs.filter(t => !t.categorySubId).reduce((sum, t) => sum + Math.abs(t.amount), 0);
            
            if (unassignedInMain > 0) {
                subStats.push({
                    id: `unassigned-${mainId}`,
                    name: 'Ospecificerat',
                    spent: unassignedInMain,
                    transactions: mainTxs.filter(t => !t.categorySubId)
                });
            }

            const mainSpent = mainTxs.reduce((sum, t) => sum + Math.abs(t.amount), 0);

            return {
                id: mainId,
                name: mainName,
                spent: mainSpent,
                subs: subStats
            };
        }).filter(m => m.subs.length > 0 || m.spent > 0).sort((a,b) => b.spent - a.spent);
          
        const totalAllocatedToMains = mainStats.reduce((sum, m) => sum + m.spent, 0);
        const orphanSpent = groupSpent - totalAllocatedToMains;
        
        if (orphanSpent > 0.01) {
             mainStats.push({
                 id: 'orphan',
                 name: 'Helt okategoriserat',
                 spent: orphanSpent,
                 subs: [{
                     id: 'orphan-sub',
                     name: 'Transaktioner utan kategori',
                     spent: orphanSpent,
                     transactions: groupTxs.filter(t => !t.categoryMainId)
                 }]
             });
        }

        return {
            ...group,
            monthlyLimit, // Resolved monthly limit
            spent: groupSpent,
            mains: mainStats
        };

    }).filter((g): g is NonNullable<typeof g> => g !== null)
      .sort((a, b) => {
        if (a.isCatchAll) return 1;
        if (b.isCatchAll) return -1;
        return a.name.localeCompare(b.name);
    });

    const totalLimit = groupStats.reduce((sum, g) => sum + g.monthlyLimit, 0);
    const totalSpent = groupStats.reduce((sum, g) => sum + g.spent, 0);

    return { groupStats, totalLimit, totalSpent };

  }, [transactions, selectedMonth, budgetGroups, subCategories, mainCategories]);

  // --- HANDLERS ---
  const toggleGroup = (id: string) => {
      const next = new Set(expandedGroups);
      if (next.has(id)) next.delete(id); else next.add(id);
      setExpandedGroups(next);
  };

  const toggleMain = (id: string) => {
      const next = new Set(expandedMains);
      if (next.has(id)) next.delete(id); else next.add(id);
      setExpandedMains(next);
  };

  const openModal = (group?: BudgetGroup) => {
      setDeleteMode(false);
      if (group) {
          setEditingGroup(group);
          const { data } = getEffectiveBudgetGroupData(group, selectedMonth);
          setEditingLimit(data?.limit || 0);
      } else {
          setEditingGroup({
              id: '',
              name: '',
              icon: '📁',
              monthlyData: {}
          });
          setEditingLimit(0);
      }
      setIsModalOpen(true);
  };

  const handleSaveGroup = async () => {
      if (!editingGroup) return;

      if (!editingGroup.id) {
          // New Group
          await addBudgetGroup(editingGroup.name || 'Ny Grupp', editingLimit, editingGroup.icon || '📁');
      } else {
          // Update Existing
          const updatedGroup = {
              ...editingGroup,
              monthlyData: {
                  ...editingGroup.monthlyData,
                  [selectedMonth]: { limit: editingLimit, isExplicitlyDeleted: false }
              }
          };
          await updateBudgetGroup(updatedGroup);
      }
      setIsModalOpen(false);
  };

  const handleDelete = (scope: 'THIS_MONTH' | 'THIS_AND_FUTURE' | 'ALL') => {
      if (editingGroup?.id) {
          deleteBudgetGroup(editingGroup.id, selectedMonth, scope);
          setIsModalOpen(false);
      }
  };

  const handleAddSubCategory = async () => {
      if (!newSubName.trim() || !selectedMainId || !editingGroup?.id) return;
      
      const newId = await addSubCategory(selectedMainId, newSubName);
      
      // Fetch the object to ensure we have the full SubCategory structure (though we know the defaults)
      const sub: SubCategory = { 
          id: newId, 
          mainCategoryId: selectedMainId, 
          name: newSubName 
      };
      
      // Link it to current budget group
      await updateSubCategory({ ...sub, budgetGroupId: editingGroup.id });
      
      setNewSubName('');
  };

  // Helper to remove category from group
  const handleRemoveCategory = (sub: SubCategory) => {
      updateSubCategory({ ...sub, budgetGroupId: undefined });
  };

  return (
    <div className="space-y-6 pb-24 animate-in slide-in-from-right duration-300">
      <header>
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-2 rounded-xl text-white">
                <PieChart className="w-6 h-6" />
            </div>
            <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-400">Driftbudget</h1>
          </div>
          <p className="text-slate-400">Uppföljning av kostnader per Budgetgrupp och Kategori.</p>
      </header>

      {/* DASHBOARD SUMMARY */}
      <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700 flex justify-between items-center shadow-lg">
          <div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Total Driftbudget</div>
              <div className="text-2xl font-mono font-bold text-white">{formatMoney(data.totalLimit)}</div>
          </div>
          <div className="text-right">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Totalt Utfall</div>
              <div className={cn("text-2xl font-mono font-bold", data.totalSpent > data.totalLimit ? "text-rose-400" : "text-emerald-400")}>
                  {formatMoney(data.totalSpent)}
              </div>
          </div>
      </div>
      
      <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
         <div 
            className={cn("h-full transition-all duration-500", data.totalSpent > data.totalLimit ? "bg-rose-500" : "bg-emerald-500")}
            style={{ width: `${Math.min((data.totalSpent / (data.totalLimit || 1))*100, 100)}%` }}
         />
      </div>

      {/* BUDGET GROUPS */}
      <div className="space-y-4">
          {data.groupStats.map(group => {
              const isExpanded = expandedGroups.has(group.id);
              const remaining = group.monthlyLimit - group.spent;
              const isOver = remaining < 0;

              return (
                  <div key={group.id} className={cn("bg-surface rounded-xl overflow-hidden border transition-all shadow-md", group.isCatchAll ? "border-dashed border-slate-600" : "border-slate-700")}>
                      {/* GROUP HEADER */}
                      <div 
                        className="p-4 cursor-pointer hover:bg-slate-800/80 transition-colors"
                        onClick={() => toggleGroup(group.id)}
                      >
                          <div className="flex justify-between items-start mb-2">
                              <div className="flex items-center gap-3">
                                  {isExpanded ? <ChevronDown className="w-5 h-5 text-emerald-400"/> : <ChevronRight className="w-5 h-5 text-slate-500"/>}
                                  <div>
                                      <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                          {group.icon} {group.name}
                                          {isOver && <AlertTriangle className="w-4 h-4 text-rose-500" />}
                                      </h3>
                                      {group.isCatchAll && <span className="text-[10px] text-orange-400 uppercase font-bold bg-orange-500/10 px-1 rounded">Övrigt</span>}
                                  </div>
                              </div>
                              
                              <div className="flex items-center justify-end gap-2 group/edit">
                                  <span className="font-mono font-bold text-white">{formatMoney(group.spent)}</span>
                                  <span className="text-slate-500 text-xs">/ {formatMoney(group.monthlyLimit)}</span>
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); openModal(group); }} 
                                    className="p-1 text-slate-500 hover:text-white transition-colors"
                                  >
                                      <Settings size={14} />
                                  </button>
                              </div>
                          </div>
                          <BudgetProgressBar spent={group.spent} total={group.monthlyLimit} />
                      </div>

                      {/* MAIN CATEGORIES (Level 2) */}
                      {isExpanded && (
                          <div className="bg-slate-900/30 border-t border-slate-700/50">
                              {group.mains.length === 0 && (
                                  <div className="p-4 text-center text-sm text-slate-500 italic">Inga utgifter registrerade.</div>
                              )}
                              
                              {group.mains.map(main => {
                                  const mainKey = `${group.id}-${main.id}`;
                                  const isMainExpanded = expandedMains.has(mainKey);
                                  
                                  return (
                                      <div key={mainKey} className="border-b border-slate-700/30 last:border-0">
                                          <div 
                                            className="px-4 py-3 flex justify-between items-center cursor-pointer hover:bg-slate-800/40"
                                            onClick={() => toggleMain(mainKey)}
                                          >
                                              <div className="flex items-center gap-2 pl-4">
                                                   {isMainExpanded ? <ChevronDown className="w-4 h-4 text-slate-400"/> : <ChevronRight className="w-4 h-4 text-slate-600"/>}
                                                   <span className="text-sm font-medium text-slate-200">{main.name}</span>
                                              </div>
                                              <div className="text-sm font-mono text-slate-300">
                                                  {formatMoney(main.spent)}
                                              </div>
                                          </div>

                                          {/* SUB CATEGORIES (Level 3) */}
                                          {isMainExpanded && (
                                              <div className="bg-slate-950/30 pb-2">
                                                  {main.subs.map(sub => (
                                                      <div key={sub.id} className="pl-12 pr-4 py-2 flex justify-between items-start text-xs hover:bg-white/5">
                                                          <div className="flex flex-col">
                                                              <span className="text-slate-400 font-medium">{sub.name}</span>
                                                              <span className="text-[10px] text-slate-600">{sub.transactions.length} transaktioner</span>
                                                          </div>
                                                          <div className="text-right">
                                                              <span className="text-slate-300 font-mono">{formatMoney(sub.spent)}</span>
                                                          </div>
                                                      </div>
                                                  ))}
                                              </div>
                                          )}
                                      </div>
                                  );
                              })}
                          </div>
                      )}
                  </div>
              );
          })}

          <Button variant="secondary" onClick={() => openModal()} className="w-full border-dashed border-slate-700 py-4 text-slate-400 hover:text-white mt-8">
              <Plus className="w-5 h-5 mr-2" /> Skapa ny budgetgrupp
          </Button>
      </div>

      {/* EDIT MODAL */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingGroup?.id ? `Redigera ${editingGroup.name}` : "Ny Budgetgrupp"}>
          {editingGroup && (
              <div className="space-y-6">
                  {/* Basic Info */}
                  <div className="space-y-4">
                      <Input label="Namn" value={editingGroup.name} onChange={e => setEditingGroup({...editingGroup, name: e.target.value})} autoFocus={!editingGroup.id} />
                      
                      <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2 text-center">
                              Budget för månaden (Limit)
                          </label>
                          <div className="flex items-center justify-center gap-2">
                              <input 
                                type="number" 
                                value={editingLimit || ''} 
                                onChange={e => setEditingLimit(Number(e.target.value))} 
                                className="bg-transparent text-4xl font-mono font-bold text-center text-white w-full focus:outline-none placeholder-slate-700"
                                placeholder="0"
                              />
                              <span className="text-slate-500">kr</span>
                          </div>
                      </div>

                      {/* Icon */}
                      <div>
                          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">Ikon</label>
                          <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                              {['🏠','🚗','🍔','💊','🎉','👶','🔧','🧥','🛒','✈️','🐶'].map(icon => (
                                  <button 
                                    key={icon}
                                    onClick={() => setEditingGroup({...editingGroup, icon})}
                                    className={cn("w-10 h-10 rounded-lg flex items-center justify-center text-xl transition-all", editingGroup.icon === icon ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-400 hover:bg-slate-700")}
                                  >
                                      {icon}
                                  </button>
                              ))}
                          </div>
                      </div>
                  </div>

                  {/* Subcategory Management (Only for existing groups) */}
                  {editingGroup.id && !editingGroup.isCatchAll && (
                      <div className="border-t border-slate-700 pt-4 space-y-4">
                          <h3 className="text-sm font-bold text-white">Kopplade Kategorier</h3>
                          
                          <div className="flex flex-wrap gap-2">
                              {subCategories.filter(s => s.budgetGroupId === editingGroup.id).map(sub => (
                                  <div key={sub.id} className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-300 flex items-center gap-2 group">
                                      {sub.name}
                                      <button 
                                        onClick={() => handleRemoveCategory(sub)}
                                        className="text-slate-500 hover:text-red-300"
                                        title="Ta bort från grupp"
                                      >
                                          ×
                                      </button>
                                  </div>
                              ))}
                              {subCategories.filter(s => s.budgetGroupId === editingGroup.id).length === 0 && (
                                  <span className="text-xs text-slate-500 italic">Inga kategorier kopplade än.</span>
                              )}
                          </div>

                          <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-800">
                              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">Koppla befintlig kategori</label>
                              <select 
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                                onChange={(e) => {
                                    const sub = subCategories.find(s => s.id === e.target.value);
                                    if (sub) updateSubCategory({ ...sub, budgetGroupId: editingGroup.id });
                                }}
                                value=""
                              >
                                  <option value="">-- Välj kategori --</option>
                                  {subCategories.filter(s => !s.budgetGroupId).map(s => (
                                      <option key={s.id} value={s.id}>{s.name} (Okopplad)</option>
                                  ))}
                                  <optgroup label="Redan kopplade (Flytta hit)">
                                      {subCategories.filter(s => s.budgetGroupId && s.budgetGroupId !== editingGroup.id).map(s => (
                                          <option key={s.id} value={s.id}>{s.name}</option>
                                      ))}
                                  </optgroup>
                              </select>
                          </div>

                          {/* CREATE NEW SUB CATEGORY */}
                          <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-800 flex gap-2 items-center">
                              <select 
                                className="w-1/3 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                                value={selectedMainId}
                                onChange={(e) => setSelectedMainId(e.target.value)}
                              >
                                  <option value="">Huvudkategori</option>
                                  {mainCategories.map(m => (
                                      <option key={m.id} value={m.id}>{m.name}</option>
                                  ))}
                              </select>
                              <input 
                                placeholder="Ny underkategori..." 
                                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                                value={newSubName}
                                onChange={(e) => setNewSubName(e.target.value)}
                              />
                              <Button onClick={handleAddSubCategory} disabled={!newSubName || !selectedMainId} className="px-3 py-2">
                                  <Plus className="w-4 h-4" />
                              </Button>
                          </div>
                      </div>
                  )}

                  {!deleteMode ? (
                      <div className="flex gap-3 pt-2">
                          {editingGroup.id && !editingGroup.isCatchAll && (
                              <Button variant="danger" onClick={() => setDeleteMode(true)}>
                                  <Trash2 className="w-4 h-4" />
                              </Button>
                          )}
                          <Button className="flex-1" onClick={handleSaveGroup}>Spara</Button>
                      </div>
                  ) : (
                      <div className="space-y-2 bg-red-950/20 p-4 rounded-xl border border-red-500/20">
                          <h4 className="text-sm font-bold text-red-300">Ta bort grupp?</h4>
                          <Button variant="danger" className="w-full justify-start text-sm" onClick={() => handleDelete('THIS_MONTH')}>Enbart denna månad</Button>
                          <Button variant="danger" className="w-full justify-start text-sm" onClick={() => handleDelete('THIS_AND_FUTURE')}>Denna och framtida</Button>
                          <Button variant="danger" className="w-full justify-start text-sm" onClick={() => handleDelete('ALL')}>Radera helt</Button>
                          <Button variant="secondary" className="w-full" onClick={() => setDeleteMode(false)}>Avbryt</Button>
                      </div>
                  )}
              </div>
          )}
      </Modal>
    </div>
  );
};