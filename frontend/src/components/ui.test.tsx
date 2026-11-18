import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Badge, EmptyState, Modal, Pagination } from './ui';
import { SafeMarkdown } from '../pages/public/PublicPages';
import { utcToZoned, zonedToUtc } from '../services/format';
import { Users } from 'lucide-react';
import { renderEmail, createBlock, DEFAULT_SETTINGS } from '@shared/index';

describe('Composants', () => {
  it('affiche le libellé français des statuts', () => {
    render(<Badge status="pending" />);
    expect(screen.getByText('En attente de confirmation')).toBeInTheDocument();
  });

  it('affiche un état vide explicatif', () => {
    render(<EmptyState icon={Users} title="Aucun abonné">Explication</EmptyState>);
    expect(screen.getByRole('heading', { name: 'Aucun abonné' })).toBeInTheDocument();
  });

  it('dialogue accessible : rôle, titre, fermeture par Échap', () => {
    let closed = false;
    render(<Modal open title="Confirmer" onClose={() => { closed = true; }}>Contenu</Modal>);
    expect(screen.getByRole('dialog', { name: 'Confirmer' })).toHaveAttribute('aria-modal', 'true');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(closed).toBe(true);
  });

  it('pagination : bornes respectées', () => {
    render(<MemoryRouter><Pagination page={1} pageSize={25} total={60} onPage={() => {}} /></MemoryRouter>);
    expect(screen.getByText('1–25 sur 60')).toBeInTheDocument();
    expect(screen.getByLabelText('Page précédente')).toBeDisabled();
  });

  it('le Markdown de la politique n\'interprète jamais de HTML ni de lien javascript:', () => {
    const { container } = render(<SafeMarkdown source={'# Titre\n\n<img src=x onerror=alert(1)> [x](javascript:alert(1)) **gras**'} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('strong')?.textContent).toBe('gras');
  });
});

describe('Fuseaux horaires', () => {
  it('convertit 7 h à Paris en UTC, en hiver et en été', () => {
    expect(zonedToUtc('2026-12-01', '07:00', 'Europe/Paris').toISOString()).toBe('2026-12-01T06:00:00.000Z');
    expect(zonedToUtc('2026-07-01', '07:00', 'Europe/Paris').toISOString()).toBe('2026-07-01T05:00:00.000Z');
    expect(utcToZoned('2026-07-01T05:00:00.000Z', 'Europe/Paris')).toEqual({ date: '2026-07-01', time: '07:00' });
  });
});

describe('Aperçu e-mail', () => {
  it('les données d\'exemple remplacent {{prenom}}', () => {
    const t = createBlock('text'); t.props.text = 'Bonjour {{prenom}},';
    const r = renderEmail({ settings: { ...DEFAULT_SETTINGS }, blocks: [t] }, { subject: 's', sampleData: true, unsubscribeUrl: '#', privacyUrl: '#', legalText: 'L' });
    expect(r.text).toContain('Bonjour Marie,');
  });
});
