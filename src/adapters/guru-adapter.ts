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
                    const product = (record.product || {}) as Record<string, unknown>;
                    const productGroup = (product.group || {}) as Record<string, unknown>;

                    // Montar telefone completo com DDI
                    const phoneLocalCode = String(contact.phone_local_code || "55");
                    const phoneNumber = String(contact.phone_number || contact.telefone || record.telefone || "");
                    const telefoneCompleto = phoneNumber ? `${phoneLocalCode}${phoneNumber}` : "";

                    return {
                        cpf: String(contact.doc || contact.cpf || record.cpf || ""),
                        telefone: telefoneCompleto,
                        email: String(contact.email || record.email || ""),
                        nome: String(contact.name || contact.nome || record.nome || ""),
                        fonte: FonteDados.GURU,
                        dados_originais: {
                            // Identificação
                            guru_id: String(record.id || ""),
                            contact_id: String(contact.id || ""),
                            subscription_code: String(record.subscription_code || ""),

                            // Status da assinatura
                            last_status: String(record.last_status || ""),
                            last_status_at: record.last_status_at,
                            cancel_at_cycle_end: record.cancel_at_cycle_end,
                            cancelled_at: record.cancelled_at,
                            is_cycling: record.is_cycling,

                            // Ciclos e cobranças
                            charged_every_days: record.charged_every_days,
                            charged_times: record.charged_times,
                            cycle_start_date: String(record.cycle_start_date || ""),
                            cycle_end_date: String(record.cycle_end_date || ""),
                            next_cycle_at: String(record.next_cycle_at || ""),

                            // Produto
                            product_id: String(product.id || ""),
                            product_name: String(product.name || ""),
                            product_marketplace_id: String(product.marketplace_id || ""),
                            product_marketplace_name: String(product.marketplace_name || ""),
                            product_group_id: productGroup.id || null,
                            product_group_name: String(productGroup.name || ""),

                            // Pagamento
                            payment_method: String(record.payment_method || ""),

                            // Datas
                            started_at: record.started_at,
                            created_at: record.created_at,
                            updated_at: record.updated_at,

                            // Trial
                            trial_started_at: record.trial_started_at,
                            trial_finished_at: record.trial_finished_at,

                            // Contratos
                            contracts: record.contracts,
                            own_engine: record.own_engine,
                        } as unknown as Record<string, unknown>,
                    } satisfies Assinante;
                });

                allAssinantes.push(...mapped);

                // Parada baseada na estrutura de APIs paginadas
                if (data.last_page && currentPage >= data.last_page) {
                    hasMore = false;
                } else if (!data.last_page && items.length < 50) {
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
