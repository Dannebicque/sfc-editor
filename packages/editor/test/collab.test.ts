import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { applyLang } from '../src/i18n';
import { parseHash, wsUrl } from '../src/api';
import { colorOf, initials } from '../src/stores/collab';
import { useProjectStore } from '../src/stores/project';

beforeEach(() => { localStorage.clear(); applyLang('fr'); setActivePinia(createPinia()); });
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

describe('projet en ligne', () => {
  it('n\'écrit jamais le projet en ligne dans le stockage local et rend le projet local en le quittant', async () => {
    const p = useProjectStore();
    p.renameProject('Mon projet local');
    await new Promise((r) => setTimeout(r, 500));
    const saved = localStorage.getItem('grafcet-studio-v1');
    const remote = clone(p.project); remote.name = 'Projet du serveur';
    p.enterOnline(remote, false);
    p.renameProject('Modifié en ligne');
    await new Promise((r) => setTimeout(r, 500));
    expect(localStorage.getItem('grafcet-studio-v1')).toBe(saved);
    p.leaveOnline();
    expect(p.project.name).toBe('Mon projet local');
    expect(p.online).toBe(false);
  });
  it('en lecture seule, aucune modification n\'est appliquée', () => {
    const p = useProjectStore();
    p.enterOnline(clone(p.project), true);
    const before = JSON.stringify(p.project);
    p.renameProject('Tentative');
    p.addGrafcet();
    expect(JSON.stringify(p.project)).toBe(before);
    expect(p.past.length).toBe(0);
  });
  it('annuler ne défait que mes modifications : le travail reçu des autres est conservé', () => {
    const p = useProjectStore();
    p.enterOnline(clone(p.project), false);
    const a = p.project.grafcets[0]!.id, b = p.project.grafcets[1]!.id;
    p.activeId = a;
    p.renameGrafcet('Renommé par moi');
    // Un autre éditeur modifie un autre GRAFCET.
    const remote = clone(p.project); remote.grafcets.find((g) => g.id === b)!.name = 'Renommé par un autre';
    p.applyRemote(remote);
    p.undo();
    expect(p.project.grafcets.find((g) => g.id === a)!.name).not.toBe('Renommé par moi');
    expect(p.project.grafcets.find((g) => g.id === b)!.name).toBe('Renommé par un autre');
  });
  it('en ligne, un nouveau GRAFCET reçoit un identifiant sans collision possible entre deux clients', () => {
    const p = useProjectStore();
    p.enterOnline(clone(p.project), false);
    const id = p.addGrafcet();
    expect(id).toMatch(/^g\d+-[a-z0-9]+$/);
    expect(p.project.grafcets.some((g) => g.id === id)).toBe(true);
  });
  it('applique une mise à jour distante sans créer d\'entrée d\'historique', () => {
    const p = useProjectStore();
    p.enterOnline(clone(p.project), false);
    const remote = clone(p.project); remote.name = 'Distant';
    p.applyRemote(remote);
    expect(p.project.name).toBe('Distant');
    expect(p.past.length).toBe(0);
  });
});

describe('aides de l\'interface', () => {
  it('lit les routes du fragment d\'adresse', () => {
    expect(parseHash('#/verify/abcdefghij1234')).toEqual({ kind: 'verify', token: 'abcdefghij1234' });
    expect(parseHash('#/reset/abcdefghij1234')).toEqual({ kind: 'reset', token: 'abcdefghij1234' });
    expect(parseHash('#/invitations')).toEqual({ kind: 'invitations' });
    expect(parseHash('#/p/' + 'a'.repeat(22))).toEqual({ kind: 'project', id: 'a'.repeat(22) });
    expect(parseHash('#/p/court')).toBeNull();
    expect(parseHash('#/s/' + 'a'.repeat(22))).toBeNull();
  });
  it('construit l\'adresse WebSocket depuis la page (http → ws, https → wss)', () => {
    expect(wsUrl('X', { protocol: 'http:', host: 'localhost:5173' })).toBe('ws://localhost:5173/ws/projects/X');
    expect(wsUrl('X', { protocol: 'https:', host: 'app.example.org' })).toBe('wss://app.example.org/ws/projects/X');
  });
  it('donne une couleur stable et des initiales', () => {
    expect(colorOf('u1')).toBe(colorOf('u1'));
    expect(initials('Alice Martin Dupont')).toBe('AM');
    expect(initials('  ')).toBe('?');
  });
});
