import { Assinante } from "@/domain/entities";
import { AmbiguityException } from "@/domain/exceptions";
import { MatchKey, MatchStatus } from "@/domain/enums";
import { normalizeCpf, normalizeEmail, normalizeTelefone } from "./normalizer";

// ============================
// Motor de Matching Otimizado (Map-based O(1) lookups)
// ============================

export interface MatchResult {
    status: MatchStatus;
    chave: MatchKey | null;
    assinanteGuru: Assinante;
    assinantePlanilha: Assinante | null;
    todosPedidos: Assinante[]; // todos os pedidos da mesma pessoa
}

export interface MatchMaps {
    cpf: Map<string, Assinante[]>;
    telefone: Map<string, Assinante[]>;
    email: Map<string, Assinante[]>;
}

/**
 * Constrói Maps indexados por CPF, telefone e email para lookup O(1).
 */
export function construirMapsMatching(planilhaList: Assinante[]): MatchMaps {
    const cpfMap = new Map<string, Assinante[]>();
    const telefoneMap = new Map<string, Assinante[]>();
    const emailMap = new Map<string, Assinante[]>();

    for (const item of planilhaList) {
        const cpf = normalizeCpf(item.cpf);
        if (cpf) {
            const arr = cpfMap.get(cpf) || [];
            arr.push(item);
            cpfMap.set(cpf, arr);
        }

        const tel = normalizeTelefone(item.telefone);
        if (tel) {
            const arr = telefoneMap.get(tel) || [];
            arr.push(item);
            telefoneMap.set(tel, arr);
        }

        const email = normalizeEmail(item.email);
        if (email) {
            const arr = emailMap.get(email) || [];
            arr.push(item);
            emailMap.set(email, arr);
        }
    }

    return { cpf: cpfMap, telefone: telefoneMap, email: emailMap };
}

/**
 * Seleciona o melhor pedido entre múltiplos registros da mesma pessoa.
 * Prioridade: "Pagamento Aprovado" > mais recente > primeiro encontrado.
 */
function selecionarMelhorPedido(registros: Assinante[]): Assinante {
    if (registros.length === 1) return registros[0];

    // Priorizar pedido com status "Pagamento Aprovado"
    const aprovado = registros.find((r) => {
        const dados = r.dados_originais as Record<string, unknown>;
        return String(dados.status || "") === "Pagamento Aprovado";
    });
    if (aprovado) return aprovado;

    // Senão, retorna o mais recente (por data_pagamento ou criado_em)
    const comData = registros
        .map((r) => {
            const dados = r.dados_originais as Record<string, unknown>;
            const dataPagamento = dados.data_pagamento;
            const criadoEm = dados.criado_em;
            const dataStr = String(dataPagamento || criadoEm || "");
            return { registro: r, data: dataStr };
        })
        .filter((r) => r.data.length > 0)
        .sort((a, b) => b.data.localeCompare(a.data));

    return comData.length > 0 ? comData[0].registro : registros[0];
}

/**
 * Verifica se múltiplos registros pertencem à mesma pessoa.
 * Mesma pessoa = mesmo email OU nomes similares.
 */
function isMesmaPessoa(registros: Assinante[]): boolean {
    if (registros.length <= 1) return true;

    // Se todos têm o mesmo email, é a mesma pessoa
    const emails = new Set(registros.map(r => normalizeEmail(r.email)).filter(Boolean));
    if (emails.size <= 1) return true;

    // Se a maioria compartilha o mesmo nome (ignorando case), é a mesma pessoa
    const nomes = registros.map(r => (r.nome || "").toLowerCase().trim()).filter(Boolean);
    if (nomes.length > 0) {
        const nomeFrequente = nomes.sort((a, b) =>
            nomes.filter(n => n === b).length - nomes.filter(n => n === a).length
        )[0];
        const qtdMesmoNome = nomes.filter(n => n === nomeFrequente).length;
        if (qtdMesmoNome >= registros.length * 0.5) return true;
    }

    return false;
}

/**
 * Executa matching de um assinante Guru contra os Maps pré-construídos.
 * Ordem: CPF → Telefone → Email.
 * Múltiplos pedidos da mesma pessoa = match (não ambiguidade).
 */
export function executarMatching(
    guru: Assinante,
    maps: MatchMaps
): MatchResult {
    const cpfGuru = normalizeCpf(guru.cpf);
    const telGuru = normalizeTelefone(guru.telefone);
    const emailGuru = normalizeEmail(guru.email);

    // 1. Tentar CPF
    if (cpfGuru) {
        const matches = maps.cpf.get(cpfGuru) || [];
        if (matches.length >= 1) {
            if (matches.length === 1 || isMesmaPessoa(matches)) {
                const melhor = selecionarMelhorPedido(matches);
                return {
                    status: MatchStatus.MATCH_EXACT,
                    chave: MatchKey.CPF,
                    assinanteGuru: guru,
                    assinantePlanilha: melhor,
                    todosPedidos: matches,
                };
            }
            // Realmente pessoas diferentes com mesmo CPF (raro)
            throw new AmbiguityException("CPF", cpfGuru, matches.length);
        }
    }

    // 2. Tentar Telefone
    if (telGuru) {
        const matches = maps.telefone.get(telGuru) || [];
        if (matches.length >= 1) {
            if (matches.length === 1 || isMesmaPessoa(matches)) {
                const melhor = selecionarMelhorPedido(matches);
                return {
                    status: MatchStatus.MATCH_EXACT,
                    chave: MatchKey.TELEFONE,
                    assinanteGuru: guru,
                    assinantePlanilha: melhor,
                    todosPedidos: matches,
                };
            }
            throw new AmbiguityException("TELEFONE", telGuru, matches.length);
        }
    }

    // 3. Tentar Email
    if (emailGuru) {
        const matches = maps.email.get(emailGuru) || [];
        if (matches.length >= 1) {
            if (matches.length === 1 || isMesmaPessoa(matches)) {
                const melhor = selecionarMelhorPedido(matches);
                return {
                    status: MatchStatus.MATCH_EXACT,
                    chave: MatchKey.EMAIL,
                    assinanteGuru: guru,
                    assinantePlanilha: melhor,
                    todosPedidos: matches,
                };
            }
            throw new AmbiguityException("EMAIL", emailGuru, matches.length);
        }
    }

    // Nenhum match
    return {
        status: MatchStatus.SEM_MATCH,
        chave: null,
        assinanteGuru: guru,
        assinantePlanilha: null,
        todosPedidos: [],
    };
}
