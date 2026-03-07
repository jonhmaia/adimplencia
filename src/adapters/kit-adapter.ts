import * as XLSX from "xlsx";
import { KitStatus } from "@/domain/enums";

// ============================
// Tipos: Planilha de Kits
// ============================

export interface KitEntry {
    numero: number;           // 1..23
    conteudo: string | null;  // Conteúdo da célula KIT
    data_envio: string | null; // Conteúdo da célula DATA
    status: KitStatus;
}

export interface KitAssinante {
    data_compra: string | null;
    nome: string;
    email: string | null;
    telefone: string | null;
    filhos: string | null;
    plano: string | null;
    valor_str: string | null;
    cupom: string | null;
    campanha: string | null;
    ja_recebeu: boolean;
    kits: KitEntry[];
}

// ============================
// Mapeamento de colunas da planilha
// ============================

// Colunas fixas (0-indexed)
const COL_MAP = {
    COMPRA: 1,         // B
    ASSINANTE: 2,      // C
    EMAIL: 3,          // D
    FILHOS: 4,         // E
    TELEFONE: 5,       // F
    CAMPANHA: 6,       // G
    JA_RECEBEU: 7,     // H
    CUPOM: 8,          // I
    PLANO: 9,          // J
    VALOR: 10,         // K
};

// Colunas de KIT e DATA (pares alternados começando em L=11)
// KIT 1: col 11 (L), DATA 1: col 12 (M)
// KIT 2: col 13 (N), DATA 2: col 14 (O)
// ...até KIT 23
const KIT_START_COL = 11;
const MAX_KITS = 23;

/**
 * Converte valor de célula para string legível.
 */
function cellToString(value: unknown): string | null {
    if (value == null) return null;
    if (value instanceof Date) {
        return value.toLocaleDateString("pt-BR");
    }
    const str = String(value).trim();
    return str.length > 0 ? str : null;
}

/**
 * Detecta se o valor de uma célula representa uma data válida.
 */
function isDateCell(value: unknown): boolean {
    if (value instanceof Date) return true;
    if (value == null) return false;
    const str = String(value).trim();
    if (str.length === 0) return false;
    // Verifica formatos comuns de data: dd/mm, dd/mm/yyyy, yyyy-mm-dd
    if (/^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(str)) return true;
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) return true;
    // Formato "7/ago.", "5/set." etc
    if (/^\d{1,2}\/[a-záéíóú]{3,}\.?$/i.test(str)) return true;
    // Data completa como "19/01/2026"
    if (/^\d{2}\/\d{2}\/\d{4}/.test(str)) return true;
    return false;
}

/**
 * Detecta se o valor de uma célula é um marcador "X" (não pago).
 */
function isXMarker(value: unknown): boolean {
    if (value == null) return false;
    const str = String(value).trim().toLowerCase();
    return str === "x";
}

/**
 * Determina o status de um kit baseado no conteúdo da célula de DATA.
 * A célula DATA é a principal para determinar status; a célula KIT contém materiais.
 */
function determinarStatusKit(kitValue: unknown, dataValue: unknown): KitStatus {
    // Se a célula DATA contém 'X', é "não pago"
    if (isXMarker(dataValue) || isXMarker(kitValue)) {
        return KitStatus.NAO_PAGO;
    }

    // Se a célula DATA contém uma data, foi enviado
    if (isDateCell(dataValue)) {
        return KitStatus.ENVIADO;
    }

    // Se a célula KIT tem conteúdo (descrição de materiais) mas DATA não tem data,
    // pode ser que os materiais foram atribuídos
    if (kitValue != null && String(kitValue).trim().length > 0) {
        // Se o conteúdo do kit é apenas um número (ex: "1", "2"), é um indicador simples
        const kitStr = String(kitValue).trim();
        if (/^\d+$/.test(kitStr)) {
            // Número simples = indicador de que foi processado mas sem data
            return KitStatus.COM_MATERIAIS;
        }
        return KitStatus.COM_MATERIAIS;
    }

    return KitStatus.NAO_PROCESSADO;
}

// ============================
// Kit Adapter - Parser da planilha "MAT ENT KIT"
// ============================

export class KitPlanilhaAdapter {
    /**
     * Lê o buffer de um arquivo .xlsx da planilha de materiais entregues por kit.
     * Busca a aba "MAT ENT KIT"; se não encontrar, usa a primeira aba.
     */
    parsePlanilhaKits(buffer: Buffer): KitAssinante[] {
        const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });

        // Procurar aba "MAT ENT KIT"
        let sheetName = workbook.SheetNames.find(
            (name) => name.toUpperCase().includes("MAT ENT KIT")
        );
        if (!sheetName) {
            sheetName = workbook.SheetNames[0];
            console.warn(`[KitAdapter] Aba "MAT ENT KIT" não encontrada, usando "${sheetName}"`);
        }

        const worksheet = workbook.Sheets[sheetName];

        // Usar sheet_to_json com header numérico para acesso por índice
        const rawData: unknown[][] = XLSX.utils.sheet_to_json(worksheet, {
            header: 1,
            defval: null,
            raw: false,
        });

        // Pular header (linha 1); dados começam na linha 2 (index 1+)
        const assinantes: KitAssinante[] = [];

        for (let rowIdx = 1; rowIdx < rawData.length; rowIdx++) {
            const row = rawData[rowIdx];
            if (!row || row.length < 5) continue;

            // Verificar se tem pelo menos nome ou email
            const nome = cellToString(row[COL_MAP.ASSINANTE]);
            if (!nome) continue;

            const email = cellToString(row[COL_MAP.EMAIL]);
            const telefone = cellToString(row[COL_MAP.TELEFONE]);

            // Extrair kits
            const kits: KitEntry[] = [];
            for (let kitNum = 1; kitNum <= MAX_KITS; kitNum++) {
                const kitColIdx = KIT_START_COL + (kitNum - 1) * 2;       // Coluna KIT N
                const dataColIdx = KIT_START_COL + (kitNum - 1) * 2 + 1;  // Coluna DATA N

                const kitValue = kitColIdx < row.length ? row[kitColIdx] : null;
                const dataValue = dataColIdx < row.length ? row[dataColIdx] : null;

                const status = determinarStatusKit(kitValue, dataValue);

                kits.push({
                    numero: kitNum,
                    conteudo: cellToString(kitValue),
                    data_envio: cellToString(dataValue),
                    status,
                });
            }

            assinantes.push({
                data_compra: cellToString(row[COL_MAP.COMPRA]),
                nome,
                email,
                telefone,
                filhos: cellToString(row[COL_MAP.FILHOS]),
                plano: cellToString(row[COL_MAP.PLANO]),
                valor_str: cellToString(row[COL_MAP.VALOR]),
                cupom: cellToString(row[COL_MAP.CUPOM]),
                campanha: cellToString(row[COL_MAP.CAMPANHA]),
                ja_recebeu: String(row[COL_MAP.JA_RECEBEU] || "").toUpperCase().includes("RECEBEU"),
                kits,
            });
        }

        return assinantes;
    }
}
