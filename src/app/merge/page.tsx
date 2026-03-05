"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase";

interface MergeResultItem {
    id: string;
    trace_id: string;
    chave_match: string | null;
    status_match: string;
    tipo_plano: string | null;
    valor_assinatura: number | null;
    adimplente: boolean;
    detalhes: Record<string, unknown>;
    created_at: string;
}

export default function MergePage() {
    const [results, setResults] = useState<MergeResultItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState("");
    const [filterPlano, setFilterPlano] = useState("");
    const [filterAdimplente, setFilterAdimplente] = useState("");
    const router = useRouter();

    const fetchResults = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (filterStatus) params.set("status", filterStatus);
            if (filterPlano) params.set("tipo_plano", filterPlano);
            if (filterAdimplente) params.set("adimplente", filterAdimplente);

            const res = await fetch(`/api/merge-results?${params.toString()}`);
            const data = await res.json();
            if (data.success) {
                setResults(data.data || []);
            }
        } catch (err) {
            console.error("Erro ao carregar resultados:", err);
        } finally {
            setLoading(false);
        }
    }, [filterStatus, filterPlano, filterAdimplente]);

    useEffect(() => {
        const supabase = createBrowserSupabaseClient();
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (!session) {
                router.push("/login");
                return;
            }
            fetchResults();
        });
    }, [router, fetchResults]);

    const getStatusBadge = (status: string) => {
        switch (status) {
            case "MATCH_EXACT":
                return <span className="badge match">MATCH</span>;
            case "AMBIGUO":
                return <span className="badge ambiguo">AMBÍGUO</span>;
            case "SEM_MATCH":
                return <span className="badge sem-match">SEM MATCH</span>;
            default:
                return <span className="badge">{status}</span>;
        }
    };

    const getPlanoBadge = (plano: string | null) => {
        if (!plano) return <span style={{ color: "var(--text-muted)" }}>—</span>;
        switch (plano) {
            case "ANUAL_COMPLETO":
                return <span className="badge anual">ANUAL</span>;
            case "RECORRENTE":
                return <span className="badge recorrente">RECORRENTE</span>;
            default:
                return <span className="badge">{plano}</span>;
        }
    };

    const getGuruInfo = (detalhes: Record<string, unknown>) => {
        const guru = detalhes.guru as Record<string, unknown> | undefined;
        if (!guru) return "—";
        return String(guru.nome || guru.cpf || guru.email || "—");
    };

    const handleLogout = async () => {
        const supabase = createBrowserSupabaseClient();
        await supabase.auth.signOut();
        router.push("/login");
    };

    return (
        <div className="app-container">
            <nav className="navbar">
                <Link href="/" className="navbar-brand">
                    <div className="logo-icon">🔍</div>
                    <h1>Adimplência</h1>
                </Link>

                <div className="navbar-nav">
                    <Link href="/">Dashboard</Link>
                    <Link href="/merge" className="active">
                        Resultados
                    </Link>
                    <Link href="/auditoria">Auditoria</Link>
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
                        <h1>Resultados do Merge</h1>
                        <p>Cruzamento entre assinantes Guru e AppMax</p>
                    </div>
                </div>

                <div className="table-container animate-in">
                    <div className="table-header">
                        <h2>Registros ({results.length})</h2>
                        <div className="table-filters">
                            <select
                                className="filter-select"
                                value={filterStatus}
                                onChange={(e) => setFilterStatus(e.target.value)}
                            >
                                <option value="">Status: Todos</option>
                                <option value="MATCH_EXACT">Match Exato</option>
                                <option value="AMBIGUO">Ambíguo</option>
                                <option value="SEM_MATCH">Sem Match</option>
                            </select>

                            <select
                                className="filter-select"
                                value={filterPlano}
                                onChange={(e) => setFilterPlano(e.target.value)}
                            >
                                <option value="">Plano: Todos</option>
                                <option value="ANUAL_COMPLETO">Anual Completo</option>
                                <option value="RECORRENTE">Recorrente</option>
                            </select>

                            <select
                                className="filter-select"
                                value={filterAdimplente}
                                onChange={(e) => setFilterAdimplente(e.target.value)}
                            >
                                <option value="">Adimplência: Todos</option>
                                <option value="true">Adimplente</option>
                                <option value="false">Inadimplente</option>
                            </select>
                        </div>
                    </div>

                    {loading ? (
                        <div className="empty-state">
                            <div
                                className="spinner"
                                style={{ width: 32, height: 32, borderWidth: 3 }}
                            />
                            <p style={{ marginTop: "1rem" }}>Carregando...</p>
                        </div>
                    ) : results.length === 0 ? (
                        <div className="empty-state">
                            <div className="icon">📭</div>
                            <h3>Nenhum resultado encontrado</h3>
                            <p>
                                Execute o pipeline no Dashboard ou ajuste os filtros.
                            </p>
                        </div>
                    ) : (
                        <div style={{ overflowX: "auto" }}>
                            <table>
                                <thead>
                                    <tr>
                                        <th>Assinante</th>
                                        <th>Status</th>
                                        <th>Chave</th>
                                        <th>Plano</th>
                                        <th>Valor</th>
                                        <th>Adimplência</th>
                                        <th>Trace</th>
                                        <th>Data</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {results.map((item) => (
                                        <tr key={item.id}>
                                            <td style={{ color: "var(--text-primary)", fontWeight: 500 }}>
                                                {getGuruInfo(item.detalhes)}
                                            </td>
                                            <td>{getStatusBadge(item.status_match)}</td>
                                            <td>{item.chave_match || "—"}</td>
                                            <td>{getPlanoBadge(item.tipo_plano)}</td>
                                            <td>
                                                {item.valor_assinatura
                                                    ? `R$ ${item.valor_assinatura.toFixed(2)}`
                                                    : "—"}
                                            </td>
                                            <td>
                                                {item.status_match === "MATCH_EXACT" ? (
                                                    item.adimplente ? (
                                                        <span className="badge adimplente">ADIMPLENTE</span>
                                                    ) : (
                                                        <span className="badge inadimplente">INADIMPLENTE</span>
                                                    )
                                                ) : (
                                                    <span style={{ color: "var(--text-muted)" }}>—</span>
                                                )}
                                            </td>
                                            <td>
                                                <Link
                                                    href={`/auditoria?trace_id=${item.trace_id}`}
                                                    className="btn btn-ghost btn-sm"
                                                    style={{ color: "var(--accent-blue-light)" }}
                                                >
                                                    {item.trace_id.substring(0, 8)}...
                                                </Link>
                                            </td>
                                            <td style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                                                {new Date(item.created_at).toLocaleDateString("pt-BR")}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
