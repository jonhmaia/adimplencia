import { Assinante } from "@/domain/entities";
import { FonteDados } from "@/domain/enums";

// ============================
// Interface do Guru Adapter
// ============================
export interface GuruAdapter {
    fetchAssinaturas(): Promise<Assinante[]>;
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

    async fetchAssinaturas(): Promise<Assinante[]> {
        if (!this.baseUrl || !this.token) {
            console.warn(
                "[GuruApiAdapter] GURU_API_URL ou GURU_API_TOKEN não configurados. Retornando lista vazia."
            );
            return [];
        }

        const allAssinantes: Assinante[] = [];
        let currentPage = 1;
        let hasMore = true;

        try {
            while (hasMore) {
                const response = await fetch(`${this.baseUrl}/subscriptions?page=${currentPage}`, {
                    method: "GET",
                    headers: {
                        Authorization: `Bearer ${this.token}`,
                        "Content-Type": "application/json",
                    },
                });

                if (!response.ok) {
                    console.error(
                        `[GuruApiAdapter] Erro ao buscar assinaturas (Pág ${currentPage}): ${response.status} ${response.statusText}`
                    );
                    break;
                }

                const data = await response.json();
                const items: unknown[] = Array.isArray(data) ? data : (data.data || data.items || []);

                if (items.length === 0) {
                    hasMore = false;
                    break;
                }

                const mapped = items.map((item: unknown) => {
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

                allAssinantes.push(...mapped);

                // Lógica de parada baseada na estrutura comum de APIs paginadas
                // Se o retorno tiver metadados de paginação (last_page)
                if (data.last_page && currentPage >= data.last_page) {
                    hasMore = false;
                } else if (!data.last_page && items.length < 50) {
                    // Se não tiver metadados, mas a página veio incompleta, é a última
                    hasMore = false;
                } else {
                    currentPage++;
                }

                // Segurança para não entrar em loop infinito
                if (currentPage > 100) break;
            }

            return allAssinantes;
        } catch (error) {
            console.error("[GuruApiAdapter] Erro de conexão:", error);
            return allAssinantes;
        }
    }
}
