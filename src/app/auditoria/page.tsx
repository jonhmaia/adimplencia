"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase";

interface AuditLogItem {
    id: string;
    trace_id: string;
    timestamp: string;
    entidade_id: string;
    regra_avaliada: string;
    resultado_regra: string;
    payload_contexto: Record<string, unknown>;
    mensagem: string;
}

function AuditoriaContent() {
    const [logs, setLogs] = useState<AuditLogItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [traceIdFilter, setTraceIdFilter] = useState("");
    const [entidadeFilter, setEntidadeFilter] = useState("");
    const [expandedPayloads, setExpandedPayloads] = useState<Set<string>>(new Set());
    const router = useRouter();
    const searchParams = useSearchParams();

    useEffect(() => {
        const traceFromUrl = searchParams.get("trace_id");
        if (traceFromUrl) {
            setTraceIdFilter(traceFromUrl);
        }
    }, [searchParams]);

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (traceIdFilter) params.set("trace_id", traceIdFilter);
            if (entidadeFilter) params.set("entidade_id", entidadeFilter);

            const res = await fetch(`/api/audit-logs?${params.toString()}`);
            const data = await res.json();
            if (data.success) {
                setLogs(data.data || []);
            }
        } catch (err) {
            console.error("Erro ao carregar logs:", err);
        } finally {
            setLoading(false);
        }
    }, [traceIdFilter, entidadeFilter]);

    useEffect(() => {
        const supabase = createBrowserSupabaseClient();
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (!session) {
                router.push("/login");
                return;
            }
            fetchLogs();
        });
    }, [router, fetchLogs]);

    const getDotClass = (resultado: string) => {
        switch (resultado) {
            case "MATCH_EXACT":
            case "ADIMPLENTE":
            case "ANUAL_COMPLETO":
            case "RECORRENTE":
                return "match";
            case "AMBIGUO":
                return "ambiguo";
            case "SEM_MATCH":
            case "INADIMPLENTE":
                return "sem-match";
            case "ERRO":
                return "erro";
            default:
                return "info";
        }
    };

    const togglePayload = (id: string) => {
        setExpandedPayloads((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const handleLogout = async () => {
        const supabase = createBrowserSupabaseClient();
        await supabase.auth.signOut();
        router.push("/login");
    };

    // Agrupar logs por entidade_id
    const groupedLogs = logs.reduce(
        (acc, log) => {
            const key = log.entidade_id;
            if (!acc[key]) acc[key] = [];
            acc[key].push(log);
            return acc;
        },
        {} as Record<string, AuditLogItem[]>
    );

    return (
        <div className="app-container">
            <nav className="navbar">
                <Link href="/" className="navbar-brand">
                    <div className="logo-icon">🔍</div>
                    <h1>Adimplência</h1>
                </Link>

                <div className="navbar-nav">
                    <Link href="/">Dashboard</Link>
                    <Link href="/merge">Resultados</Link>
                    <Link href="/auditoria" className="active">
                        Auditoria
                    </Link>
                    <Link href="/debug">Debug</Link>
                </div>

                <div className="navbar-actions">
                    <button className="btn btn-ghost btn-sm" onClick={handleLogout}>
                        Sair
                    </button>
                </div>
            </nav>

            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1>Auditoria</h1>
                        <p>Dossiê de execução — histórico completo de regras aplicadas</p>
                    </div>
                </div>

                {/* Filtros */}
                <div className="card" style={{ marginBottom: "1.5rem" }}>
                    <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "flex-end" }}>
                        <div className="form-group" style={{ flex: 1, minWidth: 250, marginBottom: 0 }}>
                            <label className="form-label">Trace ID</label>
                            <input
                                className="form-input"
                                placeholder="UUID do pipeline..."
                                value={traceIdFilter}
                                onChange={(e) => setTraceIdFilter(e.target.value)}
                            />
                        </div>
                        <div className="form-group" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
                            <label className="form-label">Entidade (CPF/E-mail)</label>
                            <input
                                className="form-input"
                                placeholder="Buscar por CPF ou e-mail..."
                                value={entidadeFilter}
                                onChange={(e) => setEntidadeFilter(e.target.value)}
                            />
                        </div>
                        <button className="btn btn-primary btn-sm" onClick={fetchLogs}>
                            🔎 Buscar
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="empty-state">
                        <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
                        <p style={{ marginTop: "1rem" }}>Carregando logs de auditoria...</p>
                    </div>
                ) : logs.length === 0 ? (
                    <div className="empty-state animate-in">
                        <div className="icon">📝</div>
                        <h3>Nenhum log de auditoria encontrado</h3>
                        <p>Execute o pipeline para gerar registros de auditoria, ou ajuste os filtros.</p>
                    </div>
                ) : (
                    Object.entries(groupedLogs).map(([entidade, items]) => (
                        <div
                            key={entidade}
                            className="card animate-in"
                            style={{ marginBottom: "1.5rem" }}
                        >
                            <div style={{ marginBottom: "1rem" }}>
                                <h3 style={{ fontSize: "1rem", fontWeight: 600 }}>
                                    📋 Dossiê: {entidade}
                                </h3>
                                <p
                                    style={{
                                        fontSize: "0.8rem",
                                        color: "var(--text-muted)",
                                        marginTop: "0.25rem",
                                    }}
                                >
                                    {items.length} regras avaliadas • Trace:{" "}
                                    {items[0].trace_id.substring(0, 8)}...
                                </p>
                            </div>

                            <div className="timeline">
                                {items.map((log) => (
                                    <div key={log.id} className="timeline-item">
                                        <div className={`timeline-dot ${getDotClass(log.resultado_regra)}`} />
                                        <div className="timeline-content">
                                            <div className="timeline-header">
                                                <span className="timeline-regra">{log.regra_avaliada}</span>
                                                <span className={`badge ${getDotClass(log.resultado_regra) === "match" ? "match" : getDotClass(log.resultado_regra) === "ambiguo" ? "ambiguo" : "sem-match"}`}>
                                                    {log.resultado_regra}
                                                </span>
                                                <span className="timeline-time">
                                                    {new Date(log.timestamp).toLocaleTimeString("pt-BR")}
                                                </span>
                                            </div>
                                            <p className="timeline-mensagem">{log.mensagem}</p>
                                            <button
                                                className="btn btn-ghost btn-sm"
                                                onClick={() => togglePayload(log.id)}
                                                style={{ marginBottom: expandedPayloads.has(log.id) ? "0.5rem" : 0 }}
                                            >
                                                {expandedPayloads.has(log.id) ? "▼ Ocultar payload" : "▶ Ver payload"}
                                            </button>
                                            {expandedPayloads.has(log.id) && (
                                                <pre className="timeline-payload">
                                                    {JSON.stringify(log.payload_contexto, null, 2)}
                                                </pre>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))
                )}
            </main>
        </div>
    );
}

export default function AuditoriaPage() {
    return (
        <Suspense
            fallback={
                <div className="empty-state">
                    <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
                    <p style={{ marginTop: "1rem" }}>Carregando...</p>
                </div>
            }
        >
            <AuditoriaContent />
        </Suspense>
    );
}
