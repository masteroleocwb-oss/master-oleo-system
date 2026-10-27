import { useEffect, useRef, useState } from 'react';
import { obterRelatorioPublico, type ResultadoPublico } from '../data/api';
import { ESTADOS, ORIGEM_LABEL } from '../domain/catalogo';
import type { EstadoItem } from '../domain/types';
import { fmtData, fmtDataHora, fmtKm } from '../domain/util';
import { Badge, Btn } from '../ui/components';

const ORDEM: EstadoItem[] = ['prioritario', 'atencao', 'pendente_avaliacao', 'ok', 'nao_aplicavel'];

/** Página pública do cliente. Só usa a projeção do relatório: nenhum outro dado chega aqui. */
export function RelatorioPublico({ token }: { token: string }) {
  const [r, setR] = useState<ResultadoPublico | null>(null);
  const carregado = useRef<string | null>(null);
  useEffect(() => {
    // Conta um acesso por abertura (o modo estrito do React roda o efeito duas vezes em desenvolvimento).
    if (carregado.current === token) return;
    carregado.current = token;
    setR(obterRelatorioPublico(token));
    document.title = 'Relatório do seu veículo · Master Óleo';
  }, [token]);
  if (!r) return null;

  if (r.estado !== 'ok') {
    // Mesma mensagem para link inválido, expirado ou revogado: não revela se o link existiu.
    return (
      <div className="rel">
        <div className="rel-head"><img src="./brand/logo-master-oleo.png" alt="Master Óleo" /></div>
        <div className="card" style={{ marginTop: 24, textAlign: 'center', padding: 32 }} data-estado-link="indisponivel">
          <h1 style={{ marginBottom: 8 }}>Este link não está disponível</h1>
          <p className="muted">O link pode ter expirado ou sido substituído. Fale com a equipe da Master Óleo para receber um novo relatório.</p>
        </div>
      </div>
    );
  }

  const rel = r.relatorio;
  const recomendacoes = rel.itens.filter(i => i.estado === 'prioritario' || i.estado === 'atencao').sort((a, b) => ORDEM.indexOf(a.estado) - ORDEM.indexOf(b.estado));
  const pendentes = rel.itens.filter(i => i.estado === 'pendente_avaliacao');
  const ok = rel.itens.filter(i => i.estado === 'ok');
  const fotosDe = (nome: string) => rel.fotos.filter(f => f.item === nome);

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <div className="rel-head">
        <img src="./brand/logo-master-oleo.png" alt="Master Óleo" />
        <Btn variante="sec" tamanho="sm" className="no-print" onClick={() => window.print()}>Salvar / imprimir</Btn>
      </div>
      <div className="rel" data-estado-link="ok">
        <div style={{ margin: '20px 0 16px' }}>
          <p className="muted small">Relatório da revisão · OS {rel.numero}</p>
          <h1>Olá{rel.clientePrimeiroNome ? `, ${rel.clientePrimeiroNome}` : ''}! Veja como está o seu {rel.veiculo.modelo}.</h1>
          <div className="row" style={{ marginTop: 10 }}>
            <span className="plate">{rel.veiculo.placa}</span>
            <span className="small">{rel.veiculo.marca} {rel.veiculo.modelo} {rel.veiculo.ano} · {rel.veiculo.motor}</span>
          </div>
          <p className="small muted" style={{ marginTop: 6 }}>{fmtData(rel.data)} · {fmtKm(rel.km)} · Técnico responsável: {rel.tecnico}</p>
          {rel.atualizadoEm && <div className="alert-box info" style={{ marginTop: 10 }}><span className="ic">i</span><div>Este relatório foi atualizado em {fmtDataHora(rel.atualizadoEm)} após uma revisão da nossa equipe.</div></div>}
          {rel.checklistStatus === 'excecao_autorizada' && <div className="alert-box warn" style={{ marginTop: 10 }}><span className="ic">!</span><div>Nem todos os itens puderam ser inspecionados nesta visita. Os itens não avaliados não aparecem como “em bom estado”.</div></div>}
        </div>

        <div className="grid k3" style={{ marginBottom: 16 }}>
          <div className="kpi"><div className="lbl">Itens inspecionados</div><div className="val">{rel.itens.length}</div></div>
          <div className="kpi"><div className="lbl">Com recomendação</div><div className="val" style={{ color: recomendacoes.length ? 'var(--warn)' : undefined }}>{recomendacoes.length}</div></div>
          <div className="kpi"><div className="lbl">Em bom estado</div><div className="val" style={{ color: 'var(--ok)' }}>{ok.length}</div></div>
        </div>

        {rel.observacao && <section className="card" style={{ marginBottom: 12 }}><h2 style={{ marginBottom: 6 }}>Recado da equipe</h2><p>{rel.observacao}</p></section>}

        {recomendacoes.length > 0 && (
          <section className="card" style={{ marginBottom: 12 }}>
            <h2 style={{ marginBottom: 6 }}>Nossas recomendações</h2>
            {recomendacoes.map(i => (
              <div key={i.nome} className="rel-item">
                <div className="grow">
                  <div className="row between"><b>{i.nome}</b><Badge tom={i.estado === 'prioritario' ? 'critico' : 'atencao'} icone={ESTADOS[i.estado].icone}>{ESTADOS[i.estado].cliente}</Badge></div>
                  {i.recomendacao && <p className="small" style={{ marginTop: 4 }}>{i.recomendacao}</p>}
                  {fotosDe(i.nome).length > 0 && (
                    <div className="gallery" style={{ marginTop: 8 }}>
                      {fotosDe(i.nome).map((f, k) => <figure key={k}><img src={f.url} alt={f.legenda || i.nome} /><figcaption>{f.legenda}{f.demo ? ' · imagem demonstrativa' : ''}</figcaption></figure>)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </section>
        )}

        {pendentes.length > 0 && (
          <section className="card" style={{ marginBottom: 12 }}>
            <h2 style={{ marginBottom: 6 }}>Para avaliar na próxima visita</h2>
            {pendentes.map(i => <div key={i.nome} className="rel-item"><span aria-hidden>?</span><div>{i.nome}</div></div>)}
          </section>
        )}

        <section className="card" style={{ marginBottom: 12 }}>
          <h2 style={{ marginBottom: 6 }}>Serviços realizados</h2>
          {rel.servicos.map(s => <div key={s.nome} className="rel-item"><span style={{ color: 'var(--ok)', fontWeight: 800 }} aria-hidden>✓</span><div><b>{s.nome}</b>{s.detalhe && <div className="small muted">{s.detalhe}</div>}</div></div>)}
        </section>

        {ok.length > 0 && (
          <section className="card" style={{ marginBottom: 12 }}>
            <h2 style={{ marginBottom: 6 }}>Itens em bom estado</h2>
            <div className="row" style={{ gap: 6 }}>{ok.map(i => <Badge key={i.nome} tom="ok" icone="✓">{i.nome}</Badge>)}</div>
          </section>
        )}

        {rel.proximas.length > 0 && (
          <section className="card" style={{ marginBottom: 12 }}>
            <h2 style={{ marginBottom: 6 }}>Próximas manutenções</h2>
            {rel.proximas.map(p => (
              <div key={p.descricao} className="rel-item">
                <div className="grow">
                  <b>{p.descricao}</b>
                  <div className="small">{p.kmPrevisto || p.dataPrevista ? `Previsto: ${[p.kmPrevisto ? fmtKm(p.kmPrevisto) : null, p.dataPrevista ? fmtData(p.dataPrevista) : null].filter(Boolean).join(' ou ')}, o que vier primeiro` : 'Acompanhar na próxima visita'}</div>
                  <div className="tiny muted">{ORIGEM_LABEL[p.origem].cliente}</div>
                </div>
              </div>
            ))}
            <p className="tiny muted" style={{ marginTop: 8 }}>Os prazos são orientativos. Siga também o manual do seu veículo.</p>
          </section>
        )}

        <p className="tiny muted" style={{ textAlign: 'center', marginTop: 20 }}>Master Óleo · Relatório gerado pela equipe técnica. Este link é pessoal; não compartilhe se não quiser que outras pessoas vejam as informações do seu veículo.</p>
      </div>
    </div>
  );
}
