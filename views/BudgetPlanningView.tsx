
import React, { useState } from 'react';
import { useApp } from '../store';
import { cn, Button, Modal, Input } from '../components/components';
import { format, addMonths, parseISO, startOfYear, endOfYear, eachMonthOfInterval } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Calendar, ChevronRight, ChevronLeft, Copy, Edit2, Plus, Check, Lock, Unlock, RotateCcw } from 'lucide-react';

export const BudgetPlanningView: React.FC = () => {
    const { budgetTemplates, monthConfigs, addTemplate, updateTemplate, assignTemplateToMonth, selectedMonth, toggleMonthLock, resetMonthToTemplate } = useApp();
    const [viewYear, setViewYear] = useState(new Date().getFullYear());
    
    // Create/Edit Template
    const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
    const [newTemplateName, setNewTemplateName] = useState('');
    const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);

    const monthsInYear = eachMonthOfInterval({
        start: startOfYear(new Date(viewYear, 0, 1)),
        end: endOfYear(new Date(viewYear, 0, 1))
    });

    const getTemplateForMonth = (monthKey: string) => {
        const config = monthConfigs.find(c => c.monthKey === monthKey);
        if (config?.templateId) {
            return budgetTemplates.find(t => t.id === config.templateId);
        }
        return budgetTemplates.find(t => t.isDefault);
    };

    const handleCreateTemplate = async () => {
        if (!newTemplateName) return;
        
        if (editingTemplateId) {
            const t = budgetTemplates.find(t => t.id === editingTemplateId);
            if (t) {
                await updateTemplate({ ...t, name: newTemplateName });
            }
        } else {
            // New template creates a copy from currently selected month's structure
            await addTemplate(newTemplateName, selectedMonth); 
        }
        setIsTemplateModalOpen(false);
        setNewTemplateName('');
        setEditingTemplateId(null);
    };

    return (
        <div className="space-y-6 animate-in fade-in">
            {/* Header / Year Navigation */}
            <div className="flex items-center justify-between bg-slate-800 p-4 rounded-xl border border-slate-700">
                <button onClick={() => setViewYear(y => y - 1)} className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white"><ChevronLeft /></button>
                <div className="text-center">
                    <h2 className="text-xl font-bold text-white">{viewYear}</h2>
                    <p className="text-xs text-slate-400 uppercase tracking-wider">Årsplanering</p>
                </div>
                <button onClick={() => setViewYear(y => y + 1)} className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white"><ChevronRight /></button>
            </div>

            {/* Template List (Quick Access) */}
            <div className="space-y-2">
                <div className="flex justify-between items-center px-1">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Dina Budgetmallar</h3>
                    <button 
                        onClick={() => { setEditingTemplateId(null); setNewTemplateName(''); setIsTemplateModalOpen(true); }}
                        className="text-xs flex items-center gap-1 text-blue-400 hover:text-white"
                    >
                        <Plus size={12} /> Ny Mall
                    </button>
                </div>
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
                    {budgetTemplates.map(t => (
                        <div key={t.id} className={cn("bg-slate-800 border border-slate-700 px-4 py-3 rounded-xl min-w-[140px] relative group", t.isDefault ? "border-blue-500/50 bg-blue-900/10" : "")}>
                            <div className="font-bold text-white text-sm truncate">{t.name}</div>
                            <div className="text-[10px] text-slate-500">{t.isDefault ? "Standard" : "Anpassad"}</div>
                            <button 
                                onClick={() => { setEditingTemplateId(t.id); setNewTemplateName(t.name); setIsTemplateModalOpen(true); }}
                                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-white transition-opacity"
                            >
                                <Edit2 size={12} />
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {/* Month Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {monthsInYear.map(date => {
                    const monthKey = format(date, 'yyyy-MM');
                    const activeTemplate = getTemplateForMonth(monthKey);
                    const config = monthConfigs.find(c => c.monthKey === monthKey);
                    
                    const hasOverrides = config && (
                        (config.groupOverrides && Object.keys(config.groupOverrides).length > 0) || 
                        (config.subCategoryOverrides && Object.keys(config.subCategoryOverrides).length > 0) ||
                        (config.bucketOverrides && Object.keys(config.bucketOverrides).length > 0)
                    );
                    
                    const isLocked = config?.isLocked;

                    return (
                        <div key={monthKey} className={cn("bg-slate-800 border p-3 rounded-xl flex items-center justify-between", isLocked ? "border-amber-500/30" : "border-slate-700")}>
                            <div className="flex items-center gap-3">
                                <div className={cn("w-10 h-10 flex items-center justify-center rounded-lg font-bold text-xs uppercase", isLocked ? "bg-amber-900/20 text-amber-400" : "bg-slate-900 text-slate-300")}>
                                    {format(date, 'MMM', { locale: sv })}
                                </div>
                                <div>
                                    <select 
                                        className={cn("bg-transparent text-sm font-bold outline-none transition-colors", isLocked ? "text-slate-500 cursor-not-allowed" : "text-white cursor-pointer hover:text-blue-400")}
                                        value={activeTemplate?.id}
                                        onChange={(e) => assignTemplateToMonth(monthKey, e.target.value)}
                                        disabled={!!isLocked}
                                    >
                                        {budgetTemplates.map(t => (
                                            <option key={t.id} value={t.id} className="bg-slate-800">{t.name}</option>
                                        ))}
                                    </select>
                                    {isLocked ? (
                                        <div className="text-[10px] text-amber-500 font-medium flex items-center gap-1"><Lock size={8}/> Budget låst</div>
                                    ) : hasOverrides ? (
                                        <div className="text-[10px] text-slate-400">Innehåller avvikelser</div>
                                    ) : null}
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-1">
                                {!isLocked && hasOverrides && (
                                    <button 
                                        onClick={() => resetMonthToTemplate(monthKey)}
                                        className="p-2 text-slate-500 hover:text-blue-400 transition-colors"
                                        title="Återställ till mall (Rensa avvikelser)"
                                    >
                                        <RotateCcw size={14} />
                                    </button>
                                )}
                                {/* LOCK TOGGLE */}
                                <button 
                                    onClick={() => toggleMonthLock(monthKey)}
                                    className={cn("p-2 rounded-full transition-colors", isLocked ? "text-amber-400 hover:bg-amber-500/20" : "text-slate-600 hover:text-slate-400")}
                                    title={isLocked ? "Lås upp månad" : "Lås månad"}
                                >
                                    {isLocked ? <Lock size={16} /> : <Unlock size={16} />}
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            <Modal isOpen={isTemplateModalOpen} onClose={() => setIsTemplateModalOpen(false)} title={editingTemplateId ? "Byt namn på mall" : "Skapa ny mall"}>
                <div className="space-y-4">
                    <p className="text-sm text-slate-300">
                        {editingTemplateId ? "Ändra namn på mallen." : "Den nya mallen kommer kopiera budgetvärdena från din nuvarande valda månad."}
                    </p>
                    <Input label="Namn" value={newTemplateName} onChange={e => setNewTemplateName(e.target.value)} autoFocus />
                    <Button onClick={handleCreateTemplate} className="w-full">Spara</Button>
                </div>
            </Modal>
        </div>
    );
};
