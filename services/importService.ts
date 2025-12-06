import { format } from 'date-fns';
import { Transaction, ImportRule, Bucket } from '../types';
import { generateId } from '../utils';

// --- PARSING ---

const parseAmount = (val: any): number => {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    // Handle Swedish "1.234,50" or "-123,00"
    // Remove dots (thousand separators) and replace comma with dot
    let str = val.toString();
    str = str.replace(/\./g, ''); 
    str = str.replace(',', '.');
    return parseFloat(str) || 0;
};

const parseDate = (val: any): string => {
    // Return YYYY-MM-DD
    if (!val) return format(new Date(), 'yyyy-MM-dd');
    // If it's a JS date object (from XLSX)
    if (val instanceof Date) {
        return format(val, 'yyyy-MM-dd');
    }
    // Simple parsing for "2025-01-01"
    const str = val.toString().trim();
    if (str.match(/^\d{4}-\d{2}-\d{2}$/)) return str;
    return str; // Fallback
};

export const parseBankFile = async (file: File, accountId: string): Promise<Transaction[]> => {
    const isCsv = file.name.toLowerCase().endsWith('.csv');
    
    if (isCsv) {
        try {
            // Dynamic import for PapaParse
            const PapaModule = await import('papaparse');
            // Handle ESM/CommonJS default export differences
            const Papa = PapaModule.default || PapaModule;

            return new Promise((resolve, reject) => {
                Papa.parse(file, {
                    encoding: "ISO-8859-1", // Standard for Swedish banks
                    skipEmptyLines: true,
                    complete: (results: any) => {
                        // Search for the header row containing "Datum"
                        const headerRowIndex = results.data.findIndex((row: any) => 
                            Array.isArray(row) && row.some((cell: any) => typeof cell === 'string' && cell.toLowerCase().includes('datum'))
                        );

                        if (headerRowIndex === -1) {
                            console.warn("Could not find 'Datum' header row.");
                            return resolve([]);
                        }

                        const dataRows = results.data.slice(headerRowIndex + 1);
                        const transactions: Transaction[] = dataRows.map((row: any) => {
                            // Assuming standard layout based on description: 0: Date, 3: Text, 4: Amount
                            // Adjust indices if needed or make dynamic based on header
                            return {
                                id: generateId(),
                                accountId,
                                date: parseDate(row[0]),
                                description: row[3] || 'Okänd transaktion',
                                amount: parseAmount(row[4]),
                                isVerified: false,
                                source: 'import' as const
                            };
                        }).filter((t: Transaction) => t.amount !== 0); // Filter out empty lines or zero transactions

                        resolve(transactions);
                    },
                    error: (err: any) => reject(err)
                });
            });
        } catch (error) {
            console.error("Failed to load PapaParse", error);
            throw new Error("Kunde inte ladda CSV-tolkaren.");
        }
    } else {
        try {
            // Dynamic import for XLSX
            const XLSXModule = await import('xlsx');
            const XLSX = XLSXModule.default || XLSXModule;

            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const data = new Uint8Array(e.target?.result as ArrayBuffer);
                        const workbook = XLSX.read(data, { type: 'array' });
                        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][];
                        
                        const headerRowIndex = jsonData.findIndex((row) => 
                            row.some(cell => typeof cell === 'string' && cell.toLowerCase().includes('datum'))
                        );
                        
                        if (headerRowIndex === -1) return resolve([]);

                        const dataRows = jsonData.slice(headerRowIndex + 1);
                        const transactions: Transaction[] = dataRows.map((row) => ({
                             id: generateId(),
                             accountId,
                             date: parseDate(row[0]),
                             description: (row[3] || '').toString(),
                             amount: parseAmount(row[4]),
                             isVerified: false,
                             source: 'import' as const
                        })).filter(t => t.amount !== 0);

                        resolve(transactions);
                    } catch (err) {
                        reject(err);
                    }
                };
                reader.readAsArrayBuffer(file);
            });
        } catch (error) {
            console.error("Failed to load XLSX", error);
            throw new Error("Kunde inte ladda Excel-tolkaren.");
        }
    }
};

// --- PIPELINE LOGIC ---

export const runImportPipeline = async (
    rawTransactions: Transaction[],
    existingTransactions: Transaction[],
    rules: ImportRule[],
    buckets: Bucket[]
): Promise<Transaction[]> => {
    
    // 1. DUPLICATE CHECK
    // Simple hash: date + amount + description
    const existingHashes = new Set(existingTransactions.map(t => `${t.date}_${t.amount}_${t.description}`));
    
    let processed = rawTransactions.filter(t => {
        const hash = `${t.date}_${t.amount}_${t.description}`;
        return !existingHashes.has(hash);
    });

    // 2. APPLY RULES
    processed = processed.map(t => {
        const lowerDesc = t.description.toLowerCase();
        const matchedRule = rules.find(r => {
            const kw = r.keyword.toLowerCase();
            if (r.matchType === 'exact') return lowerDesc === kw;
            if (r.matchType === 'starts_with') return lowerDesc.startsWith(kw);
            return lowerDesc.includes(kw); // Default contains
        });

        if (matchedRule) {
            return { ...t, categoryId: matchedRule.targetBucketId, ruleMatch: true };
        }
        return t;
    });

    // 3. APPLY AI (Only for those without category)
    try {
        // Dynamic import to avoid static dependency on Google GenAI SDK which might cause load issues
        const { categorizeTransactionsWithAi } = await import('./aiService');
        const aiMapping = await categorizeTransactionsWithAi(processed, buckets);
        
        processed = processed.map(t => {
            if (t.categoryId) return t; // Already ruled
            
            const aiCatId = aiMapping[t.id];
            if (aiCatId) {
                // Verify bucket exists
                const bucketExists = buckets.find(b => b.id === aiCatId);
                if (bucketExists) {
                    return { ...t, categoryId: aiCatId, aiSuggested: true };
                }
            }
            return t;
        });
    } catch (e) {
        console.error("AI Step skipped due to error", e);
    }

    return processed;
};