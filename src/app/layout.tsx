import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "Agente de Adimplência | Clubinho",
    description:
        "Sistema de análise de adimplência com ETL, matching inteligente e auditoria completa.",
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="pt-BR">
            <body>{children}</body>
        </html>
    );
}
