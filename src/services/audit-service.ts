import { createServerSupabaseClient } from "@/lib/supabase";
import { RuleResult } from "@/domain/enums";

// ============================
// Serviço de Auditoria
// ============================

export interface AuditPayload {
    resultado: RuleResult;
    payload: {
        entrada: Record<string, unknown>;
        saida: Record<string, unknown>;
        [key: string]: unknown;
    };
    mensagem: string;
}

export class AuditService {
    private buffer: Array<{
        trace_id: string;
        entidade_id: string;
        regra_avaliada: string;
        resultado_regra: string;
        payload_contexto: Record<string, unknown>;
        mensagem: string;
    }> = [];

    /**
     * Registra um passo de auditoria.
     * Grava imediatamente no Supabase e mantém no buffer local.
     */
    async registrar(
        traceId: string,
        entidadeId: string,
        regra: string,
        data: AuditPayload
    ): Promise<void> {
        const entry = {
            trace_id: traceId,
            entidade_id: entidadeId,
            regra_avaliada: regra,
            resultado_regra: data.resultado,
            payload_contexto: data.payload as unknown as Record<string, unknown>,
            mensagem: data.mensagem,
        };

        this.buffer.push(entry);

        try {
            const supabase = createServerSupabaseClient();
            await supabase.from("audit_logs").insert(entry);
        } catch (err) {
            console.error("[AuditService] Erro ao gravar auditoria:", err);
        }
    }

    /**
     * Retorna todos os logs gravados nesta sessão.
     */
    getBuffer() {
        return [...this.buffer];
    }

    /**
     * Busca logs de auditoria de um trace_id específico.
     */
    static async buscarPorTraceId(traceId: string) {
        const supabase = createServerSupabaseClient();
        const { data, error } = await supabase
            .from("audit_logs")
            .select("*")
            .eq("trace_id", traceId)
            .order("timestamp", { ascending: true });

        if (error) {
            console.error("[AuditService] Erro ao buscar logs:", error);
            return [];
        }

        return data || [];
    }
}
