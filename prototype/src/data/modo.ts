/** Base real (piloto) ou demonstração local. O build do piloto usa VITE_BASE=real; testes e demo, a local. */
export const MODO_REAL = (import.meta as { env?: Record<string, string> }).env?.VITE_BASE === 'real';
