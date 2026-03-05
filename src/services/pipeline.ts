import { v4 as uuidv4 } from "uuid";
import { createServerSupabaseClient } from "@/lib/supabase";
import { Assinante } from "@/domain/entities";
import { AmbiguityException } from "@/domain/exceptions";
import { FonteDados, MatchStatus, RuleResult } from "@/domain/enums";
import { normalizeCpf, normalizeEmail, normalizeTelefone } from "./normalizer";
import { AuditService } from "./audit-service";
import { criarCadeiaMatching, MatchResult } from "./matching-engine";
import { classificarPlano } from "./plan-classifier";
import { GuruAdapter, GuruApiAdapter } from "@/adapters/guru-adapter";
import { AppMaxAdapter, AppMaxMockAdapter } from "@/adapters/appmax-adapter";

// ============================
// Pipeline Orquestrador
// ============================

export interface PipelineResult {
    trace_id: string;
    total_guru: number;
    total_appmax: number;
    processados: number;
    match_exato: number;
    ambiguos: number;
    sem_match: number;
    resultados: MergeResultadoPipeline[];
}

export interface MergeResultadoPipeline {
    trace_id: string;
    assinante_guru_id: string | null;
    assinante_appmax_id: string | null;
    chave_match: string | null;
    status_match: MatchStatus;
    tipo_plano: string | null;
    valor_assinatura: number | null;
    adimplente: boolean;
    detalhes: Record<string, unknown>;
}

export class PipelineService {
    private guruAdapter: GuruAdapter;
    private appmaxAdapter: AppMaxAdapter;
    private auditService: AuditService;

    constructor(
        guruAdapter?: GuruAdapter,
        appmaxAdapter?: AppMaxAdapter,
        auditService?: AuditService
    ) {
        this.guruAdapter = guruAdapter || new GuruApiAdapter();
        this.appmaxAdapter = appmaxAdapter || new AppMaxMockAdapter();
        this.auditService = auditService || new AuditService();
    }

    /**
     * Executa o pipeline completo de ETL, matching e classificação.
     */
    async executar(): Promise<PipelineResult> {
        const traceId = uuidv4();
        const supabase = createServerSupabaseClient();
        const cadeia = criarCadeiaMatching();

        // 1. Fetch dados das fontes
        await this.auditService.registrar(traceId, "PIPELINE", "PipelineStart", {
            resultado: RuleResult.MATCH_EXACT,
            payload: {
                entrada: { timestamp: new Date().toISOString() },
                saida: { trace_id: traceId },
            },
            mensagem: `Pipeline iniciado com trace_id=${traceId}`,
        });

        const guruRaw = await this.guruAdapter.fetchAssinaturasAtivas();
        const appmaxTransacoes = await this.appmaxAdapter.fetchTransacoes();
        const appmaxAssinantes = this.appmaxAdapter.toAssinantes(appmaxTransacoes);

        // 2. Normalizar assinantes Guru
        const guruNormalizados: Assinante[] = guruRaw.map((g) => ({
            ...g,
            cpf: normalizeCpf(g.cpf) || g.cpf,
            telefone: normalizeTelefone(g.telefone) || g.telefone,
            email: normalizeEmail(g.email) || g.email,
            fonte: FonteDados.GURU,
        }));

        // 3. Normalizar assinantes AppMax
        const appmaxNormalizados: Assinante[] = appmaxAssinantes.map((a) => ({
            ...a,
            cpf: normalizeCpf(a.cpf) || a.cpf,
            telefone: normalizeTelefone(a.telefone) || a.telefone,
            email: normalizeEmail(a.email) || a.email,
            fonte: FonteDados.APPMAX,
        }));

        await this.auditService.registrar(traceId, "PIPELINE", "DataIngestion", {
            resultado: RuleResult.MATCH_EXACT,
            payload: {
                entrada: {},
                saida: {
                    total_guru: guruNormalizados.length,
                    total_appmax: appmaxNormalizados.length,
                },
            },
            mensagem: `Dados carregados: ${guruNormalizados.length} registros Guru, ${appmaxNormalizados.length} registros AppMax`,
        });

        // 4. Persistir assinantes no Supabase
        const guruIds: Record<number, string> = {};
        for (let i = 0; i < guruNormalizados.length; i++) {
            const { data } = await supabase
                .from("assinantes")
                .insert({
                    cpf: guruNormalizados[i].cpf,
                    telefone: guruNormalizados[i].telefone,
                    email: guruNormalizados[i].email,
                    nome: guruNormalizados[i].nome,
                    fonte: FonteDados.GURU,
                    dados_originais: guruNormalizados[i].dados_originais,
                })
                .select("id")
                .single();
            if (data) guruIds[i] = data.id;
            guruNormalizados[i].id = data?.id;
        }

        const appmaxIds: Record<number, string> = {};
        for (let i = 0; i < appmaxNormalizados.length; i++) {
            const { data } = await supabase
                .from("assinantes")
                .insert({
                    cpf: appmaxNormalizados[i].cpf,
                    telefone: appmaxNormalizados[i].telefone,
                    email: appmaxNormalizados[i].email,
                    nome: appmaxNormalizados[i].nome,
                    fonte: FonteDados.APPMAX,
                    dados_originais: appmaxNormalizados[i].dados_originais,
                })
                .select("id")
                .single();
            if (data) appmaxIds[i] = data.id;
            appmaxNormalizados[i].id = data?.id;
        }

        // 5. Executar matching para cada assinante Guru
        const resultados: MergeResultadoPipeline[] = [];
        let matchExato = 0;
        let ambiguos = 0;
        let semMatch = 0;

        for (const guru of guruNormalizados) {
            const entidadeId = guru.cpf || guru.email || guru.telefone || "desconhecido";

            try {
                const matchResult: MatchResult = await cadeia.handle(
                    guru,
                    appmaxNormalizados,
                    traceId,
                    this.auditService
                );

                // 6. Classificar plano se houve match
                let tipoPlano: string | null = null;
                let valorAssinatura: number | null = null;
                let adimplente = false;

                if (
                    matchResult.status === MatchStatus.MATCH_EXACT &&
                    matchResult.assinanteAppmax
                ) {
                    const dadosAppmax = matchResult.assinanteAppmax
                        .dados_originais as Record<string, unknown>;
                    valorAssinatura = Number(dadosAppmax.valor_pago || 0);

                    const classificacao = await classificarPlano(
                        valorAssinatura,
                        traceId,
                        entidadeId,
                        this.auditService
                    );
                    tipoPlano = classificacao.tipo_plano;

                    // Verificar adimplência baseado no status da transação
                    const statusTx = String(dadosAppmax.status || "").toUpperCase();
                    adimplente = statusTx === "APROVADO";

                    await this.auditService.registrar(
                        traceId,
                        entidadeId,
                        "AdimplenciaCheckRule",
                        {
                            resultado: adimplente
                                ? RuleResult.ADIMPLENTE
                                : RuleResult.INADIMPLENTE,
                            payload: {
                                entrada: {
                                    status_transacao: statusTx,
                                    valor: valorAssinatura,
                                },
                                saida: { adimplente, tipo_plano: tipoPlano },
                            },
                            mensagem: `Assinante ${entidadeId}: status_tx=${statusTx}, adimplente=${adimplente}, plano=${tipoPlano}`,
                        }
                    );

                    matchExato++;
                } else {
                    semMatch++;
                }

                const mergeResult: MergeResultadoPipeline = {
                    trace_id: traceId,
                    assinante_guru_id: guru.id || null,
                    assinante_appmax_id: matchResult.assinanteAppmax?.id || null,
                    chave_match: matchResult.chave,
                    status_match: matchResult.status,
                    tipo_plano: tipoPlano,
                    valor_assinatura: valorAssinatura,
                    adimplente,
                    detalhes: {
                        guru: { cpf: guru.cpf, email: guru.email, nome: guru.nome },
                        appmax: matchResult.assinanteAppmax?.dados_originais || null,
                    },
                };

                resultados.push(mergeResult);

                // Persistir merge result
                await supabase.from("merge_results").insert(mergeResult);
            } catch (error) {
                if (error instanceof AmbiguityException) {
                    ambiguos++;

                    const mergeResult: MergeResultadoPipeline = {
                        trace_id: traceId,
                        assinante_guru_id: guru.id || null,
                        assinante_appmax_id: null,
                        chave_match: error.chave,
                        status_match: MatchStatus.AMBIGUO,
                        tipo_plano: null,
                        valor_assinatura: null,
                        adimplente: false,
                        detalhes: {
                            erro: error.message,
                            chave: error.chave,
                            valor: error.valor,
                            registros_encontrados: error.registrosEncontrados,
                        },
                    };

                    resultados.push(mergeResult);
                    await supabase.from("merge_results").insert(mergeResult);
                } else {
                    // Erro inesperado
                    await this.auditService.registrar(
                        traceId,
                        entidadeId,
                        "UnexpectedError",
                        {
                            resultado: RuleResult.ERRO,
                            payload: {
                                entrada: { guru },
                                saida: {
                                    erro: error instanceof Error ? error.message : String(error),
                                },
                            },
                            mensagem: `Erro inesperado ao processar ${entidadeId}: ${error instanceof Error ? error.message : String(error)}`,
                        }
                    );
                }
            }
        }

        // 7. Log de finalização
        await this.auditService.registrar(traceId, "PIPELINE", "PipelineEnd", {
            resultado: RuleResult.MATCH_EXACT,
            payload: {
                entrada: {},
                saida: {
                    total_processados: guruNormalizados.length,
                    match_exato: matchExato,
                    ambiguos,
                    sem_match: semMatch,
                },
            },
            mensagem: `Pipeline finalizado: ${guruNormalizados.length} processados, ${matchExato} matches, ${ambiguos} ambíguos, ${semMatch} sem match`,
        });

        return {
            trace_id: traceId,
            total_guru: guruNormalizados.length,
            total_appmax: appmaxNormalizados.length,
            processados: guruNormalizados.length,
            match_exato: matchExato,
            ambiguos,
            sem_match: semMatch,
            resultados,
        };
    }
}
