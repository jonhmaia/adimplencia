// ============================
// Enums do Domínio
// ============================

/** Tipo de plano classificado pelo valor da assinatura */
export enum PlanType {
    ANUAL_COMPLETO = "ANUAL_COMPLETO",
    RECORRENTE = "RECORRENTE",
}

/** Status do match no cruzamento de bases */
export enum MatchStatus {
    MATCH_EXACT = "MATCH_EXACT",
    AMBIGUO = "AMBIGUO",
    SEM_MATCH = "SEM_MATCH",
}

/** Tipo da chave utilizada para realizar o match */
export enum MatchKey {
    CPF = "CPF",
    TELEFONE = "TELEFONE",
    EMAIL = "EMAIL",
}

/** Resultado possível de uma regra */
export enum RuleResult {
    MATCH_EXACT = "MATCH_EXACT",
    AMBIGUO = "AMBIGUO",
    SEM_MATCH = "SEM_MATCH",
    ADIMPLENTE = "ADIMPLENTE",
    INADIMPLENTE = "INADIMPLENTE",
    ANUAL_COMPLETO = "ANUAL_COMPLETO",
    RECORRENTE = "RECORRENTE",
    ERRO = "ERRO",
}

/** Fonte de dados do assinante */
export enum FonteDados {
    GURU = "GURU",
    APPMAX = "APPMAX",
}
