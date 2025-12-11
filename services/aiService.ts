
import { Bucket, Transaction, MainCategory, SubCategory, User, BudgetGroup } from "../types";
import { formatMoney } from "../utils";

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
      // Dynamically import the SDK only when needed to prevent load errors if network fails
      const module = await import("@google/genai");
      const GoogleGenAI = module.GoogleGenAI || (module.default && module.default.GoogleGenAI);

      if (!GoogleGenAI) {
        throw new Error("Could not find GoogleGenAI class in imported module");
      }
      
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

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

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
    periodLabel: string; // e.g. "25 okt - 24 nov"
}

export const constructMonthlyReportPrompt = (data: FinancialSnapshot): string => {
    return `
            Agera som en skarp ekonomisk detektiv och rådgivare för en familj.
            Din uppgift är att granska ekonomin för perioden: ${data.monthLabel}.
            
            VIKTIG KONTEXT OM DATUM:
            Denna familj räknar sin ekonomi från lön till lön.
            Aktuell period omfattar: ${data.periodLabel}.
            Transaktioner inom detta intervall är KORREKTA för denna period.
            Du ska alltså INTE påpeka att datum "verkar vara från fel månad", utan analysera dem som en del av perioden.

            Här är datan för HELA perioden (Totaler):
            
            TOTAL INKOMST (NETTO): ${formatMoney(data.totalIncome)}
            
            BUDGETGRUPPER (Plan vs Utfall):
            ${data.budgetGroups.map(g => `- ${g.name}: Utfall ${formatMoney(g.spent)} (Budget: ${formatMoney(g.limit)})`).join('\n')}
            
            DETALJERAD TRANSAKTIONSLISTA (Datum | Belopp | Beskrivning | Kategori > Underkategori | [Ev Dröm-tagg]):
            ${data.transactionLog}

            INSTRUKTIONER:
            Du ska INTE bara summera kategorier. Du ska hitta mönster i transaktionslistan.
            Leta specifikt efter:
            1. **Dubbelbokningar:** Har samma belopp dragits två gånger samma dag eller dagarna intill varandra hos samma handlare? Varna för detta!
            2. **Småköps-fällan:** Har de handlat på samma ställe (t.ex. Ica, Pressbyrån) onödigt många gånger? Räkna frekvensen!
            3. **Engångs vs Vana:** Skilj på en stor engångsutgift (t.ex. "Säng 5000kr" märkt som "Möbler") och dyra vanor. Om en kategori är hög pga ett medvetet köp (kanske taggat som en Dröm), påpeka att det är okej/planerat. Om det är hög matkostnad pga 30 besök på Coop, varna.
            4. **Drömmar/Mål:** Om transaktioner är taggade med [Dröm: ...], notera att dessa pengar användes till ett sparmål och inte "slösades".

            Strukturera rapporten så här:

            ## Snabbanalys: ${data.monthLabel}
            *   Kort sammanfattning av läget (Plus/Minus för hela perioden).
            *   Den viktigaste insikten (t.ex. "Ni gick back, men det beror helt på sängköpet" eller "Matkostnaden har skenat").

            ## Detektivens Fynd (Varningar & Mönster)
            *   **Dubbelbokningar?** (Lista misstänkta transaktioner eller skriv "Inga upptäckta").
            *   **Frekvens-kollen:** (T.ex. "Ni besökte matbutik 22 gånger denna period. Snittnota X kr").
            *   **Avvikelser:** (T.ex. "Hög kostnad på X, men det var ett engångsköp").

            ## Var läckte pengarna? (Topp 3 Kategorier)
            *   Analysera de största kategorierna baserat på transaktionerna.
            *   Förklara *varför* de är höga (Var det ett stort köp eller många små?).

            ## Konkreta Åtgärder
            *   Ge 3 tips baserat EXAKT på deras beteende denna period.

            Ton: Professionell, skarp, men hjälpsam. Använd fetstil för belopp och butiksnamn.
    `;
};

export const fetchAiAnalysis = async (prompt: string): Promise<string> => {
    try {
        const module = await import("@google/genai");
        const GoogleGenAI = module.GoogleGenAI || (module.default && module.default.GoogleGenAI);
        const apiKey = process.env.API_KEY;
        
        if (!apiKey || !GoogleGenAI) return "Kunde inte initiera AI-tjänsten.";

        const ai = new GoogleGenAI({ apiKey });

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });

        return response.text || "Kunde inte generera analys.";

    } catch (e) {
        console.error("Report generation failed", e);
        return "Ett fel uppstod vid generering av rapporten. Försök igen senare.";
    }
};
