"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function DebugGuruPage() {
    const [debugData, setDebugData] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchDebugData = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/debug/guru");
            const data = await res.json();
            setDebugData(data);
            if (!res.ok) {
                setError(data.error || "Erro ao buscar dados");
            }
        } catch (err) {
            setError("Erro de conexão com a API de debug");
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDebugData();
    }, []);

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
                    <Link href="/auditoria">Auditoria</Link>
                    <Link href="/debug" className="active">Debug</Link>
                </div>
            </nav>

            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1>Debug Guru API</h1>
                        <p>Visualização bruta dos dados retornados pelo endpoint de assinaturas.</p>
                    </div>
                    <button
                        className={`btn ${loading ? 'btn-ghost' : 'btn-primary'}`}
                        onClick={fetchDebugData}
                        disabled={loading}
                    >
                        {loading ? "Atualizando..." : "🔄 Atualizar Dados"}
                    </button>
                </div>

                {error && (
                    <div className="card" style={{ borderColor: "var(--status-sem-match)", marginBottom: "1.5rem" }}>
                        <h3 style={{ color: "var(--status-sem-match)", marginBottom: "0.5rem" }}>❌ Erro detectado</h3>
                        <p>{error}</p>
                    </div>
                )}

                {debugData && (
                    <div className="grid">
                        <div className="card">
                            <h3 style={{ marginBottom: "1rem" }}>Metadata da Requisição</h3>
                            <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: "0.5rem", fontSize: "0.9rem" }}>
                                <strong>Status:</strong>
                                <span className={`badge ${debugData.success ? 'match' : 'sem-match'}`}>
                                    {debugData.status} {debugData.statusText}
                                </span>

                                <strong>URL Chamada:</strong>
                                <code style={{ wordBreak: "break-all" }}>{debugData.url}</code>

                                <strong>Total Registros:</strong>
                                <span>{Array.isArray(debugData.data) ? debugData.data.length : (debugData.data?.data?.length || 0)}</span>
                            </div>
                        </div>
                    </div>
                )}

                <div className="card animate-in" style={{ marginTop: "1.5rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                        <h3 style={{ fontSize: "1rem", fontWeight: 600 }}>Raw JSON Response</h3>
                        <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}> Guru API v2 </span>
                    </div>

                    <div style={{
                        background: "rgba(0,0,0,0.2)",
                        padding: "1rem",
                        borderRadius: "8px",
                        overflow: "auto",
                        maxHeight: "600px"
                    }}>
                        {loading ? (
                            <div style={{ padding: "2rem", textAlign: "center" }}>
                                <div className="spinner" style={{ margin: "0 auto 1rem" }}></div>
                                <p>Buscando dados no Guru...</p>
                            </div>
                        ) : (
                            <pre style={{
                                margin: 0,
                                fontSize: "0.85rem",
                                fontFamily: "monospace",
                                color: "#e0e0e0"
                            }}>
                                {debugData ? JSON.stringify(debugData.data, null, 2) : "Nenhum dado carregado."}
                            </pre>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
