import { PlanType, RuleResult } from "@/domain/enums";
import { AuditService } from "./audit-service";

// ============================
// Classificador de Plano
// ============================

const LIMIAR_ANUAL = 119.9;

export interface ClassificacaoResult {
    tipo_plano: PlanType;
    valor: number;
}

/**
 * Classifica o plano baseado exclusivamente no valor da assinatura.
 * > 119.90 = ANUAL_COMPLETO
 * <= 119.90 = RECORRENTE
 */
export async function classificarPlano(
    valor: number,
    traceId: string,
    entidadeId: string,
    auditService: AuditService
): Promise<ClassificacaoResult> {
    const tipo =
        valor > LIMIAR_ANUAL ? PlanType.ANUAL_COMPLETO : PlanType.RECORRENTE;

    await auditService.registrar(traceId, entidadeId, "ClassifyPlanRule", {
        resultado:
            tipo === PlanType.ANUAL_COMPLETO
                ? RuleResult.ANUAL_COMPLETO
                : RuleResult.RECORRENTE,
        payload: {
            entrada: { valor },
            saida: { tipo_plano: tipo },
            limiar: LIMIAR_ANUAL,
        },
        mensagem: `Valor R$${valor.toFixed(2)} ${valor > LIMIAR_ANUAL ? ">" : "<="} R$${LIMIAR_ANUAL.toFixed(2)} → ${tipo}`,
    });

    return { tipo_plano: tipo, valor };
}
