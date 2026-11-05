// Contato público da Master Óleo (aparece para o cliente). Não é segredo.

/** WhatsApp da oficina, só números com DDI e DDD (ex.: 5541999999999). Vazio = sem botão de WhatsApp. */
export const WHATSAPP_MASTER = '5541999706481';

/** Link do WhatsApp da oficina com a mensagem já escrita, ou null se o número não foi configurado. */
export const linkWhatsappMaster = (texto: string) =>
  WHATSAPP_MASTER ? `https://wa.me/${WHATSAPP_MASTER}?text=${encodeURIComponent(texto)}` : null;

/** Endereço dos relatórios dos clientes (só abre relatório, nunca a tela de login). */
export const URL_CLIENTE = 'https://cliente.masteroleo.com.br';
/** Endereço do cliente no ar (CNAME na Hostinger desde 05/11/2026). */
const CLIENTE_NO_AR = true;

/** É o endereço dos clientes? Ali só o relatório abre. */
export const enderecoDoCliente = (host = location.hostname) => host.startsWith('cliente.');

/** Link do relatório para mandar ao cliente. Na base real vai sempre pelo endereço dos clientes. */
export function urlRelatorio(token: string, real: boolean, loc: Pick<Location, 'origin' | 'pathname' | 'hostname'> = location) {
  const oficial = real && CLIENTE_NO_AR && /(^|\.)masteroleo\.com\.br$|\.vercel\.app$/.test(loc.hostname);
  return oficial ? `${URL_CLIENTE}/#/r/${token}` : `${loc.origin}${loc.pathname}#/r/${token}`;
}
