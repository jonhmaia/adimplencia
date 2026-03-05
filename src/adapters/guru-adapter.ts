import { Assinante } from "@/domain/entities";
import { FonteDados } from "@/domain/enums";

// ============================
// Interface do Guru Adapter
// ============================
export interface GuruAdapter {
    fetchAssinaturasAtivas(): Promise<Assinante[]>;
}

// ============================
// Implementação: Guru API Client
// ============================
export class GuruApiAdapter implements GuruAdapter {
    private baseUrl: string;
    private token: string;

    constructor() {
        this.baseUrl = process.env.GURU_API_URL || "";
        this.token = process.env.GURU_API_TOKEN || "";
    }

    async fetchAssinaturasAtivas(): Promise<Assinante[]> {
        if (!this.baseUrl || !this.token) {
            console.warn(
                "[GuruApiAdapter] GURU_API_URL ou GURU_API_TOKEN não configurados. Retornando lista vazia."
            );
            return [];
        }

        try {
            const response = await fetch(`${this.baseUrl}/subscriptions?status=active`, {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${this.token}`,
                    "Content-Type": "application/json",
                },
            });

            if (!response.ok) {
                console.error(
                    `[GuruApiAdapter] Erro ao buscar assinaturas: ${response.status} ${response.statusText}`
                );
                return [];
            }

            const data = await response.json();
            const items: unknown[] = Array.isArray(data) ? data : data.data || data.items || [];

            return items.map((item: unknown) => {
                const record = item as Record<string, unknown>;
                const contact = (record.contact || record.subscriber || {}) as Record<string, unknown>;

                return {
                    cpf: String(contact.doc || contact.cpf || record.cpf || ""),
                    telefone: String(contact.phone_number || contact.telefone || record.telefone || ""),
                    email: String(contact.email || record.email || ""),
                    nome: String(contact.name || contact.nome || record.nome || ""),
                    fonte: FonteDados.GURU,
                    dados_originais: record,
                } satisfies Assinante;
            });
        } catch (error) {
            console.error("[GuruApiAdapter] Erro de conexão:", error);
            return [];
        }
    }
}
