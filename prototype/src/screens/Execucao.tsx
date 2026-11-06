import { useMemo, useState } from 'react';
import { ir } from '../app/nav';
import { finalizarOS, kmAnteriorMaior, pendenciasFinalizacao, type AdicionalInput, type FinalizarInput, type FotoKm, type ProximaInput } from '../data/api';
import { ADICIONAIS, ESTADOS, ORIGEM_LABEL, RECOMENDACAO, RESPOSTA_CLIENTE, SERVICOS, servicoAplicavel, TIPOS_CAMBIO_AUTO } from '../domain/catalogo';
import { sugerirProxima, textoPrevisto } from '../domain/manutencao';
import type { ServicoKey, TipoCambioAuto, Usuario } from '../domain/types';
import { addMeses, agoraISO, fmtBRL, fmtData, fmtKm, lerReais } from '../domain/util';
import { Alerta, Badge, Btn, Card, Empty, Field, Placa, useAcao, useDB } from '../ui/components';
import { CarroDeLojaBadge, ChecklistBadge } from './common';
import { AjudaBotao } from './Ajuda';
import { FotoPainelKm } from './KmPainel';
import { PausarBotao, RetomarBotao, DevolverBotao } from './Pausa';

interface LinhaProx extends ProximaInput { chave: string; incluir: boolean; editavel: boolean; motivo: string }
type Oferta = { resultado: 'aceito' | 'recusado'; marca?: string; quantidade?: string; codigo?: string; valor?: string };

export function Execucao({ u, osId }: { u: Usuario; osId: string }) {
  const db = useDB();
  const os = db.os.find(o => o.id === osId);
  const acao = useAcao();
  const [km, setKm] = useState('');
  const [fotoKm, setFotoKm] = useState<FotoKm>();
  const [exec, setExec] = useState<Record<string, { executado: boolean; qtd?: string }>>(() =>
    Object.fromEntries((os?.servicos || []).map((s, i) => [`${s.key}:${i}`, { executado: true, qtd: s.quantidade }])));
  const [obsInterna, setObsInterna] = useState(os?.obsInterna || '');
  const [obsCliente, setObsCliente] = useState(os?.obsCliente || '');
  const [tentou, setTentou] = useState(false);
  const [extras, setExtras] = useState<Record<string, Partial<LinhaProx>>>({});
  const [intervaloOleo, setIntervaloOleo] = useState<number | undefined>();
  // Tipo do câmbio automático: vem do que foi informado na última visita do carro (o mecânico confirma ou troca).
  const [tipoCambio, setTipoCambio] = useState<TipoCambioAuto | undefined>(() => db.os
    .filter(o => o.id !== osId && o.veiculoId === os?.veiculoId && o.status === 'concluido')
    .sort((a, b) => (b.concluidaEm || '').localeCompare(a.concluidaEm || ''))
    .flatMap(o => o.servicos).find(s => s.key === 'cambioAutomatico' && s.tipoCambio)?.tipoCambio);
  const intervaloCambio = tipoCambio ? TIPOS_CAMBIO_AUTO[tipoCambio].km : undefined;
  /** Adicionais: aceito (com dados) | recusado | não oferecido (ausente). */
  /** Por item da lista de adicionais (ADICIONAIS[].id): aceito (com dados) | recusado | não oferecido (ausente). */
  const [ofertas, setOfertas] = useState<Record<string, Oferta>>({});

  const v = os && db.veiculos.find(x => x.id === os.veiculoId);
  const c = os && db.checklists.find(x => x.id === os.checklistId);
  const kmNum = Number(km.replace(/\D/g, '')) || null;

  const proximas: LinhaProx[] = useMemo(() => {
    if (!os || !v) return [];
    const linhas: LinhaProx[] = [];
    os.servicos.forEach((s, i) => {
      if (!exec[`${s.key}:${i}`]?.executado) return;
      const sug = sugerirProxima(s.key, SERVICOS[s.key].nome, db.regrasIntervalo, v, agoraISO(), kmNum ?? undefined, s.key === 'oleoMotor' ? intervaloOleo : s.key === 'cambioAutomatico' ? intervaloCambio : undefined);
      if (!sug.regra) return;
      linhas.push({
        chave: `s:${s.key}`, servicoKey: s.key, descricao: sug.descricao, regraId: sug.regra.id, origem: sug.confirmavel ? sug.regra.origem : 'nao_confirmada',
        fonte: sug.regra.fonte, kmPrevisto: sug.kmPrevisto, dataPrevista: sug.dataPrevista, incluir: true, editavel: false, motivo: sug.motivo,
      });
    });
    // Troca de câmbio vendida na bancada também entra nas próximas manutenções.
    for (const k of ['cambioAutomatico', 'cambioManual'] as const) {
      if (os.servicos.some(s => s.key === k) || !ADICIONAIS.some(a => a.key === k && ofertas[a.id]?.resultado === 'aceito')) continue;
      const sug = sugerirProxima(k, SERVICOS[k].nome, db.regrasIntervalo, v, agoraISO(), kmNum ?? undefined, k === 'cambioAutomatico' ? intervaloCambio : undefined);
      if (sug.regra) linhas.push({ chave: `s:${k}`, servicoKey: k, descricao: sug.descricao, regraId: sug.regra.id, origem: sug.confirmavel ? sug.regra.origem : 'nao_confirmada',
        fonte: sug.regra.fonte, kmPrevisto: sug.kmPrevisto, dataPrevista: sug.dataPrevista, incluir: true, editavel: false, motivo: sug.motivo });
    }
    // Itens com desgaste, em mau estado ou a avaliar que o cliente não fez agora: continuam recomendados
    // nas próximas manutenções (sempre registrados — o mecânico não pode tirar).
    c?.defs.forEach(d => {
      const it = c.itens[d.id];
      const sit = db.oportunidades.find(o => o.osId === os.id && o.itemDefId === d.id)?.situacao;
      if (sit === 'aceita' || !(it.estado === 'atencao' || it.estado === 'prioritario' || it.estado === 'pendente_avaliacao')) return;
      if (d.servicoRelacionado && os.servicos.some((sv, i) => sv.key === d.servicoRelacionado && exec[`${sv.key}:${i}`]?.executado)) return; // feito nesta OS
      if (d.servicoRelacionado && ADICIONAIS.some(a => a.key === d.servicoRelacionado && ofertas[a.id]?.resultado === 'aceito')) return; // aceito na bancada
      linhas.push({
        chave: `i:${d.id}`, itemDefId: d.id, estadoItem: it.estado, descricao: it.estado === 'pendente_avaliacao' ? `Avaliar ${d.nome.toLowerCase()}` : it.recomendacao || `Revisar ${d.nome.toLowerCase()}`,
        origem: 'profissional', fonte: `Checklist da OS #${os.numero}`, incluir: true, editavel: true,
        motivo: [RECOMENDACAO[it.estado].interno, sit && RESPOSTA_CLIENTE[sit]].filter(Boolean).join(' · '),
      });
    });
    return linhas.map(l => ({ ...l, ...extras[l.chave], ...(l.estadoItem ? { incluir: true } : {}) }));
  }, [os, v, c, db, exec, kmNum, extras, intervaloOleo, intervaloCambio, ofertas]);

  if (!os || !v) return <div className="card"><Empty titulo="OS não encontrada." /></div>;
  if (os.mecanicoId !== u.id) return <div className="card"><Empty titulo="Só o mecânico desta OS registra a execução." /></div>;
  if (os.retornoDeOsId) return <div className="card"><Empty titulo="OS de retorno: o registro é feito no atendimento do retorno."><a href={`#/os/${os.id}/retorno`}>Abrir atendimento do retorno</a></Empty></div>;
  if (os.status !== 'andamento') return <div className="card"><Empty titulo={os.status === 'pausada' ? 'OS pausada. Retome para continuar.' : 'Esta OS não está em andamento.'}><div className="stack"><RetomarBotao u={u} os={os} /><a href={`#/os/${os.id}`}>Ver OS</a></div></Empty></div>;

  const regraOleo = db.regrasIntervalo.find(r => r.ativo && r.servicoKey === 'oleoMotor' && r.validada && r.opcoesKm?.length);
  const oleoExecutado = os.servicos.some((s, i) => s.key === 'oleoMotor' && exec[`${s.key}:${i}`]?.executado);
  const regraCambio = db.regrasIntervalo.find(r => r.ativo && r.servicoKey === 'cambioAutomatico' && r.validada && r.opcoesKm?.length);
  const cambioFeito = os.servicos.some((s, i) => s.key === 'cambioAutomatico' && exec[`${s.key}:${i}`]?.executado) || ADICIONAIS.some(a => a.key === 'cambioAutomatico' && ofertas[a.id]?.resultado === 'aceito');
  const naOS = new Set(os.servicos.map(s => s.key));
  // Indicado pelo checklist (Atenção/Prioritário) aparece primeiro.
  const indicacao = (itemId?: string) => {
    const it = itemId && c?.itens[itemId];
    return it && (it.estado === 'atencao' || it.estado === 'prioritario') ? `${c!.defs.find(d => d.id === itemId)?.nome}: ${ESTADOS[it.estado].curto}` : null;
  };
  const adicionaisLista = ADICIONAIS.filter(a => servicoAplicavel(a.key, v.cambio) && !naOS.has(a.key))
    .map(a => ({ ...a, motivo: indicacao(a.itemRelacionado) }))
    .sort((x, y) => Number(!!y.motivo) - Number(!!x.motivo));
  const valorNum = (x?: string) => lerReais(x) || undefined;
  // Os aditivos (radiador, combustível, câmbio) são um serviço só no sistema atual: vão juntos, com os valores somados.
  const porServico = new Map<ServicoKey, AdicionalInput>();
  for (const a of adicionaisLista) {
    const o = ofertas[a.id];
    if (o?.resultado !== 'aceito') continue;
    const marca = [a.marcaPadrao, o.marca?.trim()].filter(Boolean).join(' · ') || undefined;
    const ja = porServico.get(a.key);
    if (ja) { ja.marca = [ja.marca, marca].filter(Boolean).join(' + ') || undefined; ja.valor = ((ja.valor || 0) + (valorNum(o.valor) || 0)) || undefined; }
    else porServico.set(a.key, { key: a.key, marca, quantidade: o.quantidade, codigo: o.codigo, valor: valorNum(o.valor), ...(a.key === 'cambioAutomatico' ? { tipoCambio, intervaloKm: intervaloCambio } : {}) });
  }
  const recusadosKeys = [...new Set(adicionaisLista.filter(a => ofertas[a.id]?.resultado === 'recusado' && !porServico.has(a.key)).map(a => a.key))];
  const kmAnterior = kmAnteriorMaior(db, os, kmNum);
  const entrada: FinalizarInput = {
    km: kmNum,
    fotoKm: kmAnterior != null ? fotoKm : undefined,
    servicos: os.servicos.map((s, i) => ({ key: s.key, executado: !!exec[`${s.key}:${i}`]?.executado, quantidadeExecutada: exec[`${s.key}:${i}`]?.qtd,
      ...(s.key === 'oleoMotor' ? { intervaloKm: intervaloOleo } : s.key === 'cambioAutomatico' ? { intervaloKm: intervaloCambio, tipoCambio } : {}) })),
    adicionais: [...porServico.values()],
    recusados: recusadosKeys,
    obsInterna, obsCliente,
    proximas: proximas.filter(p => p.incluir).map(({ chave: _c, incluir: _i, editavel: _e, motivo: _m, ...p }) => p),
  };
  const pend = pendenciasFinalizacao(db, os, entrada);

  const finalizar = async () => {
    setTentou(true);
    if (pend.length) return;
    if (await acao.executar(() => finalizarOS(u, os.id, entrada).then(() => true), `OS #${os.numero} concluída. Relatório do cliente pronto.`)) ir(`/os/${os.id}`);
  };

  return (
    <div style={{ maxWidth: 820 }}>
      <a className="back" href={`#/os/${os.id}`}>‹ OS #{os.numero}</a>
      <div className="page-head">
        <div><h1>Execução e finalização</h1><div className="row" style={{ marginTop: 6 }}><Placa placa={v.placa} /><b>{v.marca} {v.modelo}</b>{os.carroDeLoja ? <CarroDeLojaBadge os={os} /> : <ChecklistBadge c={c} />}</div></div>
        <div className="row"><AjudaBotao u={u} os={os} /><PausarBotao u={u} os={os} /><DevolverBotao u={u} os={os} /></div>
      </div>

      {c && !os.carroDeLoja && c.status !== 'concluido' && c.status !== 'excecao_autorizada' && (
        <div style={{ marginBottom: 12 }}><Alerta tipo="warn">O checklist precisa estar concluído (ou com exceção autorizada) antes de finalizar. <a href={`#/os/${os.id}/checklist`}>Abrir checklist</a></Alerta></div>
      )}

      <Card titulo="Serviços executados">
        {os.servicos.map((s, i) => {
          const k = `${s.key}:${i}`;
          return (
            <div key={k} className="row nowrap" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
              <label className="check grow" style={{ padding: '6px 0' }}>
                <input type="checkbox" checked={!!exec[k]?.executado} onChange={e => setExec({ ...exec, [k]: { ...exec[k], executado: e.target.checked } })} />
                <span>
                  <b>{SERVICOS[s.key].nome}</b> {s.origem === 'checklist' && <Badge tom="info">Do checklist</Badge>}{s.origem === 'adicional' && <Badge tom="info">Adicional</Badge>}
                  <span className="small muted" style={{ display: 'block' }}>{[s.marca, s.codigo && (s.key === 'cambioAutomatico' ? `Filtro ${s.codigo}` : s.codigo), s.valor ? fmtBRL(s.valor) : null].filter(Boolean).join(' · ')}</span>
                </span>
              </label>
              {SERVICOS[s.key].campos.includes('quantidade') && (
                <input aria-label={`Litros usados em ${SERVICOS[s.key].nome}`} className="input" style={{ width: 90 }} inputMode="decimal" value={exec[k]?.qtd || ''} placeholder="L"
                  onChange={e => setExec({ ...exec, [k]: { ...exec[k], qtd: e.target.value } })} />
              )}
            </div>
          );
        })}
      </Card>

      {cambioFeito && regraCambio && (
        <Card titulo="Tipo do câmbio automático">
          <p className="small muted" style={{ marginBottom: 8 }}>Define a próxima troca: {Object.values(TIPOS_CAMBIO_AUTO).map(t => `${t.rotulo} ${t.km / 1000} mil km`).join(' · ')}, ou {Math.round((regraCambio.meses || 36) / 12)} anos — o que vier primeiro.</p>
          <div className="row" role="radiogroup" aria-label="Tipo do câmbio automático">
            {(Object.keys(TIPOS_CAMBIO_AUTO) as TipoCambioAuto[]).map(t => (
              <button key={t} type="button" role="radio" aria-checked={tipoCambio === t} data-tipo-cambio={t} className={`chip ${tipoCambio === t ? 'on' : ''}`} onClick={() => setTipoCambio(t)}>{TIPOS_CAMBIO_AUTO[t].rotulo}</button>
            ))}
          </div>
          {tentou && !tipoCambio && <div className="small" style={{ color: 'var(--red)', marginTop: 6 }}>Informe o tipo do câmbio.</div>}
          {intervaloCambio && kmNum && <div className="small" style={{ marginTop: 8 }}>Próxima troca do câmbio: <b>{fmtKm(kmNum + intervaloCambio)}</b> ou <b>{fmtData(addMeses(agoraISO(), regraCambio.meses || 36))}</b>, o que vier primeiro.</div>}
          {intervaloCambio && !kmNum && <div className="small muted" style={{ marginTop: 8 }}>Informe a quilometragem atual abaixo para calcular a próxima troca.</div>}
        </Card>
      )}

      {oleoExecutado && regraOleo && (
        <Card titulo="Intervalo da próxima troca de óleo">
          <p className="small muted" style={{ marginBottom: 8 }}>Regra Master Óleo: {regraOleo.opcoesKm!.map(x => `${x / 1000} mil`).join(', ')} km conforme o óleo aplicado, ou {regraOleo.meses} meses — o que vier primeiro.</p>
          <div className="row" role="radiogroup" aria-label="Intervalo do óleo">
            {regraOleo.opcoesKm!.map(x => (
              <button key={x} type="button" role="radio" aria-checked={intervaloOleo === x} data-intervalo={x} className={`chip ${intervaloOleo === x ? 'on' : ''}`} onClick={() => setIntervaloOleo(x)}>{x.toLocaleString('pt-BR')} km</button>
            ))}
          </div>
          {tentou && !intervaloOleo && <div className="small" style={{ color: 'var(--red)', marginTop: 6 }}>Escolha o intervalo conforme o óleo aplicado.</div>}
          {intervaloOleo && kmNum && <div className="small" style={{ marginTop: 8 }}>Próxima troca: <b>{fmtKm(kmNum + intervaloOleo)}</b> ou <b>{fmtData(addMeses(agoraISO(), regraOleo.meses || 6))}</b>, o que vier primeiro.</div>}
        </Card>
      )}

      <Card titulo="Adicionais oferecidos ao cliente">
        <p className="small muted" style={{ marginBottom: 6 }}>Registre o que você ofereceu na bancada. Aceito vira serviço executado nesta OS e conta como adicional vendido (não precisa passar pelo vendedor). Os indicados pelo seu checklist aparecem primeiro.</p>
        {adicionaisLista.map(a => {
          const o = ofertas[a.id];
          return (
            <div key={a.id} className="adicional" data-adicional={a.id}>
              <div className="row between">
                <div><b>{a.rotulo}</b>{a.motivo && <div className="small" style={{ color: 'var(--warn)' }}>Indicado pelo checklist — {a.motivo}</div>}</div>
                <div className="row">
                  {(['aceito', 'recusado'] as const).map(r => (
                    <button key={r} type="button" className={`chip ${o?.resultado === r ? 'on' : ''}`}
                      onClick={() => { const n = { ...ofertas }; if (o?.resultado === r) delete n[a.id]; else n[a.id] = { ...o, resultado: r }; setOfertas(n); }}>
                      {r === 'aceito' ? 'Cliente aceitou' : 'Ofereci, recusou'}
                    </button>
                  ))}
                </div>
              </div>
              {o?.resultado === 'aceito' && <DadosAdicional k={a.key} rotulo={a.rotulo} o={o} onChange={x => setOfertas({ ...ofertas, [a.id]: { ...o, ...x } })} />}
            </div>
          );
        })}
      </Card>

      <Card titulo="Quilometragem">
        <Field rotulo="KM no painel" obrigatorio htmlFor="km" dica={`Último registrado: ${fmtKm(v.kmAtual)}${v.kmAtualEm ? ` em ${fmtData(v.kmAtualEm)}` : ''}`}
          erro={tentou && pend.find(p => p.toLowerCase().includes('km') || p.toLowerCase().includes('quilometragem')) || null}>
          <input id="km" className="input" inputMode="numeric" value={km} onChange={e => setKm(e.target.value.replace(/\D/g, '').slice(0, 7))} placeholder="Ex.: 53450" style={{ maxWidth: 220 }} />
        </Field>
        {kmAnterior != null && <FotoPainelKm kmAnterior={kmAnterior} em={v.kmAtualEm} foto={fotoKm} onFoto={setFotoKm} />}
      </Card>

      <Card titulo="Próximas manutenções">
        <p className="small muted" style={{ marginBottom: 10 }}>Itens do checklist com desgaste, em mau estado ou a avaliar entram sempre, mesmo que o cliente não faça agora: ficam recomendados no histórico do carro e no relatório até serem resolvidos. Km/data só com regra validada; nenhum intervalo é inventado.</p>
        {proximas.length === 0 && <p className="small muted">Nenhuma sugestão para os serviços desta OS.</p>}
        {proximas.map(p => (
          <div key={p.chave} style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
            <label className="check" style={{ padding: 0 }}>
              <input type="checkbox" checked={p.incluir} disabled={!!p.estadoItem} title={p.estadoItem ? 'Recomendação do checklist: fica registrada até ser resolvida' : undefined}
                onChange={e => setExtras({ ...extras, [p.chave]: { ...extras[p.chave], incluir: e.target.checked } })} />
              <span className="grow">
                <b>{p.descricao}</b>
                <span className="row" style={{ marginTop: 4 }}>
                  {p.estadoItem ? <Badge tom={RECOMENDACAO[p.estadoItem].tom}>{ESTADOS[p.estadoItem].curto}</Badge>
                    : <Badge tom={p.origem === 'nao_confirmada' ? 'muted' : p.origem === 'profissional' ? 'info' : 'navy'}>{ORIGEM_LABEL[p.origem].rotulo}</Badge>}
                  <span className="small muted">{p.motivo}</span>
                </span>
                {!p.editavel && (p.kmPrevisto || p.dataPrevista) && <span className="small" style={{ display: 'block', marginTop: 4 }}>Previsto: {textoPrevisto(p.kmPrevisto, p.dataPrevista, fmtKm, fmtData)}</span>}
                <span className="tiny muted" style={{ display: 'block' }}>Fonte: {p.fonte}</span>
              </span>
            </label>
            {p.editavel && p.incluir && (
              <div className="row" style={{ marginTop: 6, paddingLeft: 32 }}>
                <select className="input" style={{ width: 'auto' }} aria-label="Quando revisar" value={p.dataPrevista ? 'meses' : 'proxima'}
                  onChange={e => setExtras({ ...extras, [p.chave]: { ...extras[p.chave], dataPrevista: e.target.value === 'meses' ? addMeses(agoraISO(), 3) : undefined } })}>
                  <option value="proxima">Na próxima visita</option>
                  <option value="meses">Em até 3 meses</option>
                </select>
              </div>
            )}
          </div>
        ))}
      </Card>

      <Card titulo="Observações">
        <Field rotulo="Para o cliente (aparece no relatório)" htmlFor="obs-cli"><textarea id="obs-cli" className="input" value={obsCliente} onChange={e => setObsCliente(e.target.value)} /></Field>
        <Field rotulo="Interna (só equipe)" htmlFor="obs-int"><textarea id="obs-int" className="input" value={obsInterna} onChange={e => setObsInterna(e.target.value)} /></Field>
      </Card>

      {tentou && pend.length > 0 && <div style={{ marginTop: 12 }}><Alerta tipo="crit"><b>Antes de finalizar:</b><ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{pend.map(p => <li key={p}>{p}</li>)}</ul></Alerta></div>}
      <div style={{ marginTop: 16 }}><Btn block carregando={acao.ocupado} onClick={finalizar}>Finalizar OS</Btn></div>
    </div>
  );
}

function DadosAdicional({ k, rotulo, o, onChange }: { k: ServicoKey; rotulo: string; o: Oferta; onChange: (x: Partial<Oferta>) => void }) {
  const campos = SERVICOS[k].campos;
  return (
    <div className="row" style={{ marginTop: 6 }}>
      {campos.includes('marca') && <input aria-label={`Produto de ${rotulo}`} className="input" style={{ flex: 1, minWidth: 140 }} placeholder="Produto/marca" value={o.marca || ''} onChange={e => onChange({ marca: e.target.value })} />}
      {campos.includes('codigo') && <input aria-label={`Código de ${rotulo}`} className="input" style={{ flex: 1, minWidth: 120 }} placeholder={k === 'cambioAutomatico' ? 'Código do filtro (se tiver)' : 'Código'} value={o.codigo || ''} onChange={e => onChange({ codigo: e.target.value })} />}
      {campos.includes('quantidade') && <input aria-label={`Litros de ${rotulo}`} className="input" style={{ width: 90 }} placeholder="L" inputMode="decimal" value={o.quantidade || ''} onChange={e => onChange({ quantidade: e.target.value })} />}
      <input aria-label={`Valor de ${rotulo}`} className="input" style={{ width: 130 }} placeholder="Valor R$ (se souber)" inputMode="decimal" value={o.valor || ''} onChange={e => onChange({ valor: e.target.value.replace(/[^\d,.]/g, '') })} />
      {lerReais(o.valor) > 0 && <span className="small muted" style={{ alignSelf: 'center' }}>= {fmtBRL(lerReais(o.valor))}</span>}
    </div>
  );
}
