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
// Schema: Pedido da Planilha (substitui TransacaoAppMax)
// ============================
// Helper: aceitar qualquer tipo primitivo, converter para o tipo desejado
const flexString = z.union([z.string(), z.number(), z.boolean()]).transform(String).nullable().optional();
const flexNumber = z.union([z.number(), z.string().transform(Number)]).nullable().optional();

export const PedidoPlanilhaSchema = z.object({
    id_pedido: z.union([z.number(), z.string().transform(Number)]),
    total_venda: z.union([z.number(), z.string().transform(Number)]),
    desconto: flexNumber.default(0),
    parcelas: flexNumber.default(1),
    total_liquido: flexNumber.default(0),
    taxa_parcelamento: flexNumber.default(0),
    valor_frete: flexNumber.default(0),
    tipo_frete: flexString,
    origem: flexString,
    tipo_pagamento: flexString,
    status: z.union([z.string(), z.number()]).transform(String),
    hash: flexString,
    criado_em: z.union([z.number(), z.string()]).nullable().optional(),
    utm_source: flexString,
    utm_medium: flexString,
    utm_campaign: flexString,
    utm_content: flexString,
    utm_term: flexString,
    data_pagamento: z.union([z.number(), z.string()]).nullable().optional(),
    nota_fiscal: flexString,
    pedido_venda: flexString,
    nome: flexString,
    sobrenome: flexString,
    numero_documento: z.union([z.number(), z.string()]).nullable().optional(),
    email: flexString,
    telefone: z.union([z.number(), z.string()]).nullable().optional(),
    rua: flexString,
    numero: z.union([z.number(), z.string()]).nullable().optional(),
    complemento: flexString,
    bairro: flexString,
    cidade: flexString,
    estado: flexString,
    cep: z.union([z.number(), z.string()]).nullable().optional(),
    país: flexString,
});

export type PedidoPlanilha = z.infer<typeof PedidoPlanilhaSchema>;

// ============================
// Schema: Resultado do Merge
// ============================
export const MergeResultSchema = z.object({
    id: z.string().uuid().optional(),
    trace_id: z.string().uuid(),
    assinante_guru_id: z.string().uuid().nullable().optional(),
    assinante_planilha_id: z.string().uuid().nullable().optional(),
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
