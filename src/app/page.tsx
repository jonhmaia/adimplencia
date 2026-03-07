"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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

interface LogEntry {
    id: number;
    type: "log" | "progress" | "complete" | "error";
    message: string;
    timestamp: Date;
    data?: Record<string, unknown>;
}

export default function DashboardPage() {
    const [resumo, setResumo] = useState<Resumo | null>(null);
    const [loading, setLoading] = useState(true);
    const [pipelineLoading, setPipelineLoading] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [dragActive, setDragActive] = useState(false);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [showLogs, setShowLogs] = useState(false);
    const [progress, setProgress] = useState<{ current: number; total: number; step: string } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const logsEndRef = useRef<HTMLDivElement>(null);
    const logIdRef = useRef(0);
    const router = useRouter();

    // Auto-scroll logs
    useEffect(() => {
        logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [logs]);

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
        const supabase = createBrowserSupabaseClient();
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (!session) {
                router.push("/login");
                return;
            }
            fetchResumo();
        });
    }, [router, fetchResumo]);

    const addLog = (type: LogEntry["type"], message: string, data?: Record<string, unknown>) => {
        logIdRef.current++;
        setLogs((prev) => [
            ...prev,
            { id: logIdRef.current, type, message, timestamp: new Date(), data },
        ]);
    };

    const handleFileSelect = (file: File) => {
        if (!file.name.toLowerCase().endsWith(".xlsx")) {
            addLog("error", "❌ Formato inválido. Envie apenas arquivos .xlsx");
            return;
        }
        setSelectedFile(file);
    };

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFileSelect(e.dataTransfer.files[0]);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            handleFileSelect(e.target.files[0]);
        }
    };

    const formatFileSize = (bytes: number) => {
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
        return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    };

    const executarPipeline = async () => {
        if (!selectedFile) return;

        setPipelineLoading(true);
        setShowLogs(true);
        setLogs([]);
        setProgress(null);
        logIdRef.current = 0;

        addLog("log", `📁 Arquivo selecionado: ${selectedFile.name} (${formatFileSize(selectedFile.size)})`);
        addLog("log", "📤 Enviando planilha para o servidor...");

        try {
            const formData = new FormData();
            formData.append("planilha", selectedFile);

            const response = await fetch("/api/pipeline", {
                method: "POST",
                body: formData,
            });

            if (!response.ok) {
                const errorData = await response.json();
                addLog("error", `❌ Erro: ${errorData.error || "Erro desconhecido"}`);
                setPipelineLoading(false);
                return;
            }

            // Ler SSE stream
            const reader = response.body?.getReader();
            const decoder = new TextDecoder();

            if (!reader) {
                addLog("error", "❌ Erro: não foi possível ler a resposta");
                setPipelineLoading(false);
                return;
            }

            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                let currentEvent = "";
                for (const line of lines) {
                    if (line.startsWith("event: ")) {
                        currentEvent = line.slice(7).trim();
                    } else if (line.startsWith("data: ")) {
                        const dataStr = line.slice(6);
                        try {
                            const data = JSON.parse(dataStr);

                            switch (currentEvent) {
                                case "log":
                                    addLog("log", data.message, data);
                                    break;
                                case "progress":
                                    setProgress({
                                        current: data.current,
                                        total: data.total,
                                        step: data.step,
                                    });
                                    addLog("progress", data.message, data);
                                    break;
                                case "complete":
                                    addLog("complete", `🎉 Pipeline concluído! Trace: ${data.trace_id?.substring(0, 8)}...`);
                                    addLog("complete", `📊 Guru: ${data.total_guru} | Planilha: ${data.total_planilha}`);
                                    addLog("complete", `✅ ${data.match_exato} matches | ⚠️ ${data.ambiguos} ambíguos | ❌ ${data.sem_match} sem match`);
                                    setSelectedFile(null);
                                    fetchResumo();
                                    break;
                                case "error":
                                    addLog("error", `❌ ${data.message}`);
                                    break;
                            }
                        } catch {
                            // Parse error, ignore
                        }
                        currentEvent = "";
                    }
                }
            }
        } catch (err) {
            addLog("error", `❌ Erro de conexão: ${err instanceof Error ? err.message : "desconhecido"}`);
        } finally {
            setPipelineLoading(false);
            setProgress(null);
        }
    };

    const handleLogout = async () => {
        const supabase = createBrowserSupabaseClient();
        await supabase.auth.signOut();
        router.push("/login");
    };

    const progressPercent = progress ? Math.round((progress.current / progress.total) * 100) : 0;

    return (
        <div className="app-container">
            <nav className="navbar">
                <Link href="/" className="navbar-brand">
                    <div className="logo-icon">🔍</div>
                    <h1>Adimplência</h1>
                </Link>

                <div className="navbar-nav">
                    <Link href="/" className="active">Dashboard</Link>
                    <Link href="/merge">Resultados</Link>
                    <Link href="/auditoria">Auditoria</Link>
                    <Link href="/debug">Debug</Link>
                </div>

                <div className="navbar-actions">
                    <button className="btn btn-ghost btn-sm" onClick={handleLogout}>Sair</button>
                </div>
            </nav>

            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1>Dashboard</h1>
                        <p>Visão geral do sistema de análise de adimplência</p>
                    </div>
                </div>

                {/* Upload de Planilha */}
                <div className="card animate-in" style={{ marginBottom: "1.5rem" }}>
                    <div style={{ padding: "1.5rem" }}>
                        <h2 style={{ fontSize: "1.1rem", marginBottom: "1rem", color: "var(--text-primary)" }}>
                            📤 Upload da Planilha de Pedidos
                        </h2>
                        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
                            Faça upload da planilha .xlsx com os dados de pedidos para cruzamento com a base do Guru.
                        </p>

                        <div
                            onDragEnter={handleDrag}
                            onDragLeave={handleDrag}
                            onDragOver={handleDrag}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                            style={{
                                border: `2px dashed ${dragActive ? "var(--accent-blue)" : selectedFile ? "var(--accent-green)" : "var(--border)"}`,
                                borderRadius: "12px",
                                padding: "2rem",
                                textAlign: "center",
                                cursor: pipelineLoading ? "not-allowed" : "pointer",
                                transition: "all 0.2s ease",
                                background: dragActive
                                    ? "rgba(59, 130, 246, 0.05)"
                                    : selectedFile
                                        ? "rgba(34, 197, 94, 0.05)"
                                        : "transparent",
                                opacity: pipelineLoading ? 0.5 : 1,
                                pointerEvents: pipelineLoading ? "none" : "auto",
                            }}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".xlsx"
                                onChange={handleInputChange}
                                style={{ display: "none" }}
                            />

                            {selectedFile ? (
                                <div>
                                    <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>📊</div>
                                    <p style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.95rem" }}>
                                        {selectedFile.name}
                                    </p>
                                    <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                                        {formatFileSize(selectedFile.size)}
                                    </p>
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        style={{ marginTop: "0.5rem", fontSize: "0.8rem" }}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedFile(null);
                                        }}
                                    >
                                        ✕ Remover
                                    </button>
                                </div>
                            ) : (
                                <div>
                                    <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem", opacity: 0.6 }}>
                                        {dragActive ? "📥" : "📁"}
                                    </div>
                                    <p style={{ fontWeight: 500, color: "var(--text-primary)", fontSize: "0.95rem" }}>
                                        {dragActive ? "Solte o arquivo aqui" : "Arraste a planilha aqui ou clique para selecionar"}
                                    </p>
                                    <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                                        Apenas arquivos .xlsx
                                    </p>
                                </div>
                            )}
                        </div>

                        <div style={{ marginTop: "1rem", display: "flex", justifyContent: "flex-end" }}>
                            <button
                                className="btn btn-primary"
                                onClick={executarPipeline}
                                disabled={pipelineLoading || !selectedFile}
                                style={{ opacity: !selectedFile && !pipelineLoading ? 0.5 : 1 }}
                            >
                                {pipelineLoading ? (
                                    <><span className="spinner" /> Processando...</>
                                ) : (
                                    <>🚀 Processar Cruzamento</>
                                )}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Painel de Logs em Tempo Real */}
                {showLogs && (
                    <div className="card animate-in" style={{ marginBottom: "1.5rem" }}>
                        <div style={{ padding: "1.25rem" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                                <h2 style={{ fontSize: "1rem", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                    📋 Logs do Pipeline
                                    {pipelineLoading && <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />}
                                </h2>
                                {!pipelineLoading && (
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        onClick={() => setShowLogs(false)}
                                        style={{ fontSize: "0.8rem" }}
                                    >
                                        ✕ Fechar
                                    </button>
                                )}
                            </div>

                            {/* Barra de Progresso */}
                            {progress && (
                                <div style={{ marginBottom: "1rem" }}>
                                    <div style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        fontSize: "0.75rem",
                                        color: "var(--text-muted)",
                                        marginBottom: "0.25rem",
                                    }}>
                                        <span>{progress.step === "matching" ? "Cruzamento" : progress.step === "persist_guru" ? "Salvando Guru" : "Salvando Planilha"}</span>
                                        <span>{progressPercent}%</span>
                                    </div>
                                    <div style={{
                                        height: "6px",
                                        backgroundColor: "var(--bg-tertiary)",
                                        borderRadius: "3px",
                                        overflow: "hidden",
                                    }}>
                                        <div style={{
                                            height: "100%",
                                            width: `${progressPercent}%`,
                                            backgroundColor: "var(--accent-blue)",
                                            borderRadius: "3px",
                                            transition: "width 0.3s ease",
                                        }} />
                                    </div>
                                </div>
                            )}

                            {/* Lista de Logs */}
                            <div style={{
                                maxHeight: "400px",
                                overflowY: "auto",
                                backgroundColor: "var(--bg-primary)",
                                borderRadius: "8px",
                                padding: "0.75rem",
                                fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
                                fontSize: "0.78rem",
                                lineHeight: "1.6",
                            }}>
                                {logs.filter((l) => l.type !== "progress" || (l.data as Record<string, unknown>)?.current === (l.data as Record<string, unknown>)?.total).map((log) => (
                                    <div
                                        key={log.id}
                                        style={{
                                            padding: "2px 0",
                                            color: log.type === "error"
                                                ? "#ef4444"
                                                : log.type === "complete"
                                                    ? "#22c55e"
                                                    : "var(--text-secondary)",
                                            borderLeft: log.type === "error"
                                                ? "2px solid #ef4444"
                                                : log.type === "complete"
                                                    ? "2px solid #22c55e"
                                                    : "2px solid transparent",
                                            paddingLeft: "0.5rem",
                                        }}
                                    >
                                        <span style={{ color: "var(--text-muted)", marginRight: "0.5rem" }}>
                                            {log.timestamp.toLocaleTimeString("pt-BR")}
                                        </span>
                                        {log.message}
                                    </div>
                                ))}
                                {pipelineLoading && progress && (
                                    <div style={{ padding: "2px 0", color: "var(--accent-blue)", paddingLeft: "0.5rem", borderLeft: "2px solid var(--accent-blue)" }}>
                                        <span style={{ color: "var(--text-muted)", marginRight: "0.5rem" }}>
                                            {new Date().toLocaleTimeString("pt-BR")}
                                        </span>
                                        {`⏳ ${progress.step === "matching" ? "Cruzamento" : "Salvando"}: ${progress.current}/${progress.total} (${progressPercent}%)`}
                                    </div>
                                )}
                                <div ref={logsEndRef} />
                            </div>
                        </div>
                    </div>
                )}

                {/* Cards de Resumo */}
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
                            Faça upload de uma planilha .xlsx acima para iniciar o processo de
                            matching e análise de adimplência.
                        </p>
                    </div>
                )}
            </main>
        </div>
    );
}
