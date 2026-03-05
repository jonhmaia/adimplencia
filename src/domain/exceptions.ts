// ============================
// Exceções de Domínio
// ============================

/**
 * Lançada quando o motor de matching encontra múltiplos registros
 * distintos para a mesma chave, gerando ambiguidade.
 */
export class AmbiguityException extends Error {
    public readonly chave: string;
    public readonly valor: string;
    public readonly registrosEncontrados: number;

    constructor(chave: string, valor: string, registrosEncontrados: number) {
        super(
            `Ambiguidade detectada: ${registrosEncontrados} registros encontrados para ${chave}="${valor}". ` +
            `Cruzamento abortado para este registro.`
        );
        this.name = "AmbiguityException";
        this.chave = chave;
        this.valor = valor;
        this.registrosEncontrados = registrosEncontrados;
    }
}

/**
 * Lançada quando não é possível normalizar um identificador.
 */
export class NormalizationException extends Error {
    public readonly campo: string;
    public readonly valorOriginal: string;

    constructor(campo: string, valorOriginal: string) {
        super(`Falha ao normalizar ${campo}: "${valorOriginal}"`);
        this.name = "NormalizationException";
        this.campo = campo;
        this.valorOriginal = valorOriginal;
    }
}
