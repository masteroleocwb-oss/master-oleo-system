// Editar ou zerar o upsell de uma OS concluída (só a direção). Igual ao "Editar/Zerar upsell" do sistema atual:
// muda o upsell que conta na Volumetria; o faturamento da OS não muda.
import { useState } from 'react';
import { ajustarUpsell, upsellDosItens, valoresOS } from '../data/api';
import type { OrdemServico, Usuario } from '../domain/types';
import { fmtBRL } from '../domain/util';
import { Alerta, Btn, Field, Sheet, useAcao } from '../ui/components';

export function AjustarUpsellSheet({ u, os, zerar, onClose }: { u: Usuario; os: OrdemServico; zerar?: boolean; onClose: () => void }) {
  const acao = useAcao();
  const atual = valoresOS(os);
  const itens = upsellDosItens(os);
  const [valor, setValor] = useState(zerar ? '0' : atual.upsell.toFixed(2).replace('.', ','));
  const [motivo, setMotivo] = useState('');
  const salvar = async (v: string) => {
    const r = await acao.executar(() => ajustarUpsell(u, os.id, v, motivo), `Upsell da OS #${os.numero} ${Number(v.replace(',', '.')) > 0 ? 'atualizado' : 'zerado'}.`);
    if (r !== undefined) onClose();
  };
  return (
    <Sheet titulo={zerar ? `Zerar upsell da OS #${os.numero}?` : `Editar upsell da OS #${os.numero}`}
      sub="Muda o upsell que conta na Volumetria. O faturamento da OS não muda. Fica no histórico com o seu nome."
      onClose={onClose}
      rodape={zerar
        ? <><Btn variante="sec" onClick={onClose}>Voltar</Btn><Btn variante="danger" carregando={acao.ocupado} onClick={() => salvar('0')} data-confirmar-zerar>Zerar upsell</Btn></>
        : <><Btn variante="sec" onClick={onClose}>Voltar</Btn><Btn carregando={acao.ocupado} onClick={() => salvar(valor)} data-salvar-upsell>Salvar</Btn></>}>
      {acao.erro && <div style={{ marginBottom: 10 }}><Alerta tipo="crit">{acao.erro}</Alerta></div>}
      <p className="small" style={{ marginTop: 0 }}>
        Upsell atual: <b>{fmtBRL(atual.upsell)}</b>
        {Math.abs(itens - atual.upsell) >= 0.005 && <span className="muted"> · itens vendidos somam {fmtBRL(itens)}</span>}
      </p>
      {!zerar && (
        <Field rotulo="Valor do upsell (R$)" htmlFor="up-valor">
          <input id="up-valor" className="input" inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)} autoFocus />
        </Field>
      )}
      <Field rotulo="Motivo (opcional)" htmlFor="up-motivo">
        <input id="up-motivo" className="input" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex.: item já estava no orçamento" />
      </Field>
    </Sheet>
  );
}
