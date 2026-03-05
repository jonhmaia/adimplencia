import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";

/**
 * GET /api/audit-logs?trace_id=X&entidade_id=Y
 * Retorna dossiê de auditoria.
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const traceId = searchParams.get("trace_id");
        const entidadeId = searchParams.get("entidade_id");

        const supabase = createServerSupabaseClient();

        let query = supabase
            .from("audit_logs")
            .select("*")
            .order("timestamp", { ascending: true });

        if (traceId) {
            query = query.eq("trace_id", traceId);
        }

        if (entidadeId) {
            query = query.eq("entidade_id", entidadeId);
        }

        const { data, error } = await query.limit(500);

        if (error) {
            return NextResponse.json(
                { success: false, error: error.message },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            data,
            total: data?.length || 0,
        });
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : "Erro desconhecido",
            },
            { status: 500 }
        );
    }
}
