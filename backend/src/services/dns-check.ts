// Vérification réelle des enregistrements DNS d'authentification du domaine d'expédition.
import { promises as dns } from 'node:dns';

export interface DomainCheck { checkedAt: string; domain: string; spf: boolean; dkim: boolean; dmarc: boolean; details: Record<string, string> }

async function txt(name: string): Promise<string[] | { error: string }> {
  try {
    const recs = await dns.resolveTxt(name);
    return recs.map((r) => r.join(''));
  } catch (e: any) {
    return { error: e?.code === 'ENODATA' || e?.code === 'ENOTFOUND' ? 'aucun enregistrement' : `résolution impossible (${e?.code ?? e?.message})` };
  }
}

export async function checkDomain(fromEmail: string, dkimSelector: string): Promise<DomainCheck> {
  const domain = fromEmail.split('@')[1]?.toLowerCase() ?? '';
  const details: Record<string, string> = {};
  const spfRes = await txt(domain);
  let spf = false;
  if (Array.isArray(spfRes)) {
    const recs = spfRes.filter((r) => r.toLowerCase().startsWith('v=spf1'));
    spf = recs.length === 1;
    details.spf = recs.length === 0 ? 'Aucun enregistrement SPF trouvé.' : recs.length > 1 ? `Plusieurs enregistrements SPF (invalide) : ${recs.join(' | ')}` : recs[0];
  } else details.spf = spfRes.error;

  const dmarcRes = await txt(`_dmarc.${domain}`);
  let dmarc = false;
  if (Array.isArray(dmarcRes)) {
    const rec = dmarcRes.find((r) => r.toUpperCase().startsWith('V=DMARC1'));
    dmarc = Boolean(rec); details.dmarc = rec ?? 'Aucun enregistrement DMARC trouvé.';
  } else details.dmarc = dmarcRes.error;

  let dkim = false;
  if (!dkimSelector) details.dkim = 'Sélecteur DKIM non renseigné (fourni par votre relais SMTP).';
  else {
    const dk = await txt(`${dkimSelector}._domainkey.${domain}`);
    if (Array.isArray(dk)) {
      const rec = dk.find((r) => /p=/.test(r));
      dkim = Boolean(rec); details.dkim = rec ? `${rec.slice(0, 80)}…` : 'Enregistrement trouvé mais sans clé publique (p=).';
    } else details.dkim = dk.error;
  }
  return { checkedAt: new Date().toISOString(), domain, spf, dkim, dmarc, details };
}
