import { useMemo, useState } from 'react';
import { ir } from '../app/nav';
import { finalizarOS, kmAnteriorMaior, pendenciasFinalizacao, type AdicionalInput, type FinalizarInput, type FotoKm, type ProximaInput } from '../data/api';
import { ADICIONAIS, ESTADOS, ORIGEM_LABEL, RECOMENDACAO, RESPOSTA_CLIENTE, SERVICO_KEYS, SERVICOS, servicoAplicavel } from '../domain/catalogo';
import { sugerirProxima, textoPrevisto } from '../domain/manutencao';
import type { ServicoKey, Usuario } from '../domain/types';
import { addMeses, agoraISO, fmtBRL, fmtData, fmtKm } from '../domain/util';
import { Alerta, Badge, Btn, Card, Empty, Field, Placa, useAcao, useDB } from '../ui/components';
import { ChecklistBadge } from './common';
import { AjudaBotao } from './Ajuda';
import { FotoPainelKm } from './KmPainel';
import { PausarBotao } from './Pausa';

interface LinhaProx extends ProximaInput { chave: string; incluir: boolean; editavel: boolean; motivo: string }

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
  /** Adicionais: aceito (com dados) | recusado | não oferecido (ausente). */
  const [ofertas, setOfertas] = useState<Partial<Record<ServicoKey, { resultado: 'aceito' | 'recusado'; marca?: string; quantidade?: string; valor?: string }>>>({});
  const [outro, setOutro] = useState<ServicoKey | ''>('');

  const v = os && db.veiculos.find(x => x.id === os.veiculoId);
  const c = os && db.checklists.find(x => x.id === os.checklistId);
  const kmNum = Number(km.replace(/\D/g, '')) || null;

  const proximas: LinhaProx[] = useMemo(() => {
    if (!os || !v) return [];
    const linhas: LinhaProx[] = [];
    os.servicos.forEach((s, i) => {
      if (!exec[`${s.key}:${i}`]?.executado) return;
      const sug = sugerirProxima(s.key, SERVICOS[s.key].nome, db.regrasIntervalo, v, agoraISO(), kmNum ?? undefined, s.key === 'oleoMotor' ? intervaloOleo : undefined);
      if (!sug.regra) return;
      linhas.push({
        chave: `s:${s.key}`, servicoKey: s.key, descricao: sug.descricao, regraId: sug.regra.id, origem: sug.confirmavel ? sug.regra.origem : 'nao_confirmada',
        fonte: sug.regra.fonte, kmPrevisto: sug.kmPrevisto, dataPrevista: sug.dataPrevista, incluir: true, editavel: false, motivo: sug.motivo,
      });
    });
    // Itens com desgaste, em mau estado ou a avaliar que o cliente não fez agora: continuam recomendados
    // nas próximas manutenções (sempre registrados — o mecânico não pode tirar).
    c?.defs.forEach(d => {
      const it = c.itens[d.id];
      const sit = db.oportunidades.find(o => o.osId === os.id && o.itemDefId === d.id)?.situacao;
      if (sit === 'aceita' || !(it.estado === 'atencao' || it.estado === 'prioritario' || it.estado === 'pendente_avaliacao')) return;
      if (d.servicoRelacionado && os.servicos.some((sv, i) => sv.key === d.servicoRelacionado && exec[`${sv.key}:${i}`]?.executado)) return; // feito nesta OS
      linhas.push({
        chave: `i:${d.id}`, itemDefId: d.id, estadoItem: it.estado, descricao: it.estado === 'pendente_avaliacao' ? `Avaliar ${d.nome.toLowerCase()}` : it.recomendacao || `Revisar ${d.nome.toLowerCase()}`,
        origem: 'profissional', fonte: `Checklist da OS #${os.numero}`, incluir: true, editavel: true,
        motivo: [RECOMENDACAO[it.estado].interno, sit && RESPOSTA_CLIENTE[sit]].filter(Boolean).join(' · '),
      });
    });
    return linhas.map(l => ({ ...l, ...extras[l.chave], ...(l.estadoItem ? { incluir: true } : {}) }));
  }, [os, v, c, db, exec, kmNum, extras, intervaloOleo]);

  if (!os || !v) return <div className="card"><Empty titulo="OS não encontrada." /></div>;
  if (os.mecanicoId !== u.id) return <div className="card"><Empty titulo="Só o mecânico desta OS registra a execução." /></div>;
  if (os.retornoDeOsId) return <div className="card"><Empty titulo="OS de retorno: o registro é feito no atendimento do retorno."><a href={`#/os/${os.id}/retorno`}>Abrir atendimento do retorno</a></Empty></div>;
  if (os.status !== 'andamento') return <div className="card"><Empty titulo={os.status === 'pausada' ? 'OS pausada. Retome na Operação para continuar.' : 'Esta OS não está em andamento.'}><a href={`#/os/${os.id}`}>Ver OS</a></Empty></div>;

  const regraOleo = db.regrasIntervalo.find(r => r.ativo && r.servicoKey === 'oleoMotor' && r.validada && r.opcoesKm?.length);
  const oleoExecutado = os.servicos.some((s, i) => s.key === 'oleoMotor' && exec[`${s.key}:${i}`]?.executado);
  const naOS = new Set(os.servicos.map(s => s.key));
  const adicionaisLista = ADICIONAIS.filter(a => servicoAplicavel(a.key, v.cambio) && !naOS.has(a.key));
  const outrosPossiveis = SERVICO_KEYS.filter(k => servicoAplicavel(k, v.cambio) && !naOS.has(k) && !adicionaisLista.some(a => a.key === k));
  const aceitos = (Object.entries(ofertas) as [ServicoKey, NonNullable<(typeof ofertas)[ServicoKey]>][]).filter(([, o]) => o.resultado === 'aceito');
  const kmAnterior = kmAnteriorMaior(db, os, kmNum);
  const entrada: FinalizarInput = {
    km: kmNum,
    fotoKm: kmAnterior != null ? fotoKm : undefined,
    servicos: os.servicos.map((s, i) => ({ key: s.key, executado: !!exec[`${s.key}:${i}`]?.executado, quantidadeExecutada: exec[`${s.key}:${i}`]?.qtd, intervaloKm: s.key === 'oleoMotor' ? intervaloOleo : undefined })),
    adicionais: aceitos.map(([key, o]): AdicionalInput => ({ key, marca: o.marca, quantidade: o.quantidade, valor: Number(String(o.valor || '').replace(/\./g, '').replace(',', '.')) || undefined })),
    recusados: (Object.entries(ofertas) as [ServicoKey, { resultado: string }][]).filter(([, o]) => o.resultado === 'recusado').map(([k]) => k),
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
        <div><h1>Execução e finalização</h1><div className="row" style={{ marginTop: 6 }}><Placa placa={v.placa} /><b>{v.marca} {v.modelo}</b><ChecklistBadge c={c} /></div></div>
        <div className="row"><AjudaBotao u={u} os={os} /><PausarBotao u={u} os={os} /></div>
      </div>

      {c && c.status !== 'concluido' && c.status !== 'excecao_autorizada' && (
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
                  <span className="small muted" style={{ display: 'block' }}>{[s.marca, s.codigo, s.valor ? fmtBRL(s.valor) : null].filter(Boolean).join(' · ')}</span>
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
        <p className="small muted" style={{ marginBottom: 6 }}>Registre o que você ofereceu na bancada. Aceito vira serviço executado nesta OS e conta como adicional vendido.</p>
        {adicionaisLista.map(a => {
          const o = ofertas[a.key];
          const it = a.itemRelacionado && c?.itens[a.itemRelacionado];
          const motivo = it && (it.estado === 'atencao' || it.estado === 'prioritario') ? `${c!.defs.find(d => d.id === a.itemRelacionado)?.nome}: ${ESTADOS[it.estado].curto}` : null;
          return (
            <div key={a.key} className="adicional" data-adicional={a.key}>
              <div className="row between">
                <div><b>{a.rotulo}</b>{motivo && <div className="small" style={{ color: 'var(--warn)' }}>Indicado pelo checklist — {motivo}</div>}</div>
                <div className="row">
                  {(['aceito', 'recusado'] as const).map(r => (
                    <button key={r} type="button" className={`chip ${o?.resultado === r ? 'on' : ''}`}
                      onClick={() => { const n = { ...ofertas }; if (o?.resultado === r) delete n[a.key]; else n[a.key] = { ...o, resultado: r }; setOfertas(n); }}>
                      {r === 'aceito' ? 'Cliente aceitou' : 'Ofereci, recusou'}
                    </button>
                  ))}
                </div>
              </div>
              {o?.resultado === 'aceito' && <DadosAdicional k={a.key} o={o} onChange={x => setOfertas({ ...ofertas, [a.key]: { ...o, ...x } })} />}
            </div>
          );
        })}
        {aceitos.filter(([k]) => !adicionaisLista.some(a => a.key === k)).map(([k, o]) => (
          <div key={k} className="adicional" data-adicional={k}>
            <div className="row between"><b>{SERVICOS[k].nome}</b><Btn tamanho="sm" variante="ghost" onClick={() => { const n = { ...ofertas }; delete n[k]; setOfertas(n); }}>Remover</Btn></div>
            <DadosAdicional k={k} o={o} onChange={x => setOfertas({ ...ofertas, [k]: { ...o, ...x } })} />
          </div>
        ))}
        <div className="row" style={{ marginTop: 10 }}>
          <select aria-label="Outro serviço vendido" id="outro-servico" className="input" style={{ width: 'auto', flex: 1 }} value={outro} onChange={e => setOutro(e.target.value as ServicoKey)}>
            <option value="">Vendeu outro serviço?</option>
            {outrosPossiveis.filter(k => !ofertas[k]).map(k => <option key={k} value={k}>{SERVICOS[k].nome}</option>)}
          </select>
          <Btn variante="sec" disabled={!outro} onClick={() => { if (outro) { setOfertas({ ...ofertas, [outro]: { resultado: 'aceito' } }); setOutro(''); } }}>Adicionar</Btn>
        </div>
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

function DadosAdicional({ k, o, onChange }: { k: ServicoKey; o: { marca?: string; quantidade?: string; valor?: string }; onChange: (x: { marca?: string; quantidade?: string; valor?: string }) => void }) {
  const campos = SERVICOS[k].campos;
  return (
    <div className="row nowrap" style={{ marginTop: 6 }}>
      {campos.includes('marca') && <input aria-label={`Produto de ${SERVICOS[k].nome}`} className="input" placeholder="Produto/marca" value={o.marca || ''} onChange={e => onChange({ marca: e.target.value })} />}
      {campos.includes('quantidade') && <input aria-label={`Litros de ${SERVICOS[k].nome}`} className="input" style={{ width: 90 }} placeholder="L" inputMode="decimal" value={o.quantidade || ''} onChange={e => onChange({ quantidade: e.target.value })} />}
      <input aria-label={`Valor de ${SERVICOS[k].nome}`} className="input" style={{ width: 130 }} placeholder="Valor R$ (se souber)" inputMode="decimal" value={o.valor || ''} onChange={e => onChange({ valor: e.target.value.replace(/[^\d,.]/g, '') })} />
    </div>
  );
}
