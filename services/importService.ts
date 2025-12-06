import { format } from 'date-fns';
import { Transaction, ImportRule, Bucket, MainCategory, SubCategory } from '../types';
import { generateId } from '../utils';
import { db } from '../db';
import { categorizeTransactionsWithAi } from './aiService';
import * as XLSX from 'xlsx'; // Statisk import är säkrare med Vite

// --- PARSING ---

const parseAmount = (val: any): number => {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    // Handle Swedish "1.234,50" or "-123,00"
    // Remove dots (thousand separators) and replace comma with dot
    let str = val.toString();
    str = str.replace(/\./g, ''); 
    str = str.replace(',', '.');
    // Remove non-breaking spaces often found in bank exports
    str = str.replace(/\s/g, '');
    return parseFloat(str) || 0;
};

const parseDate = (val: any): string => {
    if (!val) return format(new Date(), 'yyyy-MM-dd');
    
    // If it's a JS date object
    if (val instanceof Date) {
        return format(val, 'yyyy-MM-dd');
    }
    
    // Check if it's an Excel serial date number (e.g. 45000)
    if (typeof val === 'number' && val > 20000) {
        // Excel base date is usually 1900-01-01
        // new Date(Math.round((val - 25569)*86400*1000)) converts Excel serial to JS timestamp
        // However, XLSX library usually handles this if cell dates are typed.
        // If we get a raw number here, let's try to convert it.
        const date = new Date((val - (25567 + 2))*86400*1000); // 25569 adjustment
        return format(date, 'yyyy-MM-dd');
    }

    const str = val.toString().trim();
    // Match YYYY-MM-DD
    if (str.match(/^\d{4}-\d{2}-\d{2}$/)) return str;
    // Match YYYYMMDD
    if (str.match(/^\d{8}$/)) {
        return `${str.substring(0,4)}-${str.substring(4,6)}-${str.substring(6,8)}`;
    }
    return str; // Fallback
};

export const parseBankFile = async (file: File, accountId: string): Promise<Transaction[]> => {
    const isCsv = file.name.toLowerCase().endsWith('.csv');
    
    if (isCsv) {
        try {
            const PapaModule = await import('papaparse');
            const Papa = PapaModule.default || PapaModule;

            return new Promise((resolve, reject) => {
                Papa.parse(file, {
                    encoding: "ISO-8859-1",
                    skipEmptyLines: true,
                    complete: (results: any) => {
                        try {
                            const headerRowIndex = results.data.findIndex((row: any) => 
                                Array.isArray(row) && row.some((cell: any) => typeof cell === 'string' && cell.toLowerCase().includes('datum'))
                            );

                            if (headerRowIndex === -1) {
                                console.warn("Could not find 'Datum' header row.");
                                // Fallback: Assume first row is header or data if simple CSV
                                // return resolve([]); 
                            }

                            const startRow = headerRowIndex !== -1 ? headerRowIndex + 1 : 0;
                            const dataRows = results.data.slice(startRow);
                            
                            const transactions: Transaction[] = dataRows.map((row: any) => {
                                // Safe access to columns
                                const dateCol = row[0];
                                const textCol = row[3] || row[1] || 'Okänd'; // Try col 3, fallback to 1
                                const amountCol = row[4] || row[2] || 0;     // Try col 4, fallback to 2

                                return {
                                    id: generateId(),
                                    accountId,
                                    date: parseDate(dateCol),
                                    description: (textCol || 'Okänd transaktion').toString(),
                                    amount: parseAmount(amountCol),
                                    isVerified: false,
                                    source: 'import' as const
                                };
                            }).filter((t: Transaction) => t.amount !== 0 && t.date.length === 10);

                            resolve(transactions);
                        } catch (e) {
                            reject(e);
                        }
                    },
                    error: (err: any) => reject(err)
                });
            });
        } catch (error) {
            console.error("Failed to load PapaParse", error);
            throw new Error("Kunde inte ladda CSV-tolkaren.");
        }
    } else {
        // XLSX Handling
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target?.result as ArrayBuffer);
                    const workbook = XLSX.read(data, { type: 'array', cellDates: true }); // cellDates: true is crucial for Excel dates
                    
                    const firstSheetName = workbook.SheetNames[0];
                    const firstSheet = workbook.Sheets[firstSheetName];
                    
                    // Get data as array of arrays
                    const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' }) as any[][];
                    
                    // Find header row safely
                    const headerRowIndex = jsonData.findIndex((row) => 
                        Array.isArray(row) && row.some(cell => typeof cell === 'string' && cell.toLowerCase().includes('datum'))
                    );
                    
                    if (headerRowIndex === -1) {
                        console.warn("Could not find 'Datum' header in XLSX.");
                        // Fallback logic or reject? Let's resolve empty for now to avoid crash
                        return resolve([]); 
                    }

                    const dataRows = jsonData.slice(headerRowIndex + 1);
                    
                    const transactions: Transaction[] = dataRows.map((row): Transaction | null => {
                         // Mapping based on your specific file structure: 
                         // Col 0: Datum, Col 3: Text, Col 4: Belopp
                         // Use safe checks
                         if (!Array.isArray(row) || row.length < 5) return null;

                         return {
                             id: generateId(),
                             accountId,
                             date: parseDate(row[0]),
                             description: (row[3] || '').toString(),
                             amount: parseAmount(row[4]),
                             isVerified: false,
                             source: 'import' as const
                        };
                    }).filter((t): t is Transaction => t !== null && t.amount !== 0);

                    resolve(transactions);
                } catch (err) {
                    console.error("XLSX Processing Error:", err);
                    reject(new Error("Misslyckades att tolka Excel-filen."));
                }
            };
            
            reader.onerror = (err) => {
                console.error("File Reading Error:", err);
                reject(new Error("Kunde inte läsa filen."));
            };

            reader.readAsArrayBuffer(file);
        });
    }
};

// ... (rest of pipeline functions remain the same)
// --- PIPELINE LOGIC ---

/**
 * Attempts to find previous transactions with same description and account
 * to re-use their categorization.
 */
const applyHistoricalCategories = async (transactions: Transaction[]): Promise<Transaction[]> => {
    // Process in parallel
    const enriched = await Promise.all(transactions.map(async (t) => {
        // If already categorized by a Rule, skip history check
        if (t.bucketId || t.categoryMainId) return t;

        try {
            // Find most recent transaction with same description on same account that has categorization
            const lastMatch = await db.transactions
                .where({ accountId: t.accountId, description: t.description })
                .filter(old => !!old.bucketId || !!old.categoryMainId)
                .reverse()
                .first();

            if (lastMatch) {
                return {
                    ...t,
                    bucketId: lastMatch.bucketId,
                    categoryMainId: lastMatch.categoryMainId,
                    categorySubId: lastMatch.categorySubId,
                    matchType: 'history' as const
                };
            }
        } catch (e) {
            // Fail silently and continue
            console.warn("History lookup failed for", t.description, e);
        }

        return t;
    }));
    return enriched;
};

export const runImportPipeline = async (
    rawTransactions: Transaction[],
    existingTransactions: Transaction[],
    rules: ImportRule[],
    buckets: Bucket[],
    mainCategories: MainCategory[],
    subCategories: SubCategory[]
): Promise<Transaction[]> => {
    
    // 1. DUPLICATE CHECK
    // Simple hash: date + amount + description
    const existingHashes = new Set(existingTransactions.map(t => `${t.date}_${t.amount}_${t.description}`));
    
    let processed = rawTransactions.filter(t => {
        const hash = `${t.date}_${t.amount}_${t.description}`;
        return !existingHashes.has(hash);
    });

    // 2. APPLY RULES (Highest Priority)
    processed = processed.map(t => {
        const lowerDesc = t.description.toLowerCase();
        const matchedRule = rules.find(r => {
            const kw = r.keyword.toLowerCase();
            if (r.matchType === 'exact') return lowerDesc === kw;
            if (r.matchType === 'starts_with') return lowerDesc.startsWith(kw);
            return lowerDesc.includes(kw); // Default contains
        });

        if (matchedRule) {
            return { 
                ...t, 
                bucketId: matchedRule.targetBucketId || t.bucketId,
                categoryMainId: matchedRule.targetCategoryMainId || t.categoryMainId,
                categorySubId: matchedRule.targetCategorySubId || t.categorySubId,
                matchType: 'rule' as const,
                ruleMatch: true 
            };
        }
        return t;
    });

    // 3. APPLY HISTORY (Smart Matching)
    // Only applied to those not yet matched by rules
    processed = await applyHistoricalCategories(processed);

    // 4. APPLY AI (Lowest Priority, only for completely unassigned)
    try {
        // Filter list sent to AI to save tokens/time
        // We only send items that have NO categorization yet.
        const unassigned = processed.filter(t => !t.bucketId && !t.categoryMainId);
        
        if (unassigned.length > 0) {
            // Using static import now that aiService is safe
            const aiMapping = await categorizeTransactionsWithAi(unassigned, buckets, mainCategories, subCategories);
            
            processed = processed.map(t => {
                if (t.bucketId || t.categoryMainId) return t; // Already ruled or history matched
                
                const suggestion = aiMapping[t.id];
                if (suggestion) {
                    return { 
                        ...t, 
                        bucketId: suggestion.bucketId, 
                        categoryMainId: suggestion.mainCatId,
                        categorySubId: suggestion.subCatId,
                        matchType: 'ai' as const,
                        aiSuggested: true 
                    };
                }
                return t;
            });
        }
    } catch (e) {
        console.error("AI Step skipped due to error", e);
    }

    return processed;
};
