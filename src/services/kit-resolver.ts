import { KitStatus } from "@/domain/enums";
import { KitEntry } from "@/adapters/kit-adapter";

// ============================
// Kit Resolver - Regra first_X_after_last_sent
// ============================

export interface KitAlvoResult {
    kit_alvo: number;
    ultimo_enviado: number | null;
    total_kits: number;
    total_enviados: number;
    total_nao_pago: number;
    resumo: string; // Justificativa legível
}

/**
 * Implementa a regra first_X_after_last_sent():
 *
 * 1. Determinar ultimo_enviado: maior k onde a célula contém uma data válida
 *    (ou tem status ENVIADO/COM_MATERIAIS)
 * 2. A partir de k+1, procurar menor j com status NAO_PAGO ('X')
 * 3. Se encontrou 'X', kit_alvo = j
 * 4. Se não encontrou 'X', kit_alvo = ultimo_enviado + 1
 * 5. Se não existe nenhuma data e também não existe X, kit_alvo = 1
 */
export function resolverKitAlvo(kits: KitEntry[]): KitAlvoResult {
    if (!kits || kits.length === 0) {
        return {
            kit_alvo: 1,
            ultimo_enviado: null,
            total_kits: 0,
            total_enviados: 0,
            total_nao_pago: 0,
            resumo: "Nenhum kit encontrado, kit_alvo = 1 (padrão)",
        };
    }

    // Kits ordenados por número
    const sortedKits = [...kits].sort((a, b) => a.numero - b.numero);

    // Contar totais
    const totalEnviados = sortedKits.filter(
        (k) => k.status === KitStatus.ENVIADO || k.status === KitStatus.COM_MATERIAIS
    ).length;
    const totalNaoPago = sortedKits.filter(
        (k) => k.status === KitStatus.NAO_PAGO
    ).length;

    // 1. Encontrar ultimo_enviado (maior kit com status ENVIADO ou COM_MATERIAIS)
    let ultimoEnviado: number | null = null;
    for (let i = sortedKits.length - 1; i >= 0; i--) {
        const kit = sortedKits[i];
        if (kit.status === KitStatus.ENVIADO || kit.status === KitStatus.COM_MATERIAIS) {
            ultimoEnviado = kit.numero;
            break;
        }
    }

    // 5. Se não existe nenhuma data e também não existe X, retornar 1
    if (ultimoEnviado === null && totalNaoPago === 0) {
        return {
            kit_alvo: 1,
            ultimo_enviado: null,
            total_kits: kits.length,
            total_enviados: 0,
            total_nao_pago: 0,
            resumo: "Nenhum kit enviado e nenhum X encontrado, kit_alvo = 1 (padrão)",
        };
    }

    // Se não existe data mas existe X, o primeiro X é o kit_alvo
    if (ultimoEnviado === null) {
        const primeiroX = sortedKits.find((k) => k.status === KitStatus.NAO_PAGO);
        const kitAlvo = primeiroX ? primeiroX.numero : 1;
        return {
            kit_alvo: kitAlvo,
            ultimo_enviado: null,
            total_kits: kits.length,
            total_enviados: 0,
            total_nao_pago: totalNaoPago,
            resumo: `Nenhum kit enviado, primeiro X encontrado no Kit ${kitAlvo}`,
        };
    }

    // 2. A partir de ultimoEnviado + 1, procurar menor j com status NAO_PAGO
    let primeiroXAposUltimo: number | null = null;
    for (const kit of sortedKits) {
        if (kit.numero <= ultimoEnviado) continue;
        if (kit.status === KitStatus.NAO_PAGO) {
            primeiroXAposUltimo = kit.numero;
            break;
        }
    }

    // 3. Se encontrou 'X', retornar j
    if (primeiroXAposUltimo !== null) {
        return {
            kit_alvo: primeiroXAposUltimo,
            ultimo_enviado: ultimoEnviado,
            total_kits: kits.length,
            total_enviados: totalEnviados,
            total_nao_pago: totalNaoPago,
            resumo: `Último kit enviado: ${ultimoEnviado}. Primeiro X após enviado: Kit ${primeiroXAposUltimo}. kit_alvo = ${primeiroXAposUltimo}`,
        };
    }

    // EXTRA: Verificar se há um X ANTES do último enviado (caso especial)
    // A documentação diz "primeiro X após última data", mas pode haver X pendente antes
    const primeiroXGlobal = sortedKits.find((k) => k.status === KitStatus.NAO_PAGO);
    if (primeiroXGlobal && primeiroXGlobal.numero < ultimoEnviado) {
        return {
            kit_alvo: primeiroXGlobal.numero,
            ultimo_enviado: ultimoEnviado,
            total_kits: kits.length,
            total_enviados: totalEnviados,
            total_nao_pago: totalNaoPago,
            resumo: `Último kit enviado: ${ultimoEnviado}. X pendente encontrado antes no Kit ${primeiroXGlobal.numero}. kit_alvo = ${primeiroXGlobal.numero}`,
        };
    }

    // 4. Se não encontrou 'X', kit_alvo = ultimo_enviado + 1
    const kitAlvo = ultimoEnviado + 1;
    return {
        kit_alvo: kitAlvo,
        ultimo_enviado: ultimoEnviado,
        total_kits: kits.length,
        total_enviados: totalEnviados,
        total_nao_pago: totalNaoPago,
        resumo: `Último kit enviado: ${ultimoEnviado}. Nenhum X encontrado. kit_alvo = ${kitAlvo} (próximo)`,
    };
}
