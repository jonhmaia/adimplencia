"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase";

interface Resumo {
    total: number;
    match_exato: number;
    ambiguos: number;
    sem_match: number;
    adimplentes: number;
    inadimplentes: number;
}

export default function DashboardPage() {
    const [resumo, setResumo] = useState<Resumo | null>(null);
    const [loading, setLoading] = useState(true);
    const [pipelineLoading, setPipelineLoading] = useState(false);
    const [pipelineResult, setPipelineResult] = useState<string | null>(null);
    const router = useRouter();

    const fetchResumo = useCallback(async () => {
        try {
            const res = await fetch("/api/merge-results");
            const data = await res.json();
            if (data.success) {
                setResumo(data.resumo);
            }
        } catch (err) {
            console.error("Erro ao carregar resumo:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        // Verificar autenticação
        const supabase = createBrowserSupabaseClient();
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (!session) {
                router.push("/login");
                return;
            }
            fetchResumo();
        });
    }, [router, fetchResumo]);

    const executarPipeline = async () => {
        setPipelineLoading(true);
        setPipelineResult(null);

        try {
            const res = await fetch("/api/pipeline", { method: "POST" });
            const data = await res.json();

            if (data.success) {
                setPipelineResult(
                    `✅ Pipeline executado! Trace: ${data.data.trace_id.substring(0, 8)}... | ` +
                    `${data.data.match_exato} matches, ${data.data.ambiguos} ambíguos, ${data.data.sem_match} sem match`
                );
                fetchResumo();
            } else {
                setPipelineResult(`❌ Erro: ${data.error}`);
            }
        } catch {
            setPipelineResult("❌ Erro de conexão ao executar pipeline");
        } finally {
            setPipelineLoading(false);
        }
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
                    <Link href="/" className="active">
                        Dashboard
                    </Link>
                    <Link href="/merge">Resultados</Link>
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
                        <h1>Dashboard</h1>
                        <p>Visão geral do sistema de análise de adimplência</p>
                    </div>
                    <button
                        className="btn btn-primary"
                        onClick={executarPipeline}
                        disabled={pipelineLoading}
                    >
                        {pipelineLoading ? (
                            <>
                                <span className="spinner" /> Processando...
                            </>
                        ) : (
                            <>🚀 Executar Pipeline</>
                        )}
                    </button>
                </div>

                {pipelineResult && (
                    <div
                        className="card animate-in"
                        style={{ marginBottom: "1.5rem", padding: "1rem 1.25rem" }}
                    >
                        <p style={{ fontSize: "0.9rem" }}>{pipelineResult}</p>
                    </div>
                )}

                {loading ? (
                    <div className="empty-state">
                        <div className="spinner" style={{ width: 40, height: 40, borderWidth: 3 }} />
                        <p style={{ marginTop: "1rem" }}>Carregando dados...</p>
                    </div>
                ) : resumo && resumo.total > 0 ? (
                    <div className="stats-grid">
                        <div className="card stat-card blue animate-in">
                            <div className="card-header">
                                <span className="card-title">Total Processados</span>
                                <div className="card-icon blue">📊</div>
                            </div>
                            <div className="card-value blue">{resumo.total}</div>
                            <p className="card-subtitle">Registros analisados</p>
                        </div>

                        <div className="card stat-card green animate-in">
                            <div className="card-header">
                                <span className="card-title">Adimplentes</span>
                                <div className="card-icon green">✅</div>
                            </div>
                            <div className="card-value green">{resumo.adimplentes}</div>
                            <p className="card-subtitle">
                                {resumo.total > 0
                                    ? `${((resumo.adimplentes / resumo.total) * 100).toFixed(1)}% do total`
                                    : "—"}
                            </p>
                        </div>

                        <div className="card stat-card red animate-in">
                            <div className="card-header">
                                <span className="card-title">Inadimplentes</span>
                                <div className="card-icon red">❌</div>
                            </div>
                            <div className="card-value red">{resumo.inadimplentes}</div>
                            <p className="card-subtitle">
                                {resumo.total > 0
                                    ? `${((resumo.inadimplentes / resumo.total) * 100).toFixed(1)}% do total`
                                    : "—"}
                            </p>
                        </div>

                        <div className="card stat-card amber animate-in">
                            <div className="card-header">
                                <span className="card-title">Ambíguos</span>
                                <div className="card-icon amber">⚠️</div>
                            </div>
                            <div className="card-value amber">{resumo.ambiguos}</div>
                            <p className="card-subtitle">Requer análise manual</p>
                        </div>

                        <div className="card stat-card purple animate-in">
                            <div className="card-header">
                                <span className="card-title">Match Exato</span>
                                <div className="card-icon purple">🔗</div>
                            </div>
                            <div className="card-value purple">{resumo.match_exato}</div>
                            <p className="card-subtitle">Cruzamentos bem-sucedidos</p>
                        </div>
                    </div>
                ) : (
                    <div className="empty-state animate-in">
                        <div className="icon">📋</div>
                        <h3>Nenhum dado processado ainda</h3>
                        <p>
                            Clique em &quot;Executar Pipeline&quot; para iniciar o processo de
                            matching e análise de adimplência.
                        </p>
                    </div>
                )}
            </main>
        </div>
    );
}
