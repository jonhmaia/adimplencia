import { Assinante, TransacaoAppMax, TransacaoAppMaxSchema } from "@/domain/entities";
import { FonteDados } from "@/domain/enums";
import mockData from "./appmax-mock-data.json";

// ============================
// Interface do AppMax Adapter
// ============================
export interface AppMaxAdapter {
    fetchTransacoes(): Promise<TransacaoAppMax[]>;
    toAssinantes(transacoes: TransacaoAppMax[]): Assinante[];
}

// ============================
// Implementação Mock: lê de JSON local
// ============================
export class AppMaxMockAdapter implements AppMaxAdapter {
    async fetchTransacoes(): Promise<TransacaoAppMax[]> {
        // Valida cada item com o schema Zod
        const validated: TransacaoAppMax[] = [];

        for (const item of mockData) {
            try {
                const parsed = TransacaoAppMaxSchema.parse(item);
                validated.push(parsed);
            } catch (err) {
                console.warn("[AppMaxMockAdapter] Item inválido ignorado:", item, err);
            }
        }

        return validated;
    }

    toAssinantes(transacoes: TransacaoAppMax[]): Assinante[] {
        return transacoes.map((tx) => ({
            cpf: tx.cpf || null,
            telefone: tx.telefone || null,
            email: tx.email || null,
            nome: null,
            fonte: FonteDados.APPMAX,
            dados_originais: tx as unknown as Record<string, unknown>,
        }));
    }
}

// ============================
// Implementação Real (futuro)
// ============================
export class AppMaxApiAdapter implements AppMaxAdapter {
    private baseUrl: string;
    private token: string;

    constructor() {
        this.baseUrl = process.env.APPMAX_API_URL || "";
        this.token = process.env.APPMAX_API_TOKEN || "";
    }

    async fetchTransacoes(): Promise<TransacaoAppMax[]> {
        if (!this.baseUrl || !this.token) {
            console.warn(
                "[AppMaxApiAdapter] APPMAX_API_URL ou APPMAX_API_TOKEN não configurados."
            );
            return [];
        }

        const response = await fetch(`${this.baseUrl}/transactions`, {
            headers: {
                Authorization: `Bearer ${this.token}`,
                "Content-Type": "application/json",
            },
        });

        if (!response.ok) {
            throw new Error(`AppMax API erro: ${response.status}`);
        }

        const data = await response.json();
        const items: unknown[] = Array.isArray(data) ? data : data.data || [];

        return items.map((item) => TransacaoAppMaxSchema.parse(item));
    }

    toAssinantes(transacoes: TransacaoAppMax[]): Assinante[] {
        return transacoes.map((tx) => ({
            cpf: tx.cpf || null,
            telefone: tx.telefone || null,
            email: tx.email || null,
            nome: null,
            fonte: FonteDados.APPMAX,
            dados_originais: tx as unknown as Record<string, unknown>,
        }));
    }
}
