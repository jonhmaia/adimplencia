import { z } from "zod";
import { FonteDados, MatchStatus, PlanType, RuleResult } from "./enums";

// ============================
// Schema: Assinante (normalizado)
// ============================
export const AssinanteSchema = z.object({
    id: z.string().uuid().optional(),
    cpf: z.string().nullable().optional(),
    telefone: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    nome: z.string().nullable().optional(),
    fonte: z.nativeEnum(FonteDados),
    dados_originais: z.record(z.string(), z.unknown()).optional().default({}),
    created_at: z.string().optional(),
});

export type Assinante = z.infer<typeof AssinanteSchema>;

// ============================
// Schema: Transação AppMax
// ============================
export const TransacaoAppMaxSchema = z.object({
    cpf: z.string().nullable().optional(),
    telefone: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    data: z.string(),
    valor_pago: z.number(),
    status: z.string(),
    transacao_id: z.string(),
});

export type TransacaoAppMax = z.infer<typeof TransacaoAppMaxSchema>;

// ============================
// Schema: Resultado do Merge
// ============================
export const MergeResultSchema = z.object({
    id: z.string().uuid().optional(),
    trace_id: z.string().uuid(),
    assinante_guru_id: z.string().uuid().nullable().optional(),
    assinante_appmax_id: z.string().uuid().nullable().optional(),
    chave_match: z.string().nullable().optional(),
    status_match: z.nativeEnum(MatchStatus),
    tipo_plano: z.nativeEnum(PlanType).nullable().optional(),
    valor_assinatura: z.number().nullable().optional(),
    adimplente: z.boolean().default(false),
    detalhes: z.record(z.string(), z.unknown()).optional().default({}),
    created_at: z.string().optional(),
});

export type MergeResult = z.infer<typeof MergeResultSchema>;

// ============================
// Schema: Entrada de Auditoria
// ============================
export const AuditEntrySchema = z.object({
    id: z.string().uuid().optional(),
    trace_id: z.string().uuid(),
    timestamp: z.string().optional(),
    entidade_id: z.string(),
    regra_avaliada: z.string(),
    resultado_regra: z.nativeEnum(RuleResult),
    payload_contexto: z.record(z.string(), z.unknown()).optional().default({}),
    mensagem: z.string().nullable().optional(),
    created_at: z.string().optional(),
});

export type AuditEntry = z.infer<typeof AuditEntrySchema>;
