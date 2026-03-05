import { NextResponse } from "next/server";
import { GuruApiAdapter } from "@/adapters/guru-adapter";

/**
 * GET /api/debug/guru
 * Retorna os dados crus da API do Guru para depuração.
 */
export async function GET() {
    try {
        const adapter = new GuruApiAdapter();
        const assinantes = await adapter.fetchAssinaturas();

        return NextResponse.json({
            success: true,
            url: `${process.env.GURU_API_URL}/subscriptions (Paginado)`,
            total_mapeado: assinantes.length,
            data: assinantes,
        });
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : "Erro desconhecido",
            stack: error instanceof Error ? error.stack : undefined,
        }, { status: 500 });
    }
}
