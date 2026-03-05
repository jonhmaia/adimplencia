import { Assinante } from "@/domain/entities";
import { AmbiguityException } from "@/domain/exceptions";
import { MatchKey, MatchStatus, RuleResult } from "@/domain/enums";
import { normalizeCpf, normalizeEmail, normalizeTelefone } from "./normalizer";
import { AuditService } from "./audit-service";

// ============================
// Motor de Matching (Chain of Responsibility)
// ============================

export interface MatchResult {
    status: MatchStatus;
    chave: MatchKey | null;
    assinanteGuru: Assinante;
    assinanteAppmax: Assinante | null;
}

/**
 * Interface para um handler na cadeia de responsabilidade.
 */
interface MatchHandler {
    setNext(handler: MatchHandler): MatchHandler;
    handle(
        guru: Assinante,
        appmaxList: Assinante[],
        traceId: string,
        auditService: AuditService
    ): Promise<MatchResult>;
}

/**
 * Classe base abstrata para handlers do chain.
 */
abstract class BaseMatchHandler implements MatchHandler {
    private nextHandler: MatchHandler | null = null;

    setNext(handler: MatchHandler): MatchHandler {
        this.nextHandler = handler;
        return handler;
    }

    async handle(
        guru: Assinante,
        appmaxList: Assinante[],
        traceId: string,
        auditService: AuditService
    ): Promise<MatchResult> {
        if (this.nextHandler) {
            return this.nextHandler.handle(guru, appmaxList, traceId, auditService);
        }

        // Nenhum handler encontrou match
        const entidadeId = guru.cpf || guru.email || guru.telefone || "desconhecido";
        await auditService.registrar(traceId, entidadeId, "FinalNoMatch", {
            resultado: RuleResult.SEM_MATCH,
            payload: {
                entrada: { guru_id: guru.id, nome: guru.nome },
                saida: { status: "SEM_MATCH" },
            },
            mensagem: `Nenhuma chave (CPF, Telefone, E-mail) encontrou match para o assinante "${guru.nome}"`,
        });

        return {
            status: MatchStatus.SEM_MATCH,
            chave: null,
            assinanteGuru: guru,
            assinanteAppmax: null,
        };
    }
}

// ============================
// Handler 1: Match por CPF
// ============================
class CpfMatchHandler extends BaseMatchHandler {
    async handle(
        guru: Assinante,
        appmaxList: Assinante[],
        traceId: string,
        auditService: AuditService
    ): Promise<MatchResult> {
        const cpfGuru = normalizeCpf(guru.cpf);
        const entidadeId = cpfGuru || guru.email || guru.telefone || "desconhecido";

        if (!cpfGuru) {
            await auditService.registrar(traceId, entidadeId, "CpfMatchRule", {
                resultado: RuleResult.SEM_MATCH,
                payload: {
                    entrada: { cpf_original: guru.cpf },
                    saida: { cpf_normalizado: null },
                },
                mensagem: "CPF do Guru ausente ou inválido. Passando para próxima regra.",
            });
            return super.handle(guru, appmaxList, traceId, auditService);
        }

        const matches = appmaxList.filter(
            (appmax) => normalizeCpf(appmax.cpf) === cpfGuru
        );

        if (matches.length === 0) {
            await auditService.registrar(traceId, entidadeId, "CpfMatchRule", {
                resultado: RuleResult.SEM_MATCH,
                payload: {
                    entrada: { cpf_normalizado: cpfGuru },
                    saida: { matches_encontrados: 0 },
                },
                mensagem: `CPF ${cpfGuru} não encontrado na base AppMax. Passando para próxima regra.`,
            });
            return super.handle(guru, appmaxList, traceId, auditService);
        }

        if (matches.length > 1) {
            await auditService.registrar(traceId, entidadeId, "CheckCollisionRule", {
                resultado: RuleResult.AMBIGUO,
                payload: {
                    entrada: { cpf_normalizado: cpfGuru, chave: "CPF" },
                    saida: {
                        matches_encontrados: matches.length,
                        registros: matches.map((m) => m.dados_originais),
                    },
                },
                mensagem: `AMBIGUIDADE: ${matches.length} registros encontrados para CPF=${cpfGuru}. Cruzamento abortado.`,
            });

            throw new AmbiguityException("CPF", cpfGuru, matches.length);
        }

        await auditService.registrar(traceId, entidadeId, "CpfMatchRule", {
            resultado: RuleResult.MATCH_EXACT,
            payload: {
                entrada: { cpf_normalizado: cpfGuru },
                saida: { match: matches[0].dados_originais },
            },
            mensagem: `Match exato por CPF=${cpfGuru}`,
        });

        return {
            status: MatchStatus.MATCH_EXACT,
            chave: MatchKey.CPF,
            assinanteGuru: guru,
            assinanteAppmax: matches[0],
        };
    }
}

// ============================
// Handler 2: Match por Telefone
// ============================
class TelefoneMatchHandler extends BaseMatchHandler {
    async handle(
        guru: Assinante,
        appmaxList: Assinante[],
        traceId: string,
        auditService: AuditService
    ): Promise<MatchResult> {
        const telGuru = normalizeTelefone(guru.telefone);
        const entidadeId = guru.cpf || guru.email || guru.telefone || "desconhecido";

        if (!telGuru) {
            await auditService.registrar(traceId, entidadeId, "TelefoneMatchRule", {
                resultado: RuleResult.SEM_MATCH,
                payload: {
                    entrada: { telefone_original: guru.telefone },
                    saida: { telefone_normalizado: null },
                },
                mensagem:
                    "Telefone do Guru ausente ou inválido. Passando para próxima regra.",
            });
            return super.handle(guru, appmaxList, traceId, auditService);
        }

        const matches = appmaxList.filter(
            (appmax) => normalizeTelefone(appmax.telefone) === telGuru
        );

        if (matches.length === 0) {
            await auditService.registrar(traceId, entidadeId, "TelefoneMatchRule", {
                resultado: RuleResult.SEM_MATCH,
                payload: {
                    entrada: { telefone_normalizado: telGuru },
                    saida: { matches_encontrados: 0 },
                },
                mensagem: `Telefone ${telGuru} não encontrado na base AppMax. Passando para próxima regra.`,
            });
            return super.handle(guru, appmaxList, traceId, auditService);
        }

        if (matches.length > 1) {
            await auditService.registrar(traceId, entidadeId, "CheckCollisionRule", {
                resultado: RuleResult.AMBIGUO,
                payload: {
                    entrada: { telefone_normalizado: telGuru, chave: "TELEFONE" },
                    saida: {
                        matches_encontrados: matches.length,
                        registros: matches.map((m) => m.dados_originais),
                    },
                },
                mensagem: `AMBIGUIDADE: ${matches.length} registros encontrados para TELEFONE=${telGuru}.`,
            });

            throw new AmbiguityException("TELEFONE", telGuru, matches.length);
        }

        await auditService.registrar(traceId, entidadeId, "TelefoneMatchRule", {
            resultado: RuleResult.MATCH_EXACT,
            payload: {
                entrada: { telefone_normalizado: telGuru },
                saida: { match: matches[0].dados_originais },
            },
            mensagem: `Match exato por TELEFONE=${telGuru}`,
        });

        return {
            status: MatchStatus.MATCH_EXACT,
            chave: MatchKey.TELEFONE,
            assinanteGuru: guru,
            assinanteAppmax: matches[0],
        };
    }
}

// ============================
// Handler 3: Match por E-mail
// ============================
class EmailMatchHandler extends BaseMatchHandler {
    async handle(
        guru: Assinante,
        appmaxList: Assinante[],
        traceId: string,
        auditService: AuditService
    ): Promise<MatchResult> {
        const emailGuru = normalizeEmail(guru.email);
        const entidadeId = guru.cpf || guru.email || guru.telefone || "desconhecido";

        if (!emailGuru) {
            await auditService.registrar(traceId, entidadeId, "EmailMatchRule", {
                resultado: RuleResult.SEM_MATCH,
                payload: {
                    entrada: { email_original: guru.email },
                    saida: { email_normalizado: null },
                },
                mensagem:
                    "E-mail do Guru ausente ou inválido. Nenhuma regra restante.",
            });
            return super.handle(guru, appmaxList, traceId, auditService);
        }

        const matches = appmaxList.filter(
            (appmax) => normalizeEmail(appmax.email) === emailGuru
        );

        if (matches.length === 0) {
            await auditService.registrar(traceId, entidadeId, "EmailMatchRule", {
                resultado: RuleResult.SEM_MATCH,
                payload: {
                    entrada: { email_normalizado: emailGuru },
                    saida: { matches_encontrados: 0 },
                },
                mensagem: `E-mail ${emailGuru} não encontrado na base AppMax.`,
            });
            return super.handle(guru, appmaxList, traceId, auditService);
        }

        if (matches.length > 1) {
            await auditService.registrar(traceId, entidadeId, "CheckCollisionRule", {
                resultado: RuleResult.AMBIGUO,
                payload: {
                    entrada: { email_normalizado: emailGuru, chave: "EMAIL" },
                    saida: {
                        matches_encontrados: matches.length,
                        registros: matches.map((m) => m.dados_originais),
                    },
                },
                mensagem: `AMBIGUIDADE: ${matches.length} registros encontrados para EMAIL=${emailGuru}.`,
            });

            throw new AmbiguityException("EMAIL", emailGuru, matches.length);
        }

        await auditService.registrar(traceId, entidadeId, "EmailMatchRule", {
            resultado: RuleResult.MATCH_EXACT,
            payload: {
                entrada: { email_normalizado: emailGuru },
                saida: { match: matches[0].dados_originais },
            },
            mensagem: `Match exato por EMAIL=${emailGuru}`,
        });

        return {
            status: MatchStatus.MATCH_EXACT,
            chave: MatchKey.EMAIL,
            assinanteGuru: guru,
            assinanteAppmax: matches[0],
        };
    }
}

// ============================
// Fábrica da cadeia
// ============================

/**
 * Cria a cadeia de responsabilidade para matching:
 * CPF → Telefone → E-mail
 */
export function criarCadeiaMatching(): MatchHandler {
    const cpfHandler = new CpfMatchHandler();
    const telefoneHandler = new TelefoneMatchHandler();
    const emailHandler = new EmailMatchHandler();

    cpfHandler.setNext(telefoneHandler).setNext(emailHandler);

    return cpfHandler;
}
