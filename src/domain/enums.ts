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
    PLANILHA = "PLANILHA",
}

/** Status de pagamento da planilha */
export enum StatusPagamento {
    APROVADO = "Pagamento Aprovado",
    NAO_AUTORIZADO = "Não Autorizado",
    PENDENTE = "Pagamento Pendente",
    ESTORNADO = "Estornado",
    RECUSADO_RISCO = "Recusado por Risco",
    CHARGEBACK_TRATATIVA = "Chargeback em Tratativa",
    CHARGEBACK_GANHO = "Chargeback Ganho",
    CHARGEBACK_DISPUTA = "Chargeback em Disputa",
    ANALISE_ANTIFRAUDE = "Análise Antifraude",
}

/** Status de um kit na planilha de materiais */
export enum KitStatus {
    ENVIADO = "ENVIADO",
    NAO_PAGO = "NAO_PAGO",
    NAO_PROCESSADO = "NAO_PROCESSADO",
    COM_MATERIAIS = "COM_MATERIAIS",
}

/** Status de adimplência do assinante */
export enum AdimplenciaStatus {
    ADIMPLENTE = "ADIMPLENTE",
    INADIMPLENTE = "INADIMPLENTE",
    AMBIGUO = "AMBIGUO",
    DADOS_INSUFICIENTES = "DADOS_INSUFICIENTES",
}
