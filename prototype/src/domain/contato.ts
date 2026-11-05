// Contato público da Master Óleo (aparece para o cliente). Não é segredo.

/** WhatsApp da oficina, só números com DDI e DDD (ex.: 5541999999999). Vazio = sem botão de WhatsApp. */
export const WHATSAPP_MASTER = '';

/** Link do WhatsApp da oficina com a mensagem já escrita, ou null se o número não foi configurado. */
export const linkWhatsappMaster = (texto: string) =>
  WHATSAPP_MASTER ? `https://wa.me/${WHATSAPP_MASTER}?text=${encodeURIComponent(texto)}` : null;
