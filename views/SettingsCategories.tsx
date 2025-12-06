import React, { useState } from 'react';
import { useApp } from '../store';
import { ChevronRight, ChevronDown, Plus, Trash2, RefreshCw } from 'lucide-react';
import { Button, Input, Modal } from '../components/components';

export const SettingsCategories: React.FC = () => {
  const { mainCategories, subCategories, addMainCategory, deleteMainCategory, addSubCategory, deleteSubCategory, resetCategoriesToDefault } = useApp();
  
  const [expandedMain, setExpandedMain] = useState<string | null>(null);
  const [newMainName, setNewMainName] = useState('');
  const [newSubName, setNewSubName] = useState('');
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);

  const toggleExpand = (id: string) => {
    setExpandedMain(expandedMain === id ? null : id);
  };

  const handleAddMain = () => {
    if (newMainName.trim()) {
      addMainCategory(newMainName);
      setNewMainName('');
    }
  };

  const handleAddSub = (mainId: string) => {
    if (newSubName.trim()) {
      addSubCategory(mainId, newSubName);
      setNewSubName('');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
          <h3 className="text-lg font-bold text-slate-200">Kategoriträd</h3>
          <button 
            onClick={() => setIsResetModalOpen(true)}
            className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
          >
            <RefreshCw size={12} /> Återställ standard
          </button>
      </div>

      {/* Lägg till Huvudkategori */}
      <div className="flex gap-2">
          <Input 
            placeholder="Ny Huvudkategori..." 
            value={newMainName} 
            onChange={e => setNewMainName(e.target.value)} 
            className="bg-slate-800 border-slate-700"
          />
          <Button onClick={handleAddMain} disabled={!newMainName} className="w-auto px-4">
              <Plus size={20} />
          </Button>
      </div>

      {/* Listan */}
      <div className="space-y-2">
          {mainCategories.map(main => {
              const subs = subCategories.filter(s => s.mainCategoryId === main.id);
              const isExpanded = expandedMain === main.id;

              return (
                  <div key={main.id} className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
                      <div 
                        className="p-3 flex items-center justify-between cursor-pointer hover:bg-slate-700/50 transition-colors"
                        onClick={() => toggleExpand(main.id)}
                      >
                          <div className="flex items-center gap-2">
                              {isExpanded ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                              <span className="font-bold text-white">{main.name}</span>
                              <span className="text-xs text-slate-500 bg-slate-900 px-2 py-0.5 rounded-full">{subs.length}</span>
                          </div>
                          <button 
                             onClick={(e) => { e.stopPropagation(); deleteMainCategory(main.id); }}
                             className="p-2 text-slate-500 hover:text-red-400 hover:bg-slate-900 rounded-full transition-colors"
                          >
                              <Trash2 size={16} />
                          </button>
                      </div>

                      {/* Underkategorier */}
                      {isExpanded && (
                          <div className="bg-slate-900/50 p-3 border-t border-slate-700 space-y-2">
                              {subs.map(sub => (
                                  <div key={sub.id} className="flex items-center justify-between pl-8 pr-2 py-2 rounded hover:bg-slate-800 group">
                                      <span className="text-sm text-slate-300">{sub.name}</span>
                                      <button 
                                         onClick={() => deleteSubCategory(sub.id)}
                                         className="text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                      >
                                          <Trash2 size={14} />
                                      </button>
                                  </div>
                              ))}
                              
                              {/* Lägg till Underkategori */}
                              <div className="flex gap-2 pl-6 mt-2 pt-2 border-t border-slate-700/50">
                                  <input 
                                    className="flex-1 bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                                    placeholder={`Ny underkategori till ${main.name}...`}
                                    value={newSubName}
                                    onChange={e => setNewSubName(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleAddSub(main.id)}
                                  />
                                  <button 
                                    onClick={() => handleAddSub(main.id)} 
                                    disabled={!newSubName}
                                    className="bg-indigo-600 hover:bg-indigo-500 text-white p-1.5 rounded"
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

      {/* Reset Modal */}
      <Modal isOpen={isResetModalOpen} onClose={() => setIsResetModalOpen(false)} title="Återställ Kategorier">
          <div className="space-y-4">
              <p className="text-slate-300">
                  Är du säker? Detta kommer ta bort alla dina egna kategorier och återställa standardlistan.
                  Dina transaktioner kommer behållas men kan tappa sin kategorikoppling.
              </p>
              <div className="flex gap-2">
                  <Button onClick={() => { resetCategoriesToDefault(); setIsResetModalOpen(false); }} variant="danger" className="flex-1">Ja, återställ</Button>
                  <Button onClick={() => setIsResetModalOpen(false)} variant="secondary" className="flex-1">Avbryt</Button>
              </div>
          </div>
      </Modal>
    </div>
  );
};