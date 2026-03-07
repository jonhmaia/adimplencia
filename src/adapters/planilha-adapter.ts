import * as XLSX from "xlsx";
import { Assinante, PedidoPlanilha, PedidoPlanilhaSchema } from "@/domain/entities";
import { FonteDados, StatusPagamento } from "@/domain/enums";

// ============================
// Interface do Planilha Adapter
// ============================
export interface PlanilhaAdapter {
    parsePlanilha(buffer: Buffer): PedidoPlanilha[];
    toAssinantes(pedidos: PedidoPlanilha[]): Assinante[];
}

// ============================
// Implementação: Leitura de planilha .xlsx
// ============================
export class PlanilhaXlsxAdapter implements PlanilhaAdapter {
    /**
     * Converte data serial do Excel para string ISO.
     * O Excel usa o sistema de data 1900 (dias desde 01/01/1900).
     */
    private excelDateToISO(serial: number | string | null | undefined): string | null {
        if (serial == null) return null;
        if (typeof serial === "string") return serial;
        if (serial === 0) return null;

        // Converte serial Excel para timestamp JS
        const utcDays = Math.floor(serial - 25569);
        const utcValue = utcDays * 86400;
        const fractionalDay = serial - Math.floor(serial);
        const totalSeconds = Math.floor(86400 * fractionalDay);

        const date = new Date(0);
        date.setUTCSeconds(utcValue + totalSeconds);

        return date.toISOString();
    }

    /**
     * Normaliza numero_documento para string de CPF (somente dígitos).
     */
    private normalizeCpfFromNumber(value: number | string | null | undefined): string | null {
        if (value == null) return null;
        const str = String(value).replace(/\D/g, "");
        if (str.length === 0) return null;
        // Preenche com zeros à esquerda para CPF (11 dígitos)
        return str.padStart(11, "0");
    }

    /**
     * Normaliza telefone (number) para string com DDD.
     */
    private normalizeTelefoneFromNumber(value: number | string | null | undefined): string | null {
        if (value == null) return null;
        const str = String(value).replace(/\D/g, "");
        if (str.length === 0) return null;
        // Se não começa com 55 (DDI Brasil), adiciona
        if (!str.startsWith("55") && str.length <= 11) {
            return "55" + str;
        }
        return str;
    }

    /**
     * Lê o buffer de um arquivo .xlsx e retorna os pedidos parseados.
     */
    parsePlanilha(buffer: Buffer): PedidoPlanilha[] {
        const workbook = XLSX.read(buffer, { type: "buffer" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        const rawData: Record<string, unknown>[] = XLSX.utils.sheet_to_json(worksheet);
        const pedidos: PedidoPlanilha[] = [];

        for (const row of rawData) {
            try {
                const parsed = PedidoPlanilhaSchema.parse(row);
                pedidos.push(parsed);
            } catch (err) {
                console.warn("[PlanilhaAdapter] Linha inválida ignorada:", err);
            }
        }

        return pedidos;
    }

    /**
     * Converte pedidos da planilha para o formato normalizado de Assinante.
     */
    toAssinantes(pedidos: PedidoPlanilha[]): Assinante[] {
        return pedidos.map((pedido) => ({
            cpf: this.normalizeCpfFromNumber(pedido.numero_documento),
            telefone: this.normalizeTelefoneFromNumber(pedido.telefone),
            email: pedido.email ? String(pedido.email).trim().toLowerCase() : null,
            nome: [pedido.nome, pedido.sobrenome]
                .filter(Boolean)
                .join(" ")
                .trim() || null,
            fonte: FonteDados.PLANILHA,
            dados_originais: {
                ...pedido,
                criado_em: this.excelDateToISO(pedido.criado_em as number),
                data_pagamento: this.excelDateToISO(pedido.data_pagamento as number),
            } as unknown as Record<string, unknown>,
        }));
    }

    /**
     * Verifica se o status do pedido indica pagamento aprovado (adimplente).
     */
    static isAdimplente(status: string): boolean {
        return status === StatusPagamento.APROVADO;
    }
}
