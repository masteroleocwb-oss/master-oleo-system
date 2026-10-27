import { useEffect, useMemo, useState } from 'react';
import { ir } from '../app/nav';
import { abrirOS, buscarVeiculosEClientes, validarNovaOS, type NovaOSInput } from '../data/api';
import { SERVICO_KEYS, SERVICOS } from '../domain/catalogo';
import type { Cambio, ServicoKey, ServicoOS, Usuario } from '../domain/types';
import { fmtData, fmtKm, normalizarPlaca, placaValida } from '../domain/util';
import { Alerta, Badge, Btn, Card, Field, Placa, SaveIndicator, Segmented, useAcao, useDB, type SaveState } from '../ui/components';

const RASCUNHO = 'mo-proto:rascunho-nova-os';

interface Form {
  veiculoId?: string;
  busca: string;
  novo: boolean;
  placa: string; marca: string; modelo: string; ano: string; motor: string; cambio: Cambio;
  clienteNome: string; clienteTel: string;
  vendedorId: string;
  servicos: Partial<Record<ServicoKey, { marca?: string; quantidade?: string; codigo?: string }>>;
  valor: string;
  naoTesteFreio: boolean; naoTesteCambio: boolean;
}

const VAZIO = (vendedorId: string): Form => ({
  busca: '', novo: false, placa: '', marca: '', modelo: '', ano: '', motor: '', cambio: 'manual', clienteNome: '', clienteTel: '',
  vendedorId, servicos: { oleoMotor: {}, filtroOleo: {} }, valor: '', naoTesteFreio: false, naoTesteCambio: false,
});

export function NovaOS({ u }: { u: Usuario }) {
  const db = useDB();
  const vendedores = db.usuarios.filter(x => (x.role === 'vendedor' || x.role === 'lider') && x.ativo);
  const [f, setF] = useState<Form>(() => VAZIO(u.role === 'vendedor' ? u.id : ''));
  const [rascunho, setRascunho] = useState<Form | null>(() => { try { const r = localStorage.getItem(RASCUNHO); return r ? JSON.parse(r) : null; } catch { return null; } });
  const [salvoLocal, setSalvoLocal] = useState<SaveState>('ocioso');
  const [tentou, setTentou] = useState(false);
  const acao = useAcao();

  // Rascunho automático: se o aparelho travar ou a página fechar, nada se perde.
  const sujo = f.busca || f.veiculoId || f.placa || f.valor || f.clienteNome;
  useEffect(() => {
    if (!sujo || rascunho) return;
    setSalvoLocal('pendente');
    const t = setTimeout(() => { try { localStorage.setItem(RASCUNHO, JSON.stringify(f)); setSalvoLocal('salvo'); } catch { setSalvoLocal('falha'); } }, 600);
    return () => clearTimeout(t);
  }, [f, sujo, rascunho]);

  // Começar a digitar sem recuperar substitui o rascunho antigo (o aviso deixa isso claro).
  const set = (p: Partial<Form>) => { if (rascunho) setRascunho(null); setF(x => ({ ...x, ...p })); };
  const resultados = useMemo(() => (f.veiculoId || f.novo ? [] : buscarVeiculosEClientes(u, f.busca)), [db, f.busca, f.veiculoId, f.novo, u]);
  const veiculo = db.veiculos.find(v => v.id === f.veiculoId);
  const cliente = veiculo && db.clientes.find(c => c.id === veiculo.clienteId);
  const placaJaExiste = f.novo && placaValida(f.placa) && db.veiculos.find(v => normalizarPlaca(v.placa) === normalizarPlaca(f.placa));

  const entrada: NovaOSInput = {
    veiculoId: f.veiculoId,
    novoVeiculo: f.novo ? { placa: f.placa, marca: f.marca.trim(), modelo: f.modelo.trim(), ano: Number(f.ano) || 0, motor: f.motor.trim(), cambio: f.cambio, combustivel: 'Flex' } : undefined,
    novoCliente: f.novo ? { nome: f.clienteNome, telefone: f.clienteTel } : undefined,
    vendedorId: f.vendedorId,
    servicos: Object.entries(f.servicos).map(([key, d]) => ({ key: key as ServicoKey, ...d, origem: 'balcao', executado: false }) as ServicoOS),
    valorInicial: Number(String(f.valor).replace(/\./g, '').replace(',', '.')) || 0,
    naoFazerTesteFreio: f.naoTesteFreio || undefined,
    naoFazerTesteCambio: f.naoTesteCambio || undefined,
  };
  const erros = validarNovaOS(entrada);

  const salvar = async () => {
    setTentou(true);
    if (erros.length) return;
    const os = await acao.executar(() => abrirOS(u, entrada));
    if (os) {
      try { localStorage.removeItem(RASCUNHO); } catch { /* ignora */ }
      ir(`/os/${os.id}?criada=1`);
    }
  };

  const ultimas = veiculo ? db.os.filter(o => o.veiculoId === veiculo.id && o.status === 'concluido').sort((a, b) => b.abertaEm.localeCompare(a.abertaEm)).slice(0, 2) : [];
  const recomendacoesAbertas = veiculo ? db.oportunidades.filter(o => o.veiculoId === veiculo.id && o.situacao === 'avaliar_depois') : [];

  return (
    <div style={{ maxWidth: 760 }}>
      <a className="back" href="#/operacao">‹ Operação</a>
      <div className="page-head">
        <div><h1>Nova OS</h1><div className="sub">O número é gerado ao salvar, sem risco de repetir.</div></div>
        <SaveIndicator estado={salvoLocal === 'salvo' ? 'salvo' : salvoLocal} />
      </div>

      {rascunho && (
        <div style={{ marginBottom: 12 }}>
          <Alerta tipo="warn">
            <b>Há um cadastro não finalizado neste aparelho.</b> Se começar um novo cadastro, ele será substituído.
            <div className="row" style={{ marginTop: 8 }}>
              <Btn tamanho="sm" onClick={() => { setF(rascunho); setRascunho(null); }}>Recuperar rascunho</Btn>
              <Btn tamanho="sm" variante="sec" onClick={() => { try { localStorage.removeItem(RASCUNHO); } catch { /* ignora */ } setRascunho(null); }}>Descartar</Btn>
            </div>
          </Alerta>
        </div>
      )}

      <Card titulo="1. Veículo e cliente">
        {veiculo ? (
          <div className="stack">
            <div className="row between">
              <div className="row"><Placa placa={veiculo.placa} grande /><div><b>{veiculo.marca} {veiculo.modelo} {veiculo.ano}</b><div className="small muted">{veiculo.motor} · câmbio {veiculo.cambio} · {fmtKm(veiculo.kmAtual)}</div></div></div>
              <Btn variante="ghost" tamanho="sm" onClick={() => set({ veiculoId: undefined })}>Trocar</Btn>
            </div>
            <div className="small">Cliente: <b>{cliente?.nome}</b>{cliente?.telefone ? ` · ${cliente.telefone}` : ''}{cliente?.tipo === 'frota' && <> <Badge tom="muted">Frota</Badge></>}</div>
            {ultimas.length > 0 && <div className="small muted">Últimas visitas: {ultimas.map(o => `${fmtData(o.concluidaEm)} (${fmtKm(o.km)})`).join(' · ')} · <a href={`#/veiculos/${veiculo.id}`}>ver histórico</a></div>}
            {recomendacoesAbertas.length > 0 && <Alerta tipo="info"><b>{recomendacoesAbertas.length} recomendação(ões) da visita anterior para avaliar:</b> {recomendacoesAbertas.map(o => o.recomendacao).join('; ')}</Alerta>}
          </div>
        ) : !f.novo ? (
          <div>
            <Field rotulo="Buscar por placa, nome ou telefone" htmlFor="busca-veic" dica="Digite pelo menos 2 caracteres.">
              <input id="busca-veic" className="input" autoFocus value={f.busca} onChange={e => set({ busca: e.target.value })} placeholder="Ex.: DEM1A23 ou Mariana" autoComplete="off" />
            </Field>
            {resultados.length > 0 && (
              <div className="list" style={{ marginTop: 10 }}>
                {resultados.map(r => (
                  <button key={r.veiculo.id} className="li" onClick={() => set({ veiculoId: r.veiculo.id })}>
                    <Placa placa={r.veiculo.placa} />
                    <div className="grow"><div className="ttl">{r.veiculo.marca} {r.veiculo.modelo}</div><div className="meta">{r.cliente?.nome} · {r.visitas} visita(s)</div></div>
                    <span className="chev">›</span>
                  </button>
                ))}
              </div>
            )}
            {f.busca.length >= 2 && resultados.length === 0 && <p className="small muted" style={{ marginTop: 8 }}>Nenhum veículo encontrado.</p>}
            <div style={{ marginTop: 12 }}><Btn variante="sec" onClick={() => set({ novo: true, placa: placaValida(f.busca) ? normalizarPlaca(f.busca) : '' })}>Cadastrar veículo novo</Btn></div>
          </div>
        ) : (
          <div>
            <div className="grid k2">
              <Field rotulo="Placa" obrigatorio htmlFor="placa" erro={tentou && !placaValida(f.placa) ? 'Placa inválida' : null}>
                <input id="placa" className="input" value={f.placa} maxLength={8} onChange={e => set({ placa: e.target.value.toUpperCase() })} placeholder="ABC1D23" />
              </Field>
              <Field rotulo="Ano" htmlFor="ano"><input id="ano" className="input" inputMode="numeric" value={f.ano} onChange={e => set({ ano: e.target.value.replace(/\D/g, '').slice(0, 4) })} /></Field>
              <Field rotulo="Marca" obrigatorio htmlFor="marca"><input id="marca" className="input" value={f.marca} onChange={e => set({ marca: e.target.value })} /></Field>
              <Field rotulo="Modelo" obrigatorio htmlFor="modelo"><input id="modelo" className="input" value={f.modelo} onChange={e => set({ modelo: e.target.value })} /></Field>
              <Field rotulo="Motor" htmlFor="motor"><input id="motor" className="input" value={f.motor} onChange={e => set({ motor: e.target.value })} placeholder="Ex.: 1.0 TSI" /></Field>
              <Field rotulo="Câmbio"><Segmented rotulo="Câmbio" valor={f.cambio} onChange={v => set({ cambio: v })} opcoes={[{ v: 'manual', r: 'Manual' }, { v: 'automatico', r: 'Automático' }]} /></Field>
              <Field rotulo="Nome do cliente" obrigatorio htmlFor="cli-nome"><input id="cli-nome" className="input" value={f.clienteNome} onChange={e => set({ clienteNome: e.target.value })} /></Field>
              <Field rotulo="Telefone" htmlFor="cli-tel" dica="Opcional"><input id="cli-tel" className="input" inputMode="tel" value={f.clienteTel} onChange={e => set({ clienteTel: e.target.value })} /></Field>
            </div>
            {placaJaExiste && <div style={{ marginTop: 10 }}><Alerta tipo="info">Esta placa já está cadastrada. <Btn variante="ghost" tamanho="sm" onClick={() => set({ novo: false, veiculoId: placaJaExiste.id })}>Usar o cadastro existente</Btn></Alerta></div>}
            <div style={{ marginTop: 10 }}><Btn variante="ghost" tamanho="sm" onClick={() => set({ novo: false })}>‹ Voltar para a busca</Btn></div>
          </div>
        )}
      </Card>

      <Card titulo="2. Serviços vendidos no balcão">
        <div className="grid k2" style={{ gap: 0 }}>
          {SERVICO_KEYS.map(k => (
            <label key={k} className="check">
              <input type="checkbox" checked={!!f.servicos[k]} onChange={e => {
                const s = { ...f.servicos };
                if (e.target.checked) s[k] = {}; else delete s[k];
                set({ servicos: s });
              }} />
              <span>{SERVICOS[k].nome}</span>
            </label>
          ))}
        </div>
        {Object.keys(f.servicos).some(k => SERVICOS[k as ServicoKey].campos.length) && <div className="divider" />}
        {(Object.keys(f.servicos) as ServicoKey[]).filter(k => SERVICOS[k].campos.length).map(k => (
          <div key={k} style={{ marginBottom: 10 }}>
            <div className="small strong" style={{ marginBottom: 4 }}>{SERVICOS[k].nome}</div>
            <div className="row nowrap">
              {SERVICOS[k].campos.map(c => (
                <input key={c} aria-label={`${SERVICOS[k].nome}: ${c}`} className="input" placeholder={{ marca: 'Marca/produto', quantidade: 'Litros', codigo: 'Código' }[c]}
                  value={f.servicos[k]?.[c] || ''} onChange={e => set({ servicos: { ...f.servicos, [k]: { ...f.servicos[k], [c]: e.target.value } } })} />
              ))}
            </div>
          </div>
        ))}
        <div className="divider" />
        <label className="check"><input type="checkbox" checked={f.naoTesteFreio} onChange={e => set({ naoTesteFreio: e.target.checked })} /><span><b>Freio: NÃO FAZER TESTE — SÓ EXECUTAR</b><br /><span className="small muted">Aparece em destaque para o mecânico.</span></span></label>
        <label className="check"><input type="checkbox" checked={f.naoTesteCambio} onChange={e => set({ naoTesteCambio: e.target.checked })} /><span><b>Câmbio: NÃO FAZER TESTE — SÓ EXECUTAR</b></span></label>
      </Card>

      <Card titulo="3. Venda">
        <div className="grid k2">
          <Field rotulo="Valor da venda inicial (R$)" obrigatorio htmlFor="valor" erro={tentou && !(entrada.valorInicial > 0) ? 'Informe o valor' : null}>
            <input id="valor" className="input" inputMode="decimal" value={f.valor} onChange={e => set({ valor: e.target.value.replace(/[^\d,.]/g, '') })} placeholder="0,00" />
          </Field>
          <Field rotulo="Vendedor" obrigatorio htmlFor="vendedor">
            <select id="vendedor" className="input" value={f.vendedorId} onChange={e => set({ vendedorId: e.target.value })}>
              <option value="">Selecione</option>
              {vendedores.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
            </select>
          </Field>
        </div>
      </Card>

      {tentou && erros.length > 0 && <div style={{ marginTop: 12 }}><Alerta tipo="crit"><b>Falta preencher:</b><ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{erros.map(e => <li key={e}>{e}</li>)}</ul></Alerta></div>}
      <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
        <Btn variante="sec" onClick={() => ir('/operacao')}>Cancelar</Btn>
        <Btn carregando={acao.ocupado} onClick={salvar}>Salvar e colocar na fila</Btn>
      </div>
    </div>
  );
}
