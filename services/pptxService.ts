import PptxGenJS from 'pptxgenjs';

export const generateProjectOrgSlide = (pres: PptxGenJS) => {
    const slide = pres.addSlide();

    // --- SLIDE TITLE ---
    slide.addText("Projektorganisation", { 
        x: 0.5, y: 0.4, w: '90%', h: 0.5, 
        fontSize: 24, bold: true, color: '363636', fontFace: 'Arial' 
    });

    // --- COLORS & STYLES ---
    const RED = "C0504D";
    const GREEN = "00B050";
    const WHITE = "FFFFFF";
    const DARK_GREY = "363636";

    // --- LAYOUT CONSTANTS ---
    const LEFT_COL_X = 0.5;
    const RIGHT_COL_X = 5.2;
    const COL_WIDTH = 4.4;
    
    const HEADER_H = 0.4;
    
    // --- HELPER TO DRAW A CARD ---
    const drawCard = (
        x: number, y: number, w: number, h: number, 
        color: string, 
        title: string, 
        content: PptxGenJS.TextItem[], 
        isDashed: boolean = false
    ) => {
        // 1. Header Box
        slide.addShape(pres.ShapeType.rect, {
            x: x, y: y, w: w, h: HEADER_H,
            fill: { color: color },
            rectRadius: 0
        });
        
        // 2. Header Text
        slide.addText(title, {
            x: x, y: y, w: w, h: HEADER_H,
            align: 'center', fontSize: 11, bold: true, color: WHITE, valign: 'middle'
        });

        // 3. Body Box (White with Border)
        slide.addShape(pres.ShapeType.rect, {
            x: x, y: y + HEADER_H, 
            w: w, h: h - HEADER_H,
            fill: { color: WHITE },
            line: { color: color, width: 1.5, dashType: isDashed ? 'dash' : 'solid' }
        });

        // 4. Content Text
        slide.addText(content, {
            x: x + 0.1, y: y + HEADER_H + 0.1, 
            w: w - 0.2, h: h - HEADER_H - 0.2,
            fontSize: 10, color: DARK_GREY, 
            bullet: content.length > 1 ? { type: 'bullet', code: '2022' } : false,
            valign: 'top',
            align: content.length === 1 && !content[0].options?.breakLine ? 'center' : 'left'
        });
    };

    // --- Y POSITIONS ---
    const ROW_1_Y = 1.2;
    const ROW_2_Y = 2.8;
    const ROW_3_Y = 4.2;

    // --- LEFT COLUMN ---

    // 1. Styrgrupp
    drawCard(
        LEFT_COL_X, ROW_1_Y, COL_WIDTH, 1.3,
        RED, 
        "Styrgrupp",
        [
            { text: "Annika Berg, Avd Chef Produktutveckling", options: { breakLine: true } },
            { text: "Carina Bossy, Avd Chef T&U", options: { breakLine: true } },
            { text: "Linda Lenell, Kategorigruppchef", options: { breakLine: true } }
        ]
    );

    // CONNECTOR: Styrgrupp -> Projektledare
    slide.addShape(pres.ShapeType.line, { 
        x: LEFT_COL_X + (COL_WIDTH / 2), y: ROW_1_Y + 1.3, 
        w: 0, h: ROW_2_Y - (ROW_1_Y + 1.3), 
        line: { color: '888888', width: 2, endArrowType: 'triangle' } 
    });

    // 2. Projektledare
    drawCard(
        LEFT_COL_X, ROW_2_Y, COL_WIDTH, 0.8,
        GREEN,
        "Projektledare",
        [{ text: "Andreas Danielsson - Projektledare" }]
    );

    // CONNECTOR: Projektledare -> Team
    slide.addShape(pres.ShapeType.line, { 
        x: LEFT_COL_X + (COL_WIDTH / 2), y: ROW_2_Y + 0.8, 
        w: 0, h: ROW_3_Y - (ROW_2_Y + 0.8), 
        line: { color: '888888', width: 2, endArrowType: 'triangle' } 
    });

    // 3. Tvärfunktionellt Team
    drawCard(
        LEFT_COL_X, ROW_3_Y, COL_WIDTH, 1.2,
        GREEN,
        "Tvärfunktionellt team",
        [
            { text: "Emilia Lundgren, Senior strategisk inköpare", options: { breakLine: true } },
            { text: "Carin Bohman, Byggdelsansvarig Installationer", options: { breakLine: true } }
        ]
    );

    // --- RIGHT COLUMN ---

    // 4. Referensgrupp
    drawCard(
        RIGHT_COL_X, ROW_1_Y, COL_WIDTH, 1.3,
        RED,
        "Referensgrupp",
        [
            { text: "Jörgen Andersson", options: { breakLine: true } },
            { text: "(Projektgranskning)", options: { fontSize: 9, italic: true } }
        ]
    );

    // 5. Referenspersoner (Aligned lower)
    drawCard(
        RIGHT_COL_X, ROW_2_Y + 0.5, // Start bit lower than PM
        COL_WIDTH, 2.5, 
        RED,
        "Referenspersoner",
        [
            { text: "Linda Gjerde, Strategisk Inköpare", options: { breakLine: true } },
            { text: "Toumas Alanne, Inköpschef", options: { breakLine: true } },
            { text: "Anders Fredriksson, Projektinköpare SAI", options: { breakLine: true } },
            { text: "Allan Rassmussen, Teknisk chef", options: { breakLine: true } },
            { text: "Jens Eirik Brandal, Teknisk chef Installationer & Energi", options: { breakLine: true } },
            { text: "Per Öhman, Gruppchef Energi & Installationer", options: { breakLine: true } },
            { text: "Erik Wallin Engdahl, Installationssamordnare", options: { breakLine: true } }
        ],
        true // dashed
    );
};