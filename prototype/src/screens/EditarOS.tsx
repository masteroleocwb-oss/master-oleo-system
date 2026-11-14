// Editar OS: o mesmo que o "Editar OS" do sistema atual. Vendedor corrige a OS aberta; a liderança e a
// direção corrigem também a concluída, inclusive lubrificador e horários.
import { useState } from 'react';
import { editarOS, type EdicaoOS } from '../data/api';
import { SERVICOS } from '../domain/catalogo';
import { atendeOS, pode } from '../domain/permissions';
import type { Cambio, OrdemServico, Usuario } from '../domain/types';
import { fmtPlaca, TZ } from '../domain/util';
import { Alerta, Btn, Field, Sheet, useAcao, useDB } from '../ui/components';

// Brasília não tem horário de verão desde 2019: o campo de data e hora é lido como -03:00.
const FMT_LOCAL = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const paraCampo = (iso?: string) => (iso ? FMT_LOCAL.format(new Date(iso)).replace(' ', 'T') : '');
const deCampo = (v: string) => (v ? new Date(`${v}:00-03:00`).toISOString() : undefined);

const ROTULO_CAMPO = { marca: 'Marca', quantidade: 'Quantidade (L)', carter: 'Dentro do câmbio (L)', codigo: 'Código' } as const;

export function EditarOSSheet({ u, os, onClose }: { u: Usuario; os: OrdemServico; onClose: () => void }) {
  const db = useDB();
  const acao = useAcao();
  const v = db.veiculos.find(x => x.id === os.veiculoId)!;
  const cli = db.clientes.find(x => x.id === os.clienteId);
  const concluida = os.status === 'concluido';
  const corrigeExecucao = concluida && pode(u, 'os.editar_concluida');
  const verValores = pode(u, 'os.ver_valores');
  const verContato = pode(u, 'cliente.ver_contato');
  const balcao = os.servicos.filter(s => s.origem === 'balcao' && SERVICOS[s.key].campos.length);

  const [f, setF] = useState({
    nome: cli?.nome || '', telefone: cli?.telefone || '',
    placa: fmtPlaca(v.placa), marca: v.marca || '', modelo: v.modelo || '', motor: v.motor || '', ano: v.ano ? String(v.ano) : '', cambio: v.cambio as Cambio,
    km: os.km != null ? String(os.km) : '', valorInicial: os.valorInicial.toFixed(2).replace('.', ','), obsInterna: os.obsInterna || '',
    mecanicoId: os.mecanicoId || '', inicio: paraCampo(os.iniciadaEm), fim: paraCampo(os.concluidaEm),
  });
  const [serv, setServ] = useState<Record<string, Record<string, string>>>(() =>
    Object.fromEntries(balcao.map(s => [s.key, Object.fromEntries(SERVICOS[s.key].campos.map(c => [c, s[c] || '']))])));
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const lubrificadores = db.usuarios.filter(x => (x.ativo && atendeOS(x)) || x.id === os.mecanicoId).sort((a, b) => a.nome.localeCompare(b.nome));

  const salvar = async () => {
    const e: EdicaoOS = {
      cliente: { nome: f.nome, telefone: verContato ? f.telefone : cli?.telefone || '' },
      veiculo: { placa: f.placa, marca: f.marca, modelo: f.modelo, motor: f.motor, ano: f.ano, cambio: f.cambio },
      km: f.km, obsInterna: f.obsInterna,
      servicos: serv as EdicaoOS['servicos'],
      ...(verValores ? { valorInicial: f.valorInicial } : {}),
      // Horário só vai se mudou (o campo não tem segundos; reenviar igual mudaria os segundos gravados).
      ...(corrigeExecucao ? {
        mecanicoId: f.mecanicoId || undefined,
        ...(f.inicio !== paraCampo(os.iniciadaEm) ? { iniciadaEm: deCampo(f.inicio) } : {}),
        ...(f.fim !== paraCampo(os.concluidaEm) ? { concluidaEm: deCampo(f.fim) } : {}),
      } : {}),
    };
    const r = await acao.executar(() => editarOS(u, os.id, e), `OS #${os.numero} atualizada.`);
    if (r !== undefined) onClose();
  };

  const campo = (k: keyof typeof f, rotulo: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, obrigatorio = false) => (
    <Field rotulo={rotulo} obrigatorio={obrigatorio} htmlFor={`eo-${k}`}>
      <input id={`eo-${k}`} className="input" value={f[k]} onChange={set(k)} {...props} />
    </Field>
  );

  return (
    <Sheet titulo={`Editar OS #${os.numero}`} sub="As mudanças valem para esta OS e ficam registradas no histórico com o seu nome." onClose={onClose}
      rodape={<><Btn variante="sec" onClick={onClose}>Voltar</Btn><Btn carregando={acao.ocupado} onClick={salvar} data-salvar-edicao>Salvar alterações</Btn></>}>
      {acao.erro && <div style={{ marginBottom: 10 }}><Alerta tipo="crit">{acao.erro}</Alerta></div>}
      <div className="section-title" style={{ marginTop: 0 }}>Cliente</div>
      <div className="grid k2">
        {campo('nome', 'Nome', {}, true)}
        {verContato && campo('telefone', 'Telefone', { inputMode: 'tel', placeholder: '(41) 99999-9999' })}
      </div>
      <div className="section-title">Carro</div>
      <div className="grid k2">
        {campo('placa', 'Placa', { autoCapitalize: 'characters' }, true)}
        {campo('ano', 'Ano', { inputMode: 'numeric' })}
        {campo('marca', 'Marca')}
        {campo('modelo', 'Modelo')}
        {campo('motor', 'Motor')}
        <Field rotulo="Câmbio" htmlFor="eo-cambio">
          <select id="eo-cambio" className="input" value={f.cambio} onChange={set('cambio')}><option value="manual">Manual</option><option value="automatico">Automático</option></select>
        </Field>
        {campo('km', 'Quilometragem', { inputMode: 'numeric' })}
      </div>
      {f.placa && v.placa && f.placa.toUpperCase().replace(/[^A-Z0-9]/g, '') !== v.placa.toUpperCase().replace(/[^A-Z0-9]/g, '') && (
        <p className="tiny muted">A OS passa para o carro {fmtPlaca(f.placa)}. As outras visitas de {fmtPlaca(v.placa)} continuam como estão.</p>
      )}
      {balcao.length > 0 && <div className="section-title">Serviços</div>}
      {balcao.map(s => (
        <div key={s.key} style={{ marginBottom: 6 }}>
          <div className="small strong" style={{ marginBottom: 4 }}>{SERVICOS[s.key].nome}</div>
          <div className="grid k2">
            {SERVICOS[s.key].campos.map(c => (
              <Field key={c} rotulo={ROTULO_CAMPO[c]} htmlFor={`eo-${s.key}-${c}`}>
                <input id={`eo-${s.key}-${c}`} className="input" value={serv[s.key]?.[c] ?? ''} onChange={e => setServ({ ...serv, [s.key]: { ...serv[s.key], [c]: e.target.value } })} />
              </Field>
            ))}
          </div>
        </div>
      ))}
      {verValores && <>
        <div className="section-title">Valor</div>
        {campo('valorInicial', 'Valor inicial (R$)', { inputMode: 'decimal' })}
        {concluida && <p className="tiny muted">O valor dos itens vendidos no checklist e na bancada não muda aqui.</p>}
      </>}
      {corrigeExecucao && <>
        <div className="section-title">Execução</div>
        <Field rotulo="Lubrificador" htmlFor="eo-mecanicoId">
          <select id="eo-mecanicoId" className="input" value={f.mecanicoId} onChange={set('mecanicoId')}>
            {lubrificadores.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
        </Field>
        {/* Data e hora um embaixo do outro: lado a lado não cabe no celular. */}
        {campo('inicio', 'Início', { type: 'datetime-local', style: { minWidth: 0 } })}
        {campo('fim', 'Fim', { type: 'datetime-local', style: { minWidth: 0 } })}
      </>}
      <Field rotulo="Observação interna" htmlFor="eo-obsInterna"><textarea id="eo-obsInterna" className="input" value={f.obsInterna} onChange={set('obsInterna')} /></Field>
    </Sheet>
  );
}
