import { useMemo } from 'react';
import { useApp } from '../store';
import { getBudgetInterval } from '../utils';
import { format, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';

export const useBudgetMonth = (monthKey: string) => {
    const { settings } = useApp();
    
    return useMemo(() => {
        const { start, end } = getBudgetInterval(monthKey, settings.payday);
        
        return {
            start,
            end,
            // Pre-formatted strings for DB queries/filtering (YYYY-MM-DD)
            startStr: format(start, 'yyyy-MM-dd'),
            endStr: format(end, 'yyyy-MM-dd'),
            // "Januari 2024"
            monthLabel: format(parseISO(`${monthKey}-01`), 'MMMM yyyy', { locale: sv }),
            // "25 dec - 24 jan"
            intervalLabel: `${format(start, 'd MMM', { locale: sv })} - ${format(end, 'd MMM yyyy', { locale: sv })}`
        };
    }, [monthKey, settings.payday]);
};