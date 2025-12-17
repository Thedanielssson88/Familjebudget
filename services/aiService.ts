
import { Bucket, Transaction, MainCategory, SubCategory, User, BudgetGroup } from "../types";
import { formatMoney } from "../utils";
import { GoogleGenAI } from "@google/genai";

// This service handles the "Smart" part of the import pipeline
export const categorizeTransactionsWithAi = async (
  transactions: Transaction[], 
  buckets: Bucket[],
  mainCategories: MainCategory[],
  subCategories: SubCategory[]
): Promise<Record<string, { bucketId?: string, mainCatId?: string, subCatId?: string }>> => {
  
  // Filter out transactions that already have assignments
  const unknown = transactions.filter(t => !t.bucketId && !t.categoryMainId);
  if (unknown.length === 0) return {};

  try {
      // Fix: Used process.env.API_KEY exclusively and initialized correctly
      const apiKey = process.env.API_KEY;
      if (!apiKey) {
          console.error("API Key not found in environment");
          return {};
      }

      const ai = new GoogleGenAI({ apiKey });
      
      // Prepare lists for AI
      const bucketsList = buckets.map(b => `ID: "${b.id}", Namn: "${b.name}"`).join("\n");
      const mainCatsList = mainCategories.map(c => `ID: "${c.id}", Namn: "${c.name}"`).join("\n");
      const subCatsList = subCategories.map(c => `ID: "${c.id}", ParentID: "${c.mainCategoryId}", Namn: "${c.name}"`).join("\n");
      
      const transactionList = unknown.map(t => `- ID: "${t.id}", Text: "${t.description}", Belopp: ${t.amount}`).join("\n");

      const prompt = `
        Jag har en lista med banktransaktioner. Jag vill att du klassificerar varje transaktion enligt följande logik:

        1. ÄR DETTA EN ÖVERFÖRING MELLAN KONTON (Funding)?
           - T.ex. "Överföring till Matkonto", "Sparande", "Buffert".
           - Om JA: Välj en matchande Budgetpost (Bucket) ID. Sätt Main/Sub Category till null.
        
        2. ÄR DETTA EN UTGIFT/KONSUMTION?
           - T.ex. "ICA Maxi", "Circle K", "Netflix", "Hyra".
           - Om JA: Välj en matchande Huvudkategori och Underkategori ID. Sätt Bucket ID till null.

        BUDGETPOSTER (Endast för överföringar):
        ${bucketsList}
        
        KATEGORIER (Endast för utgifter):
        ${mainCatsList}
        
        UNDERKATEGORIER (Endast för utgifter):
        ${subCatsList}

        TRANSAKTIONER:
        ${transactionList}

        INSTRUKTIONER:
        1. Analysera texten i varje transaktion.
        2. Avgör om det är TRANSFER (Bucket) eller EXPENSE (Category).
        3. Svara ENDAST med ett JSON-objekt där nyckeln är Transaktions-ID och värdet är ett objekt { bucketId, mainCatId, subCatId }.
        
        Exempel:
        {
          "tx_1": { "bucketId": "b1", "mainCatId": null, "subCatId": null },  // Överföring
          "tx_2": { "bucketId": null, "mainCatId": "mc2", "subCatId": "sc1" } // Utgift
        }
      `;

    // Fix: Updated model to gemini-3-flash-preview as per guidelines
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    // Fix: Extracted text correctly using .text property
    const jsonText = response.text || "{}";
    const result = JSON.parse(jsonText);
    return result;

  } catch (error) {
    console.error("AI Categorization failed:", error);
    return {};
  }
};

export interface FinancialSnapshot {
    totalIncome: number;
    budgetGroups: { name: string; limit: number; spent: number; }[];
    categoryBreakdownCurrent: { main: string; sub: string; amount: number }[];
    topExpenses: { name: string; amount: number }[];
    transactionLog: string; // List of all transactions for detailed analysis
    monthLabel: string;
}

export const generateMonthlyReport = async (data: FinancialSnapshot): Promise<string> => {
    try {
        // Fix: Used process.env.API_KEY exclusively and initialized correctly
        const apiKey = process.env.API_KEY;
        if (!apiKey) return "Kunde inte initiera AI-tjänsten.";

        const ai = new GoogleGenAI({ apiKey });

        const prompt = `
            Agera som en skarp ekonomisk detektiv och rådgivare för en familj (2 vuxna, 1 barn på 3 år).
            Din uppgift är att granska ekonomin för ${data.monthLabel}.
            
            Här är datan:
            
            TOTAL INKOMST: ${formatMoney(data.totalIncome)}
            
            BUDGETGRUPPER (Plan vs Utfall):
            ${data.budgetGroups.map(g => `- ${g.name}: Utfall ${formatMoney(g.spent)} (Budget: ${formatMoney(g.limit)})`).join('\n')}
            
            TOPP UTGIFTER:
            ${data.topExpenses.map(e => `- ${e.name}: ${formatMoney(e.amount)}`).join('\n')}

            DETALJERAD TRANSAKTIONSLISTA (Datum : Belopp : Beskrivning : Kategori):
            ${data.transactionLog}

            INSTRUKTIONER:
            Skriv en rapport i Markdown som fokuserar på *beteende* och *orsak*, inte bara siffror. Använd transaktionslistan för att hitta mönster (t.ex. "22 besök på Ica Nara", "Stort engångsköp på IKEA").
            Titta INTE på historisk data (du har bara denna månad). Gissa inte om du inte vet.

            Strukturera rapporten så här:

            ## Snabbanalys: ${data.monthLabel}
            *   Ge resultatet (Utfall vs Budget/Inkomst). Gick de plus eller minus?
            *   What is the absolutely biggest deviation?

            ## Var läckte pengarna? (Topp 3 Avvikelser/Insikter)
            *   Välj ut de 3 mest intressanta kategorierna eller händelserna.
            *   För varje punkt:
                *   **Vad hände:** Analysera transaktionerna. Var det många småköp? Ett stort köp? (Nämn specifika butiker om de förekommer ofta eller med stora belopp).
                *   **Analys:** Var det onödigt? En engångshändelse? En dålig vana?

            ## Jämförelse: Er familj vs "Normalfamiljen"
            *   Gör en tabell där du jämför deras kostnader (Mat, Transport, Nöje) med schablonvärden för 2 vuxna + 1 barn (3 år).
            *   Ge en status (🔴/🟡/🟢) för varje rad.

            ## Konkreta Spartips för Er
            *   Ge 3 tips baserat EXAKT på deras transaktioner.
            *   T.ex: "Ni handlade mat 25 gånger, försök storhandla", "Ni har 3 streamingtjänster", "Utemat kostade X kr". Var specifik!

            ## Slutsats
            *   En peppande men ärlig sammanfattning på 2 meningar.

            Ton: Professionell men personlig ("Ni/Er"). Använd fetstil för belopp och butiksnamn.
        `;

        // Fix: Updated model to gemini-3-flash-preview as per guidelines
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
        });

        // Fix: Extracted text correctly using .text property
        return response.text || "Kunde inte generera analys.";

    } catch (e) {
        console.error("Report generation failed", e);
        return "Ett fel uppstod vid generering av rapporten. Försök igen senare.";
    }
};
