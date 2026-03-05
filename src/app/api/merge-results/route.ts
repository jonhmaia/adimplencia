import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";

/**
 * GET /api/merge-results?status=X&tipo_plano=Y&adimplente=Z&trace_id=W
 * Lista resultados do merge com filtros.
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const status = searchParams.get("status");
        const tipoPlano = searchParams.get("tipo_plano");
        const adimplente = searchParams.get("adimplente");
        const traceId = searchParams.get("trace_id");

        const supabase = createServerSupabaseClient();

        let query = supabase
            .from("merge_results")
            .select("*")
            .order("created_at", { ascending: false });

        if (status) {
            query = query.eq("status_match", status);
        }

        if (tipoPlano) {
            query = query.eq("tipo_plano", tipoPlano);
        }

        if (adimplente !== null && adimplente !== undefined) {
            query = query.eq("adimplente", adimplente === "true");
        }

        if (traceId) {
            query = query.eq("trace_id", traceId);
        }

        const { data, error } = await query.limit(500);

        if (error) {
            return NextResponse.json(
                { success: false, error: error.message },
                { status: 500 }
            );
        }

        // Calcular resumo
        const total = data?.length || 0;
        const matchExato = data?.filter((r) => r.status_match === "MATCH_EXACT").length || 0;
        const ambiguos = data?.filter((r) => r.status_match === "AMBIGUO").length || 0;
        const semMatch = data?.filter((r) => r.status_match === "SEM_MATCH").length || 0;
        const adimplentes = data?.filter((r) => r.adimplente === true).length || 0;

        return NextResponse.json({
            success: true,
            data,
            resumo: {
                total,
                match_exato: matchExato,
                ambiguos,
                sem_match: semMatch,
                adimplentes,
                inadimplentes: total - adimplentes,
            },
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
