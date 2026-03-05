// ============================
// Serviço de Normalização
// ============================

/**
 * Normaliza CPF: extrai apenas dígitos.
 * Retorna null se inválido ou vazio.
 */
export function normalizeCpf(cpf: string | null | undefined): string | null {
    if (!cpf) return null;
    const digits = cpf.replace(/\D/g, "");
    if (digits.length < 11) return null;
    // Pega os últimos 11 dígitos (caso tenha DDI ou prefixo)
    return digits.slice(-11);
}

/**
 * Normaliza telefone: extrai apenas dígitos e força DDI 55 se ausente.
 * Retorna null se inválido ou vazio.
 */
export function normalizeTelefone(
    telefone: string | null | undefined
): string | null {
    if (!telefone) return null;
    const digits = telefone.replace(/\D/g, "");
    if (digits.length < 10) return null;

    // Se já começa com 55 e tem 12-13 dígitos, mantém
    if (digits.startsWith("55") && digits.length >= 12) {
        return digits;
    }

    // Caso contrário, adiciona DDI 55
    return `55${digits}`;
}

/**
 * Normaliza e-mail: trim + lowercase.
 * Retorna null se inválido ou vazio.
 */
export function normalizeEmail(
    email: string | null | undefined
): string | null {
    if (!email) return null;
    const normalized = email.trim().toLowerCase();
    if (!normalized.includes("@")) return null;
    return normalized;
}
