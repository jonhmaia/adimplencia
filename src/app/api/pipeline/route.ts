import { NextResponse } from "next/server";
import { PipelineService } from "@/services/pipeline";

/**
 * POST /api/pipeline
 * Dispara o pipeline completo de matching e auditoria.
 */
export async function POST() {
    try {
        const pipeline = new PipelineService();
        const resultado = await pipeline.executar();

        return NextResponse.json({
            success: true,
            data: resultado,
        });
    } catch (error) {
        console.error("[Pipeline API] Erro:", error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : "Erro desconhecido",
            },
            { status: 500 }
        );
    }
}
