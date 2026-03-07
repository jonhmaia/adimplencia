import { NextRequest } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { createServerSupabaseClient } from "@/lib/supabase";
import { Assinante, PedidoPlanilha } from "@/domain/entities";
import { AmbiguityException } from "@/domain/exceptions";
import { AdimplenciaStatus, FonteDados, MatchStatus, PlanType, RuleResult, StatusPagamento } from "@/domain/enums";
import { normalizeCpf, normalizeEmail, normalizeTelefone } from "@/services/normalizer";
import { construirMapsMatching, executarMatching, MatchMaps, MatchResult } from "@/services/matching-engine";
import { classificarPlano } from "@/services/plan-classifier";
import { GuruApiAdapter } from "@/adapters/guru-adapter";
import { PlanilhaXlsxAdapter } from "@/adapters/planilha-adapter";
import { KitPlanilhaAdapter, KitAssinante } from "@/adapters/kit-adapter";
import { resolverKitAlvo, KitAlvoResult } from "@/services/kit-resolver";
import { AuditService } from "@/services/audit-service";

const BATCH_SIZE = 500;

// ============================
// Matching de Guru → Planilha de Kits
// ============================

interface KitMatchMaps {
    email: Map<string, KitAssinante[]>;
    telefone: Map<string, KitAssinante[]>;
    nome: Map<string, KitAssinante[]>;
}

function construirMapsKits(kitList: KitAssinante[]): KitMatchMaps {
    const emailMap = new Map<string, KitAssinante[]>();
    const telefoneMap = new Map<string, KitAssinante[]>();
    const nomeMap = new Map<string, KitAssinante[]>();

    for (const kit of kitList) {
        const email = kit.email ? kit.email.trim().toLowerCase() : null;
        if (email && email.includes("@")) {
            const arr = emailMap.get(email) || [];
            arr.push(kit);
            emailMap.set(email, arr);
        }

        if (kit.telefone) {
            const tel = normalizeTelefone(kit.telefone);
            if (tel) {
                const arr = telefoneMap.get(tel) || [];
                arr.push(kit);
                telefoneMap.set(tel, arr);
            }
        }

        if (kit.nome) {
            const nome = kit.nome.trim().toLowerCase();
            if (nome.length > 3) {
                const arr = nomeMap.get(nome) || [];
                arr.push(kit);
                nomeMap.set(nome, arr);
            }
        }
    }

    return { email: emailMap, telefone: telefoneMap, nome: nomeMap };
}

function matchGuruComKit(guru: Assinante, kitMaps: KitMatchMaps): { kit: KitAssinante | null; chave: string } {
    const emailGuru = normalizeEmail(guru.email);
    if (emailGuru) {
        const matches = kitMaps.email.get(emailGuru);
        if (matches && matches.length === 1) {
            return { kit: matches[0], chave: "EMAIL" };
        }
    }

    const telGuru = normalizeTelefone(guru.telefone);
    if (telGuru) {
        const matches = kitMaps.telefone.get(telGuru);
        if (matches && matches.length === 1) {
            return { kit: matches[0], chave: "TELEFONE" };
        }
    }

    // Fallback: nome exato
    if (guru.nome) {
        const nomeNorm = guru.nome.trim().toLowerCase();
        const matches = kitMaps.nome.get(nomeNorm);
        if (matches && matches.length === 1) {
            return { kit: matches[0], chave: "NOME" };
        }
    }

    return { kit: null, chave: "NENHUMA" };
}

/**
 * POST /api/pipeline
 * Pipeline com suporte a 2 planilhas: pedidos + kits.
 */
export async function POST(request: NextRequest) {
    const formData = await request.formData();
    const filePedidos = formData.get("planilha") as File | null;
    const fileKits = formData.get("planilha_kits") as File | null;

    if (!filePedidos && !fileKits) {
        return new Response(
            JSON.stringify({ success: false, error: "Nenhum arquivo enviado. Envie a planilha de pedidos e/ou a de kits." }),
            { status: 400, headers: { "Content-Type": "application/json" } }
        );
    }

    // Validar extensões
    if (filePedidos && !filePedidos.name.toLowerCase().endsWith(".xlsx")) {
        return new Response(
            JSON.stringify({ success: false, error: "Planilha de pedidos: formato inválido. Apenas .xlsx." }),
            { status: 400, headers: { "Content-Type": "application/json" } }
        );
    }
    if (fileKits && !fileKits.name.toLowerCase().endsWith(".xlsx")) {
        return new Response(
            JSON.stringify({ success: false, error: "Planilha de kits: formato inválido. Apenas .xlsx." }),
            { status: 400, headers: { "Content-Type": "application/json" } }
        );
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        async start(controller) {
            const send = (event: string, data: Record<string, unknown>) => {
                controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
            };

            try {
                const traceId = uuidv4();
                const supabase = createServerSupabaseClient();
                const auditService = new AuditService();
                const guruAdapter = new GuruApiAdapter();
                const startTime = Date.now();

                send("log", { step: "init", message: "🚀 Pipeline iniciado", trace_id: traceId });

                // ========== FASE 1: Carregar planilha de pedidos ==========
                let pedidos: PedidoPlanilha[] = [];
                let planilhaAssinantes: Assinante[] = [];
                let planilhaNormalizados: Assinante[] = [];

                if (filePedidos) {
                    send("log", { step: "parse_pedidos", message: "📊 Lendo planilha de pedidos..." });
                    const bufferPedidos = Buffer.from(await filePedidos.arrayBuffer());
                    const planilhaAdapter = new PlanilhaXlsxAdapter();
                    pedidos = planilhaAdapter.parsePlanilha(bufferPedidos);
                    planilhaAssinantes = planilhaAdapter.toAssinantes(pedidos);
                    send("log", { step: "parse_pedidos_done", message: `✅ Pedidos: ${pedidos.length} registros válidos (${((Date.now() - startTime) / 1000).toFixed(1)}s)` });

                    planilhaNormalizados = planilhaAssinantes.map((a) => ({
                        ...a,
                        cpf: normalizeCpf(a.cpf) || null,
                        telefone: normalizeTelefone(a.telefone) || null,
                        email: normalizeEmail(a.email) || null,
                        fonte: FonteDados.PLANILHA,
                    }));
                }

                // ========== FASE 2: Carregar planilha de kits ==========
                let kitAssinantes: KitAssinante[] = [];
                let kitMaps: KitMatchMaps | null = null;

                if (fileKits) {
                    send("log", { step: "parse_kits", message: "📦 Lendo planilha de kits (Materiais Entregues)..." });
                    const bufferKits = Buffer.from(await fileKits.arrayBuffer());
                    const kitAdapter = new KitPlanilhaAdapter();
                    kitAssinantes = kitAdapter.parsePlanilhaKits(bufferKits);
                    send("log", { step: "parse_kits_done", message: `✅ Kits: ${kitAssinantes.length} assinantes com dados de kits (${((Date.now() - startTime) / 1000).toFixed(1)}s)` });

                    // Construir maps para matching Guru → Kit
                    kitMaps = construirMapsKits(kitAssinantes);
                    send("log", { step: "kit_maps", message: `🗂️ Índices de kits: ${kitMaps.email.size} emails, ${kitMaps.telefone.size} telefones, ${kitMaps.nome.size} nomes` });
                }

                // ========== FASE 3: Buscar assinantes Guru ==========
                send("log", { step: "guru_fetch", message: "🔄 Buscando assinantes do Guru..." });
                const guruRaw = await guruAdapter.fetchAssinaturas();
                send("log", { step: "guru_done", message: `✅ Guru: ${guruRaw.length} assinantes (${((Date.now() - startTime) / 1000).toFixed(1)}s)` });

                // ========== FASE 4: Normalizar Guru ==========
                send("log", { step: "normalize", message: "🔧 Normalizando dados..." });

                const guruNormalizados: Assinante[] = guruRaw.map((g) => ({
                    ...g,
                    cpf: normalizeCpf(g.cpf) || null,
                    telefone: normalizeTelefone(g.telefone) || null,
                    email: normalizeEmail(g.email) || null,
                    fonte: FonteDados.GURU,
                }));

                const guruComCpf = guruNormalizados.filter(g => g.cpf).length;
                const guruComTel = guruNormalizados.filter(g => g.telefone).length;
                const guruComEmail = guruNormalizados.filter(g => g.email).length;

                send("log", {
                    step: "normalize_stats",
                    message: `📊 Guru: ${guruComCpf} CPFs, ${guruComTel} telefones, ${guruComEmail} emails` +
                        (filePedidos ? ` | Pedidos: ${planilhaNormalizados.filter(p => p.cpf).length} CPFs, ${planilhaNormalizados.filter(p => p.telefone).length} telefones, ${planilhaNormalizados.filter(p => p.email).length} emails` : ""),
                });

                send("log", { step: "normalize_done", message: `✅ Normalizado: ${guruNormalizados.length} Guru` + (filePedidos ? ` + ${planilhaNormalizados.length} Pedidos` : "") + (fileKits ? ` + ${kitAssinantes.length} Kits` : "") });

                // ========== FASE 5: Construir Maps de pedidos ==========
                let pedidoMaps: MatchMaps | null = null;
                if (filePedidos && planilhaNormalizados.length > 0) {
                    send("log", { step: "build_maps", message: "🗂️ Construindo índices de matching (pedidos)..." });
                    pedidoMaps = construirMapsMatching(planilhaNormalizados);
                    send("log", { step: "build_maps_done", message: `✅ Índices pedidos: ${pedidoMaps.cpf.size} CPFs, ${pedidoMaps.telefone.size} telefones, ${pedidoMaps.email.size} emails` });
                }

                // ========== FASE 6: Persistir assinantes Guru ==========
                send("log", { step: "persist_guru", message: `💾 Salvando ${guruNormalizados.length} assinantes Guru (batches de ${BATCH_SIZE})...` });

                for (let i = 0; i < guruNormalizados.length; i += BATCH_SIZE) {
                    const batch = guruNormalizados.slice(i, i + BATCH_SIZE).map((g) => ({
                        cpf: g.cpf,
                        telefone: g.telefone,
                        email: g.email,
                        nome: g.nome,
                        fonte: FonteDados.GURU,
                        dados_originais: g.dados_originais,
                    }));

                    const { data } = await supabase
                        .from("assinantes")
                        .insert(batch)
                        .select("id");

                    if (data) {
                        for (let j = 0; j < data.length; j++) {
                            if (i + j < guruNormalizados.length) {
                                guruNormalizados[i + j].id = data[j].id;
                            }
                        }
                    }

                    const saved = Math.min(i + BATCH_SIZE, guruNormalizados.length);
                    send("progress", {
                        step: "persist_guru",
                        current: saved,
                        total: guruNormalizados.length,
                        message: `💾 Guru: ${saved}/${guruNormalizados.length} salvos`,
                    });
                }

                send("log", { step: "persist_guru_done", message: `✅ Guru salvo no banco (${((Date.now() - startTime) / 1000).toFixed(1)}s)` });

                // ========== FASE 7: Matching + Kit Resolution + Adimplência ==========
                send("log", { step: "matching", message: `🔍 Cruzando ${guruNormalizados.length} assinantes...` });

                let matchExato = 0;
                let ambiguos = 0;
                let semMatch = 0;
                let comKit = 0;
                let semKit = 0;

                const mergeResultsBatch: Record<string, unknown>[] = [];
                const cruzamentoBatch: Record<string, unknown>[] = [];
                const auditBatch: Record<string, unknown>[] = [];

                for (let i = 0; i < guruNormalizados.length; i++) {
                    const guru = guruNormalizados[i];
                    const entidadeId = guru.cpf || guru.email || guru.telefone || "desconhecido";
                    const guruDados = guru.dados_originais as Record<string, unknown>;

                    try {
                        // === Matching com Pedidos ===
                        let matchResult: MatchResult | null = null;
                        let tipoPlano: string | null = null;
                        let valorAssinatura: number | null = null;
                        let adimplente = false;
                        let adimplenciaStatusVal: string = AdimplenciaStatus.DADOS_INSUFICIENTES;
                        let logProcessamento = "";
                        let totalPedidos = 0;
                        let qtdAprovados = 0;
                        let planilhaDados: Record<string, unknown> | null = null;

                        if (pedidoMaps) {
                            matchResult = executarMatching(guru, pedidoMaps);
                        }

                        // === Matching com Kits ===
                        let kitMatch: KitAssinante | null = null;
                        let kitChave = "NENHUMA";
                        let kitAlvoResult: KitAlvoResult | null = null;

                        if (kitMaps) {
                            const kitMatchResult = matchGuruComKit(guru, kitMaps);
                            kitMatch = kitMatchResult.kit;
                            kitChave = kitMatchResult.chave;
                        }

                        if (kitMatch) {
                            comKit++;
                            kitAlvoResult = resolverKitAlvo(kitMatch.kits);
                        } else if (kitMaps) {
                            semKit++;
                        }

                        // === Processar resultado do matching de pedidos ===
                        if (matchResult && matchResult.status === MatchStatus.MATCH_EXACT && matchResult.assinantePlanilha) {
                            planilhaDados = matchResult.assinantePlanilha.dados_originais as Record<string, unknown>;
                            valorAssinatura = Number(planilhaDados.total_venda || 0);

                            const classificacao = await classificarPlano(valorAssinatura, traceId, entidadeId, auditService);
                            tipoPlano = classificacao.tipo_plano;

                            totalPedidos = matchResult.todosPedidos.length;
                            const pedidosAprovados = matchResult.todosPedidos.filter((p) => {
                                const dados = p.dados_originais as Record<string, unknown>;
                                return String(dados.status || "") === StatusPagamento.APROVADO;
                            });
                            qtdAprovados = pedidosAprovados.length;

                            // === Lógica de adimplência diferenciada ===
                            if (tipoPlano === PlanType.ANUAL_COMPLETO) {
                                // Anual Completo: ATIVO no Guru → adimplente
                                const guruStatus = String(guruDados.last_status || "").toLowerCase();
                                adimplente = guruStatus === "active" || guruStatus === "ativa" || guruStatus === "ativo";
                                adimplenciaStatusVal = adimplente ? AdimplenciaStatus.ADIMPLENTE : AdimplenciaStatus.INADIMPLENTE;
                            } else {
                                // Recorrente: pagamentos_aprovados >= kit_alvo → adimplente
                                if (kitAlvoResult) {
                                    adimplente = qtdAprovados >= kitAlvoResult.kit_alvo;
                                    adimplenciaStatusVal = adimplente ? AdimplenciaStatus.ADIMPLENTE : AdimplenciaStatus.INADIMPLENTE;
                                } else {
                                    // Sem planilha de kits: usar lógica simples
                                    adimplente = qtdAprovados > 0;
                                    adimplenciaStatusVal = adimplente ? AdimplenciaStatus.ADIMPLENTE : AdimplenciaStatus.INADIMPLENTE;
                                }
                            }

                            const statusList = matchResult.todosPedidos.map(p => {
                                const d = p.dados_originais as Record<string, unknown>;
                                return String(d.status || "sem status");
                            });

                            logProcessamento = [
                                `✅ MATCH por ${matchResult.chave}`,
                                `Guru: "${guru.nome}" (CPF: ${guru.cpf || "N/A"}, Email: ${guru.email || "N/A"}, Tel: ${guru.telefone || "N/A"})`,
                                `Planilha: "${matchResult.assinantePlanilha.nome}" (CPF: ${matchResult.assinantePlanilha.cpf || "N/A"})`,
                                `${totalPedidos} pedido(s): [${statusList.join(", ")}]`,
                                `${qtdAprovados}/${totalPedidos} aprovados`,
                                `Plano: ${tipoPlano} (R$${valorAssinatura?.toFixed(2)})`,
                                kitAlvoResult ? `Kit alvo: ${kitAlvoResult.kit_alvo} (${kitAlvoResult.resumo})` : "Kit alvo: N/A (sem planilha de kits)",
                                `Resultado: ${adimplente ? "✅ ADIMPLENTE" : "❌ INADIMPLENTE"} (${adimplenciaStatusVal})`,
                            ].join(" | ");

                            matchExato++;

                            auditBatch.push({
                                trace_id: traceId,
                                entidade_id: entidadeId,
                                regra_avaliada: `${matchResult.chave}Match+Kit+Adimplencia`,
                                resultado_regra: adimplente ? RuleResult.ADIMPLENTE : RuleResult.INADIMPLENTE,
                                mensagem: `Match por ${matchResult.chave}. ${qtdAprovados}/${totalPedidos} pedidos aprovados. Plano=${tipoPlano}, valor=R$${valorAssinatura?.toFixed(2)}. Kit alvo=${kitAlvoResult?.kit_alvo || "N/A"}.`,
                                payload_contexto: {
                                    chave: matchResult.chave,
                                    total_pedidos: totalPedidos,
                                    pedidos_aprovados: qtdAprovados,
                                    adimplente,
                                    tipo_plano: tipoPlano,
                                    valor: valorAssinatura,
                                    kit_alvo: kitAlvoResult?.kit_alvo || null,
                                    ultimo_enviado: kitAlvoResult?.ultimo_enviado || null,
                                    adimplencia_status: adimplenciaStatusVal,
                                },
                            });
                        } else if (matchResult && matchResult.status === MatchStatus.SEM_MATCH) {
                            // Sem match em pedidos, mas pode ter kit
                            logProcessamento = [
                                `❌ SEM MATCH (pedidos)`,
                                `Guru: "${guru.nome}" (CPF: ${guru.cpf || "N/A"}, Email: ${guru.email || "N/A"}, Tel: ${guru.telefone || "N/A"})`,
                                kitMatch ? `📦 Kit encontrado por ${kitChave}: "${kitMatch.nome}" (Kit alvo: ${kitAlvoResult?.kit_alvo || "N/A"})` : "Sem dados de kit",
                            ].join(" | ");

                            // Se tem kit mas não tem pedido, verificar adimplência pelo Guru
                            if (kitMatch) {
                                const guruStatus = String(guruDados.last_status || "").toLowerCase();
                                const guruAtivo = guruStatus === "active" || guruStatus === "ativa" || guruStatus === "ativo";
                                adimplente = guruAtivo;
                                adimplenciaStatusVal = guruAtivo ? AdimplenciaStatus.ADIMPLENTE : AdimplenciaStatus.INADIMPLENTE;
                            }

                            semMatch++;
                            auditBatch.push({
                                trace_id: traceId,
                                entidade_id: entidadeId,
                                regra_avaliada: "SemMatch",
                                resultado_regra: RuleResult.SEM_MATCH,
                                mensagem: `Nenhum match de pedidos para "${guru.nome}"` + (kitMatch ? `. Kit encontrado: "${kitMatch.nome}"` : ""),
                                payload_contexto: { cpf: guru.cpf, email: guru.email, telefone: guru.telefone, kit_encontrado: !!kitMatch },
                            });
                        } else if (!pedidoMaps) {
                            // Sem planilha de pedidos, apenas kit
                            if (kitMatch) {
                                const guruStatus = String(guruDados.last_status || "").toLowerCase();
                                const guruAtivo = guruStatus === "active" || guruStatus === "ativa" || guruStatus === "ativo";
                                adimplente = guruAtivo;
                                adimplenciaStatusVal = guruAtivo ? AdimplenciaStatus.ADIMPLENTE : AdimplenciaStatus.INADIMPLENTE;

                                logProcessamento = [
                                    `📦 KIT MATCH por ${kitChave}`,
                                    `Guru: "${guru.nome}" (Status: ${guruDados.last_status})`,
                                    `Kit: "${kitMatch.nome}" (Plano: ${kitMatch.plano || "N/A"})`,
                                    kitAlvoResult ? `Kit alvo: ${kitAlvoResult.kit_alvo} (${kitAlvoResult.resumo})` : "",
                                    `Resultado: ${adimplente ? "✅ ADIMPLENTE" : "❌ INADIMPLENTE"} (por status Guru)`,
                                ].filter(Boolean).join(" | ");

                                matchExato++;
                            } else {
                                logProcessamento = `❌ SEM MATCH | Guru: "${guru.nome}" | Sem pedidos e sem kit encontrado`;
                                semMatch++;
                            }
                        }

                        mergeResultsBatch.push({
                            trace_id: traceId,
                            assinante_guru_id: guru.id || null,
                            assinante_planilha_id: null,
                            chave_match: matchResult?.chave || (kitMatch ? kitChave : null),
                            status_match: matchResult?.status || (kitMatch ? MatchStatus.MATCH_EXACT : MatchStatus.SEM_MATCH),
                            tipo_plano: tipoPlano,
                            valor_assinatura: valorAssinatura,
                            adimplente,
                            detalhes: {
                                guru: { cpf: guru.cpf, email: guru.email, nome: guru.nome },
                                planilha: matchResult?.assinantePlanilha?.dados_originais || null,
                                kit: kitMatch ? { nome: kitMatch.nome, plano: kitMatch.plano, kit_alvo: kitAlvoResult?.kit_alvo } : null,
                                total_pedidos: totalPedidos,
                            },
                        });

                        cruzamentoBatch.push({
                            trace_id: traceId,
                            guru_nome: guru.nome,
                            guru_cpf: guru.cpf,
                            guru_telefone: guru.telefone,
                            guru_email: guru.email,
                            guru_status: String(guruDados.last_status || ""),
                            guru_produto: String(guruDados.product_name || ""),
                            guru_metodo_pagamento: String(guruDados.payment_method || ""),
                            guru_cobrado_vezes: Number(guruDados.charged_times || 0),
                            guru_ciclo_dias: Number(guruDados.charged_every_days || 0),
                            guru_inicio_ciclo: String(guruDados.cycle_start_date || ""),
                            guru_fim_ciclo: String(guruDados.cycle_end_date || ""),
                            guru_subscription_code: String(guruDados.subscription_code || ""),
                            guru_dados_completos: guruDados,
                            planilha_nome: matchResult?.assinantePlanilha?.nome || null,
                            planilha_cpf: matchResult?.assinantePlanilha?.cpf || null,
                            planilha_telefone: matchResult?.assinantePlanilha?.telefone || null,
                            planilha_email: matchResult?.assinantePlanilha?.email || null,
                            planilha_status: planilhaDados ? String(planilhaDados.status || "") : null,
                            planilha_valor: valorAssinatura,
                            status_match: matchResult?.status || (kitMatch ? MatchStatus.MATCH_EXACT : MatchStatus.SEM_MATCH),
                            chave_match: matchResult?.chave || (kitMatch ? kitChave : null),
                            tipo_plano: tipoPlano,
                            valor_assinatura: valorAssinatura,
                            adimplente,
                            total_pedidos_encontrados: totalPedidos,
                            pedidos_aprovados: qtdAprovados,
                            log_processamento: logProcessamento,
                            detalhes: planilhaDados || {},
                            // Novas colunas de kit
                            kit_alvo: kitAlvoResult?.kit_alvo || null,
                            ultimo_kit_enviado: kitAlvoResult?.ultimo_enviado || null,
                            kit_nome_plano: kitMatch?.plano || null,
                            kit_valor_str: kitMatch?.valor_str || null,
                            adimplencia_status: adimplenciaStatusVal,
                            justificativa_adimplencia: kitAlvoResult?.resumo || (adimplente ? "Adimplente por status Guru" : "Sem dados suficientes"),
                        });
                    } catch (error) {
                        if (error instanceof AmbiguityException) {
                            ambiguos++;

                            const logAmb = [
                                `⚠️ AMBÍGUO por ${error.chave}`,
                                `Guru: "${guru.nome}" (CPF: ${guru.cpf || "N/A"})`,
                                `${error.registrosEncontrados} registros diferentes encontrados com mesmo ${error.chave}`,
                                `Requer análise manual`,
                            ].join(" | ");

                            mergeResultsBatch.push({
                                trace_id: traceId,
                                assinante_guru_id: guru.id || null,
                                assinante_planilha_id: null,
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
                            });

                            cruzamentoBatch.push({
                                trace_id: traceId,
                                guru_nome: guru.nome,
                                guru_cpf: guru.cpf,
                                guru_telefone: guru.telefone,
                                guru_email: guru.email,
                                guru_status: String(guruDados.last_status || ""),
                                guru_produto: String(guruDados.product_name || ""),
                                guru_metodo_pagamento: String(guruDados.payment_method || ""),
                                guru_cobrado_vezes: Number(guruDados.charged_times || 0),
                                guru_ciclo_dias: Number(guruDados.charged_every_days || 0),
                                guru_inicio_ciclo: String(guruDados.cycle_start_date || ""),
                                guru_fim_ciclo: String(guruDados.cycle_end_date || ""),
                                guru_subscription_code: String(guruDados.subscription_code || ""),
                                guru_dados_completos: guruDados,
                                planilha_nome: null,
                                planilha_cpf: null,
                                planilha_telefone: null,
                                planilha_email: null,
                                planilha_status: null,
                                planilha_valor: null,
                                status_match: MatchStatus.AMBIGUO,
                                chave_match: error.chave,
                                tipo_plano: null,
                                valor_assinatura: null,
                                adimplente: false,
                                total_pedidos_encontrados: error.registrosEncontrados,
                                pedidos_aprovados: 0,
                                log_processamento: logAmb,
                                detalhes: { erro: error.message },
                                kit_alvo: null,
                                ultimo_kit_enviado: null,
                                kit_nome_plano: null,
                                kit_valor_str: null,
                                adimplencia_status: AdimplenciaStatus.AMBIGUO,
                                justificativa_adimplencia: `Ambiguidade por ${error.chave}: ${error.registrosEncontrados} candidatos`,
                            });
                        }
                    }

                    // Progresso a cada 50
                    if ((i + 1) % 50 === 0 || i === guruNormalizados.length - 1) {
                        send("progress", {
                            step: "matching",
                            current: i + 1,
                            total: guruNormalizados.length,
                            message: `🔍 ${i + 1}/${guruNormalizados.length} | ✅${matchExato} ⚠️${ambiguos} ❌${semMatch}` +
                                (kitMaps ? ` | 📦 Kit: ${comKit}/${comKit + semKit}` : ""),
                        });
                    }
                }

                send("log", {
                    step: "matching_done",
                    message: `✅ Matching concluído: ✅${matchExato} ⚠️${ambiguos} ❌${semMatch}` +
                        (kitMaps ? ` | 📦 Com kit: ${comKit}, sem kit: ${semKit}` : "") +
                        ` (${((Date.now() - startTime) / 1000).toFixed(1)}s)`
                });

                // Distribuição por chave de match
                const distChave: Record<string, number> = {};
                for (const r of cruzamentoBatch) {
                    const key = String(r.chave_match || "SEM_MATCH");
                    distChave[key] = (distChave[key] || 0) + 1;
                }
                send("log", {
                    step: "match_distribution",
                    message: `📊 Distribuição: ${Object.entries(distChave).map(([k, v]) => `${k}=${v}`).join(", ")}`,
                });

                // ========== FASE 8: Batch insert merge_results ==========
                send("log", { step: "persist_results", message: `💾 Salvando ${mergeResultsBatch.length} resultados (batches de ${BATCH_SIZE})...` });

                for (let i = 0; i < mergeResultsBatch.length; i += BATCH_SIZE) {
                    const batch = mergeResultsBatch.slice(i, i + BATCH_SIZE);
                    await supabase.from("merge_results").insert(batch);

                    const saved = Math.min(i + BATCH_SIZE, mergeResultsBatch.length);
                    send("progress", {
                        step: "persist_results",
                        current: saved,
                        total: mergeResultsBatch.length,
                        message: `💾 Resultados: ${saved}/${mergeResultsBatch.length}`,
                    });
                }

                // ========== FASE 9: Batch insert resultados_cruzamento ==========
                send("log", { step: "persist_cruzamento", message: `📋 Salvando ${cruzamentoBatch.length} registros na tabela de cruzamento...` });

                for (let i = 0; i < cruzamentoBatch.length; i += BATCH_SIZE) {
                    const batch = cruzamentoBatch.slice(i, i + BATCH_SIZE);
                    await supabase.from("resultados_cruzamento").insert(batch);
                }

                send("log", { step: "persist_cruzamento_done", message: `✅ Tabela de cruzamento salva` });

                // ========== FASE 10: Batch insert audit_logs ==========
                send("log", { step: "persist_audit", message: `📝 Salvando ${auditBatch.length} logs de auditoria...` });

                for (let i = 0; i < auditBatch.length; i += BATCH_SIZE) {
                    const batch = auditBatch.slice(i, i + BATCH_SIZE);
                    await supabase.from("audit_logs").insert(batch);
                }

                // ========== FASE 11: Finalizar ==========
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

                send("log", { step: "done", message: `⏱️ Tempo total: ${elapsed}s` });
                send("complete", {
                    success: true,
                    trace_id: traceId,
                    total_guru: guruNormalizados.length,
                    total_planilha: planilhaNormalizados.length,
                    total_kits: kitAssinantes.length,
                    processados: guruNormalizados.length,
                    match_exato: matchExato,
                    ambiguos,
                    sem_match: semMatch,
                    com_kit: comKit,
                    sem_kit: semKit,
                    tempo_segundos: parseFloat(elapsed),
                });
            } catch (error) {
                send("error", {
                    message: error instanceof Error ? error.message : "Erro desconhecido no pipeline",
                    stack: error instanceof Error ? error.stack : undefined,
                });
            } finally {
                controller.close();
            }
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
        },
    });
}
