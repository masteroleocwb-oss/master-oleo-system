// Termo de Garantia — Troca de Óleo de Câmbio Automático (texto aprovado pela direção em 25/11/2026).
// Gerado na abertura da OS com os dados do cliente já preenchidos, em 2 vias (cliente e Master Óleo).
import { ROLE_LABEL } from '../domain/permissions';
import type { Cliente, OrdemServico, Usuario, Veiculo } from '../domain/types';
import { addDias, fmtData, fmtDocumento, fmtPlaca, fmtTelefone, TZ } from '../domain/util';

export const PRAZO_GARANTIA_CAMBIO_DIAS = 90;

const esc = (x: unknown) => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const FMT_EXTENSO = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' });

export interface DadosTermo { os: OrdemServico; veiculo?: Veiculo; cliente?: Cliente; operador: Usuario; logoUrl: string }

export const validadeGarantia = (os: OrdemServico) => addDias(os.abertaEm, PRAZO_GARANTIA_CAMBIO_DIAS);

function via(d: DadosTermo, rotulo: string) {
  const { os, veiculo: v, cliente: c, operador } = d;
  const vazio = '<span class="linha"></span>';
  const campo = (x?: string) => (x && x.trim() ? esc(x) : vazio);
  const veiculoTxt = v ? [v.marca, v.modelo, v.ano || ''].filter(Boolean).join(' ') : '';
  return `
<section class="via">
  <header>
    <img src="${esc(d.logoUrl)}" alt="Master Óleo" class="logo" />
    <div class="via-rotulo">${esc(rotulo)}</div>
  </header>
  <h1>Termo de Garantia — Troca de Óleo de Câmbio Automático</h1>
  <p class="prestadora">Prestadora: ÓLEO EXPRESS CURITIBA SERVIÇOS AUTOMOTIVOS LTDA. — MASTER ÓLEO, CNPJ 57.644.843/0001-48, Av. Brasília, 5216, Novo Mundo, Curitiba/PR.</p>

  <h2>1. Identificação</h2>
  <table class="ident">
    <tr><th>Cliente</th><td>${campo(c?.nome)}</td><th>OS nº</th><td>${esc(os.numero)}</td></tr>
    <tr><th>CPF/CNPJ</th><td>${campo(fmtDocumento(c?.documento))}</td><th>Data do serviço</th><td>${esc(fmtData(os.abertaEm))}</td></tr>
    <tr><th>Telefone/WhatsApp</th><td>${campo(c?.telefone ? fmtTelefone(c.telefone) : '')}</td><th>Garantia válida até</th><td><b>${esc(fmtData(validadeGarantia(os)))}</b></td></tr>
    <tr><th>Veículo</th><td>${campo(veiculoTxt)}</td><th>Placa</th><td>${campo(v ? fmtPlaca(v.placa) : '')}</td></tr>
  </table>

  <h2>2. O que a garantia cobre</h2>
  <p>A garantia cobre <b>exclusivamente vazamento de fluido nos pontos em que a Master Óleo interveio</b> durante o serviço:</p>
  <ul>
    <li>bujão de dreno e bujão de enchimento/nível;</li>
    <li>cárter do câmbio e sua junta, quando o cárter foi aberto;</li>
    <li>filtro interno e copo/filtro secundário (CVT), quando substituídos;</li>
    <li>conexões do trocador de calor, quando desconectadas para o serviço.</li>
  </ul>
  <p>Constatado vazamento em um desses pontos dentro do prazo, a Master Óleo refaz a vedação e repõe o fluido perdido, sem custo para o cliente.</p>

  <h2>3. Prazo</h2>
  <p>A garantia vale por <b>90 (noventa) dias corridos</b>, contados da data de entrega do veículo indicada na seção 1. Encerrado o prazo, a garantia se extingue, independentemente da quilometragem rodada.</p>

  <h2>4. O que a garantia não cobre</h2>
  <p>A troca de fluido é um serviço de manutenção. Ela não é reparo, retífica nem recondicionamento do câmbio, e não corrige desgaste ou defeito que o veículo já tinha. Por isso, <b>não estão cobertos</b>:</p>
  <ol>
    <li><b>Vazamento em retentores e vedações que não foram substituídos pela Master Óleo</b>: retentor de semieixo, retentor do conversor de torque, retentor da bomba, retentor da haste seletora, anéis de vedação internos e similares. Em câmbio com vedações já ressecadas ou desgastadas, o fluido novo, na viscosidade correta, pode evidenciar um vazamento que o fluido antigo e degradado mascarava. Isso é condição da peça, não defeito do serviço.</li>
    <li><b>Vazamento em qualquer ponto em que a Master Óleo não interveio</b>: carcaça, mangueiras e radiador/trocador de calor (fora das conexões desconectadas no serviço), respiro, tampas e demais componentes.</li>
    <li><b>Desgaste natural e defeitos mecânicos internos</b>: discos e pacotes de embreagem, cintas, correia ou corrente de CVT, polias, bomba de óleo, engrenagens, rolamentos e conversor de torque.</li>
    <li><b>Componentes hidráulicos e eletrônicos</b>: solenoides, corpo de válvulas, módulo de controle do câmbio (TCM), sensores, chicotes e conectores, incluindo códigos de falha relacionados a eles.</li>
    <li><b>Sintomas de funcionamento</b>: trancos, patinação, atraso ou falha nas trocas de marcha, perda de força, ruídos, superaquecimento e luz de advertência, quando decorrentes de desgaste ou de condição anterior ao serviço.</li>
    <li><b>Condições preexistentes</b>, inclusive vazamentos e demais defeitos que já existiam antes do serviço, em especial em veículo sem histórico de manutenção do câmbio ou que já chegou com sintoma, conforme registrado no Termo de Inspeção Prévia.</li>
    <li><b>Danos por causa externa ou uso</b>: impacto no cárter, acidente, alagamento, superaquecimento do motor, reboque inadequado, uso severo ou em desacordo com o manual do fabricante.</li>
    <li><b>Qualquer item sem relação com a troca de fluido realizada.</b></li>
  </ol>
  <p>Serviços, peças, diagnósticos e guincho contratados pelo cliente com terceiros, sem autorização prévia e por escrito da Master Óleo, não são reembolsados.</p>

  <h2>5. Perda da garantia</h2>
  <p><b>A garantia se extingue imediatamente se o veículo for levado a outra oficina, posto, mecânico ou qualquer terceiro para diagnóstico, verificação ou intervenção no câmbio</b>, antes de ser avaliado pela Master Óleo. Isso vale mesmo que o terceiro apenas examine o veículo, sem executar reparo. Inclui:</p>
  <ul>
    <li>diagnóstico, inspeção, leitura de scanner ou laudo feito por terceiros;</li>
    <li>abertura de bujões ou do cárter, troca, complemento ou retirada de fluido;</li>
    <li>desmontagem, reparo ou substituição de peças do câmbio;</li>
    <li>uso de aditivos ou de fluido diferente do aplicado pela Master Óleo.</li>
  </ul>
  <p>Depois que um terceiro mexe no veículo, deixa de ser possível verificar a origem do problema. A Master Óleo <b>não está obrigada a executar, custear ou reembolsar serviço indicado, orçado ou realizado por terceiros</b>, nem fica vinculada a diagnóstico ou laudo emitido por outra oficina. A avaliação que vale para esta garantia é a feita pela equipe técnica da Master Óleo, com o veículo em sua unidade.</p>
  <p>A garantia também se extingue se o cliente continuar rodando com vazamento visível ou luz de advertência acesa, agravando o dano.</p>

  <h2>6. Como acionar a garantia</h2>
  <ol>
    <li>Ao notar vazamento, pare de usar o veículo se houver risco e <b>entre em contato com a Master Óleo para agendar a verificação</b>, pelo WhatsApp (41) 99970-6481, informando o número da OS (<b>${esc(os.numero)}</b>).</li>
    <li>A verificação é feita <b>somente com agendamento</b>. Trazer o veículo direto à unidade, sem agendar, não dá prioridade no atendimento: o veículo será agendado da mesma forma.</li>
    <li><b>Não leve o veículo a outra oficina antes da verificação</b>, nem mesmo para diagnóstico. Isso encerra a garantia (seção 5).</li>
    <li>Na data agendada, a equipe técnica inspeciona o veículo na unidade (Av. Brasília, 5216, Novo Mundo, Curitiba/PR) e registra o resultado com fotos e, se necessário, scanner.</li>
    <li>Vazamento em ponto coberto: o reparo é feito sem custo. Origem fora da cobertura: o cliente recebe a explicação e um orçamento, e decide se autoriza o serviço.</li>
  </ol>

  <h2>7. Ciência do cliente</h2>
  <p>Declaro que li este termo, recebi uma via e entendi que:</p>
  <ul>
    <li>a garantia é de 90 dias e cobre somente vazamento nos pontos em que a Master Óleo interveio;</li>
    <li>retentores, desgaste, solenoides, conversor de torque, sensores e defeitos anteriores ao serviço não estão cobertos;</li>
    <li>levar o veículo a terceiros para diagnosticar, verificar ou mexer no câmbio, antes da avaliação da Master Óleo, encerra a garantia; a verificação é feita somente com agendamento.</li>
  </ul>
  <p>Este termo complementa o Termo de Inspeção Prévia e a ordem de serviço. Ele não afasta a responsabilidade da Master Óleo por falha comprovada na execução do serviço, nos termos da Lei 8.078/1990 (Código de Defesa do Consumidor).</p>
  <p>Curitiba/PR, ${esc(FMT_EXTENSO.format(new Date(os.abertaEm)))}.</p>

  <table class="assin">
    <tr><th>Cliente / responsável</th><th>Master Óleo</th></tr>
    <tr><td class="ass">Assinatura:</td><td class="ass">Assinatura:</td></tr>
    <tr><td>Nome: ${campo(c?.nome)}</td><td>Nome: ${campo(operador.nome)}</td></tr>
    <tr><td>CPF/CNPJ: ${campo(fmtDocumento(c?.documento))}</td><td>Função: ${campo(ROLE_LABEL[operador.role])}</td></tr>
  </table>
</section>`;
}

/** Página HTML pronta para imprimir: 1ª via (cliente) e 2ª via (Master Óleo), cada uma começando em folha nova. */
export function htmlTermoCambio(d: DadosTermo) {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Termo de garantia do câmbio — OS ${esc(d.os.numero)}</title>
<style>
  @page { size: A4; margin: 12mm 14mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 9.6pt/1.38 -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #1a1a1a; background: #fff; }
  .barra { position: sticky; top: 0; background: #0b2a5b; color: #fff; padding: 10px 16px; display: flex; gap: 12px; align-items: center; justify-content: space-between; font-size: 14px; }
  .barra button { font: inherit; font-weight: 700; background: #fff; color: #0b2a5b; border: 0; border-radius: 8px; padding: 8px 14px; cursor: pointer; }
  .via { max-width: 182mm; margin: 0 auto; padding: 8mm 0; }
  .via + .via { break-before: page; page-break-before: always; }
  header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #0b2a5b; padding-bottom: 6px; margin-bottom: 8px; }
  .logo { height: 34px; }
  .via-rotulo { font-weight: 700; font-size: 9pt; letter-spacing: .04em; color: #0b2a5b; border: 1.5px solid #0b2a5b; border-radius: 6px; padding: 3px 8px; }
  h1 { font-size: 14pt; margin: 4px 0 4px; color: #0b2a5b; }
  h2 { font-size: 10.5pt; margin: 9px 0 3px; color: #0b2a5b; }
  p { margin: 3px 0; }
  ul, ol { margin: 2px 0 4px; padding-left: 18px; }
  li { margin: 1px 0; }
  .prestadora { font-size: 8.6pt; color: #444; }
  table { width: 100%; border-collapse: collapse; }
  .ident th, .ident td, .assin th, .assin td { border: 1px solid #c9ced6; padding: 4px 6px; text-align: left; vertical-align: top; }
  .ident th { background: #f2f4f7; font-weight: 600; width: 19%; white-space: nowrap; }
  .ident td { width: 31%; }
  .assin { margin-top: 8px; break-inside: avoid; }
  .assin th { background: #f2f4f7; width: 50%; }
  .assin td.ass { height: 15mm; vertical-align: bottom; }
  .linha { display: inline-block; min-width: 45mm; border-bottom: 1px solid #555; height: 1em; }
  @media print { .barra { display: none; } .via { padding: 0; } }
</style></head>
<body>
  <div class="barra"><span>Termo de garantia — OS ${esc(d.os.numero)} · 2 vias (cliente e Master Óleo)</span><button onclick="window.print()">Imprimir</button></div>
  ${via(d, '1ª VIA — CLIENTE')}
  ${via(d, '2ª VIA — MASTER ÓLEO')}
</body></html>`;
}

/** Abre o termo numa janela nova e chama a impressão quando a logo carregar. Devolve false se o navegador bloqueou a janela. */
export function imprimirTermoCambio(d: Omit<DadosTermo, 'logoUrl'>) {
  const w = window.open('', '_blank');
  if (!w) return false;
  const logoUrl = new URL('./brand/logo-master-oleo.png', document.baseURI).href;
  w.document.open();
  w.document.write(htmlTermoCambio({ ...d, logoUrl }));
  w.document.close();
  const imprimir = () => { try { w.focus(); w.print(); } catch { /* o operador usa o botão Imprimir */ } };
  const logo = w.document.querySelector('img.logo') as HTMLImageElement | null;
  if (logo && !logo.complete) { logo.onload = imprimir; logo.onerror = imprimir; } else setTimeout(imprimir, 150);
  return true;
}
