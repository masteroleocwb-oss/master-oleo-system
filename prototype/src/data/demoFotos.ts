// Imagens DEMONSTRATIVAS geradas em SVG (sem fotos reais, sem pessoas).
const MOTIVOS: Record<string, { cor: string; forma: string }> = {
  filtro: { cor: '#8a6d3b', forma: '<rect x="70" y="60" width="180" height="110" rx="10" fill="#d9c9a3"/>' + Array.from({ length: 11 }, (_, i) => `<rect x="${80 + i * 15}" y="66" width="8" height="98" fill="#a08a5a" opacity="${0.4 + (i % 3) * 0.2}"/>`).join('') },
  freio: { cor: '#555', forma: '<circle cx="160" cy="115" r="62" fill="#9aa1a9"/><circle cx="160" cy="115" r="22" fill="#5d636b"/><rect x="200" y="70" width="34" height="90" rx="8" fill="#c0392b" opacity=".85"/>' },
  fluido: { cor: '#6b4f12', forma: '<rect x="120" y="50" width="80" height="130" rx="14" fill="#eee" stroke="#999"/><rect x="124" y="95" width="72" height="81" rx="10" fill="#7a5a12" opacity=".85"/>' },
  vazamento: { cor: '#2b2b2b', forma: '<rect x="40" y="60" width="240" height="70" rx="8" fill="#7d8590"/><path d="M150 130 q10 25 0 40 q-10 -15 0 -40z" fill="#1d1d1d"/><ellipse cx="150" cy="185" rx="40" ry="8" fill="#1d1d1d" opacity=".6"/>' },
  coxim: { cor: '#333', forma: '<rect x="90" y="80" width="140" height="70" rx="12" fill="#444"/><path d="M110 115 l100 0" stroke="#c0392b" stroke-width="5"/>' },
  palheta: { cor: '#333', forma: '<rect x="40" y="105" width="240" height="14" rx="5" fill="#222"/><rect x="40" y="119" width="240" height="6" fill="#555"/>' },
  motor: { cor: '#3a3f44', forma: '<rect x="70" y="60" width="180" height="110" rx="10" fill="#8c939b"/><rect x="95" y="80" width="40" height="70" fill="#6d737a"/><rect x="150" y="80" width="40" height="70" fill="#6d737a"/>' },
};

const motivoDo = (itemId: string) =>
  itemId.includes('filtro') ? 'filtro' : itemId.includes('pastilha') || itemId.includes('disco') ? 'freio'
    : itemId.includes('fluido') || itemId.includes('oleo') || itemId.includes('arrefec') ? 'fluido'
      : itemId.includes('vazamento') || itemId.includes('trocador') || itemId.includes('diferencial') ? 'vazamento'
        : itemId.includes('coxim') ? 'coxim' : itemId.includes('palheta') ? 'palheta' : 'motor';

export const fotoDemo = (itemId: string, legenda: string, variante = 0) => {
  const m = MOTIVOS[motivoDo(itemId)];
  const fundo = ['#e8ecf1', '#e9e4dc', '#e3e8e4'][variante % 3];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240"><rect width="320" height="240" fill="${fundo}"/>${m.forma}<rect x="0" y="198" width="320" height="42" fill="rgba(0,34,102,.82)"/><text x="12" y="216" font-family="sans-serif" font-size="12" font-weight="700" fill="#fff">IMAGEM DEMONSTRATIVA</text><text x="12" y="232" font-family="sans-serif" font-size="11" fill="#dfe6f3">${legenda.replace(/[<&>]/g, '')}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};
