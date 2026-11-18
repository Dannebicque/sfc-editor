import { FREE_ONLINE_PROJECTS, GUEST_LIMITS } from '../../../packages/editor/src/limits-config';

export type Lang = 'fr' | 'en';

export interface Content {
  htmlLang: Lang;
  path: string;
  altPath: string;
  title: string;
  description: string;
  skip: string;
  brandTag: string;
  nav: { features: string; plans: string; faq: string };
  langSwitch: { label: string; text: string; title: string };
  cta: { try: string; resume: string; account: string };
  hero: { kicker: string; title: string; lead: string; note: string; figure: string };
  preview: { title: string; alt: string };
  features: { title: string; lead: string; items: { title: string; text: string }[] };
  audience: { title: string; items: { title: string; text: string }[] };
  plans: {
    title: string; lead: string;
    items: { id: string; name: string; tag: string; text: string; points: string[]; cta?: string; href?: string }[];
    foot: string;
    waitlist: { title: string; email: string; kind: string; kinds: { teacher: string; school: string; other: string }; consent: string; submit: string; ok: string; invalid: string; error: string; rate: string };
  };
  faq: { title: string; items: { q: string; a: string }[] };
  final: { title: string; text: string };
  footer: { license: string; legal: string; privacy: string; terms: string };
}

const L = GUEST_LIMITS;
const P = FREE_ONLINE_PROJECTS;

export const CONTENT: Record<Lang, Content> = {
  fr: {
    htmlLang: 'fr',
    path: '/',
    altPath: '/en/',
    title: 'SFC Editor — éditeur GRAFCET (IEC 60848) dans le navigateur',
    description: 'Dessinez, validez et simulez vos GRAFCET dans le navigateur : construction guidée, validation continue, simulation, export PLCopen. Essai gratuit sans compte.',
    skip: 'Aller au contenu',
    brandTag: 'GRAFCET · IEC 60848',
    nav: { features: 'Fonctionnalités', plans: 'Formules', faq: 'Questions' },
    langSwitch: { label: 'English', text: 'EN', title: 'Read this page in English' },
    cta: { try: 'Essayer sans compte', resume: 'Reprendre mon projet', account: 'Créer un compte gratuit' },
    hero: {
      kicker: 'Éditeur GRAFCET / SFC',
      title: 'Dessinez des GRAFCET justes, du premier coup.',
      lead: 'L’éditeur ne vous propose que ce qui est valide : étapes, transitions, divergences, renvois. Il vérifie en continu, simule le franchissement et exporte vers vos outils.',
      note: 'Aucune installation, aucun compte : vos projets restent dans votre navigateur.',
      figure: 'Exemple de GRAFCET : une étape initiale, une transition, une étape, puis une divergence en ET vers deux branches parallèles qui se rejoignent.',
    },
    preview: { title: 'L’éditeur en un coup d’œil', alt: 'Capture de l’éditeur : liste des GRAFCET à gauche, dessin d’une station de tri au centre, propriétés de l’étape sélectionnée à droite, barre d’outils contextuelle en bas.' },
    features: {
      title: 'Tout ce qu’il faut pour un GRAFCET propre',
      lead: 'Conçu par un enseignant, pour les élèves, les enseignants et les automaticiens.',
      items: [
        { title: 'Construction guidée', text: 'Le curseur ne propose que les insertions possibles. Impossible de produire un graphe structurellement faux.' },
        { title: 'Validation continue', text: 'Règles de la norme vérifiées pendant que vous dessinez : chaque anomalie est localisée et expliquée.' },
        { title: 'Simulation à jetons', text: 'Marquage, transitions validables, franchissement, forçages : voyez votre GRAFCET vivre avant de le programmer.' },
        { title: 'Accessible', text: 'Entièrement utilisable au clavier et avec un lecteur d’écran, thèmes clair et sombre, contrastes soignés.' },
        { title: 'Interopérable', text: 'Import et export du XML de SFCEdit et de PLCopen XML, images SVG, PNG et PDF, JSON natif.' },
        { title: 'Local et hors ligne', text: 'Application web installable, utilisable sans réseau. Interface en français et en anglais.' },
      ],
    },
    audience: {
      title: 'Pour qui ?',
      items: [
        { title: 'Enseignants', text: 'Préparez des sujets, corrigez, projetez : un outil moderne pour remplacer SFCEdit, sans installation en salle.' },
        { title: 'Élèves et étudiants', text: 'Un éditeur qui guide et qui explique les erreurs, pour apprendre la norme en construisant.' },
        { title: 'Automaticiens', text: 'Documentez vos séquences et exportez-les en PLCopen XML pour vos environnements de programmation.' },
      ],
    },
    plans: {
      title: 'Commencez sans compte, continuez quand vous voulez',
      lead: 'L’essai est immédiat. Le compte, gratuit, débloque le travail en ligne et à plusieurs.',
      items: [
        {
          id: 'trial', name: 'Essai', tag: 'Sans compte',
          text: 'Pour découvrir l’éditeur en deux minutes.',
          points: [
            `Jusqu’à ${L.grafcets} GRAFCET par projet`,
            `Jusqu’à ${L.steps} étapes par GRAFCET`,
            'Validation et simulation complètes',
            'Export JSON natif, images SVG et PNG, PDF',
            'Projets conservés dans votre navigateur',
          ],
          cta: 'Essayer maintenant', href: '/app/',
        },
        {
          id: 'free', name: 'Compte gratuit', tag: 'Recommandé',
          text: 'Pour travailler sérieusement et à plusieurs.',
          points: [
            'Pas de limite d’essai : autant de GRAFCET et d’étapes que nécessaire',
            `Jusqu’à ${P} projets en ligne, accessibles depuis tous vos appareils`,
            'Export SFCEdit, PLCopen XML et archive ZIP',
          ],
          cta: 'Créer un compte', href: '/app/#/register',
        },
        {
          id: 'paid', name: 'Classe et établissement', tag: 'Bientôt',
          text: 'Pour les enseignants et les établissements. Pistes envisagées, forfait annuel par classe ou par établissement (tarifs à venir) :',
          points: ['Co-édition en temps réel, rôles et invitations', 'Espaces de classe et comptes élèves créés en masse', 'Rendu et correction de TP', 'Connexion par l’ENT ou l’annuaire de l’établissement (SSO)', 'Hébergement garanti et support'],
        },
      ],
      foot: 'Le contenu de l’offre payante n’est pas arrêté : l’édition et les fonctions gratuites décrites ci-dessus le resteront.',
      waitlist: {
        title: 'Être prévenu·e de l’ouverture', email: 'Adresse email', kind: 'Vous êtes',
        kinds: { teacher: 'Enseignant·e', school: 'Établissement', other: 'Autre' },
        consent: 'J’accepte d’être contacté·e à cette adresse, uniquement pour l’ouverture de cette offre. Conservation 24 mois au plus ; suppression sur simple demande.',
        submit: 'Me prévenir', ok: 'Merci, c’est noté. Vous ne recevrez rien d’autre que l’annonce de l’ouverture.',
        invalid: 'Vérifiez l’adresse email et cochez la case d’accord.', error: 'Le service est indisponible pour le moment. Réessayez plus tard.', rate: 'Trop de demandes. Réessayez plus tard.',
      },
    },
    faq: {
      title: 'Questions fréquentes',
      items: [
        { q: 'Est-ce vraiment gratuit ?', a: 'Oui : l’essai sans compte et le compte gratuit n’ont pas de limite de durée. Une offre payante viendra plus tard pour les classes et les établissements.' },
        { q: 'Où sont stockés mes projets ?', a: 'Sans compte, uniquement dans votre navigateur : rien n’est envoyé à un serveur. Avec un compte, vos projets en ligne sont enregistrés sur le serveur ; vous pouvez les exporter ou supprimer votre compte à tout moment.' },
        { q: 'Puis-je reprendre mes fichiers SFCEdit ?', a: 'Oui, l’éditeur importe et exporte le XML de SFCEdit (avec compte pour l’export). Les anciens fichiers sont migrés à l’ouverture et un rapport signale ce qui n’a pas pu être repris tel quel.' },
        { q: 'Que se passe-t-il quand j’atteins les limites de l’essai ?', a: 'Rien n’est perdu ni supprimé : l’éditeur refuse seulement d’ajouter au-delà de la limite et vous propose de créer un compte.' },
        { q: 'Le code est-il ouvert ?', a: 'Oui, sous licence Mozilla Public License 2.0.' },
      ],
    },
    final: { title: 'Prêt à dessiner votre premier GRAFCET ?', text: 'Ouvrez l’éditeur : un exemple est déjà chargé pour explorer.' },
    footer: { license: 'Code sous licence MPL-2.0', legal: 'Mentions légales', privacy: 'Confidentialité', terms: 'Conditions d’utilisation' },
  },
  en: {
    htmlLang: 'en',
    path: '/en/',
    altPath: '/',
    title: 'SFC Editor — GRAFCET (IEC 60848) editor in your browser',
    description: 'Draw, validate and simulate GRAFCET in your browser: guided construction, continuous validation, simulation, PLCopen export. Free trial, no account needed.',
    skip: 'Skip to content',
    brandTag: 'GRAFCET · IEC 60848',
    nav: { features: 'Features', plans: 'Plans', faq: 'FAQ' },
    langSwitch: { label: 'Français', text: 'FR', title: 'Lire cette page en français' },
    cta: { try: 'Try it without an account', resume: 'Resume my project', account: 'Create a free account' },
    hero: {
      kicker: 'GRAFCET / SFC editor',
      title: 'Draw correct GRAFCET, first time.',
      lead: 'The editor only offers what is valid: steps, transitions, divergences, jumps. It checks as you go, simulates firing and exports to your tools.',
      note: 'No installation, no account: your projects stay in your browser.',
      figure: 'Example GRAFCET: an initial step, a transition, a step, then an AND divergence into two parallel branches that join again.',
    },
    preview: { title: 'The editor at a glance', alt: 'Screenshot of the editor: GRAFCET list on the left, a sorting-station drawing in the centre, properties of the selected step on the right, a contextual toolbar at the bottom.' },
    features: {
      title: 'Everything for a clean GRAFCET',
      lead: 'Built by a teacher, for students, teachers and automation engineers.',
      items: [
        { title: 'Guided construction', text: 'The cursor only offers possible insertions. You cannot produce a structurally wrong graph.' },
        { title: 'Continuous validation', text: 'Standard rules are checked while you draw: every issue is located and explained.' },
        { title: 'Token simulation', text: 'Marking, enabled transitions, firing, forcing orders: watch your GRAFCET run before you program it.' },
        { title: 'Accessible', text: 'Fully usable with a keyboard and a screen reader, light and dark themes, careful contrast.' },
        { title: 'Interoperable', text: 'Import and export SFCEdit XML and PLCopen XML, SVG, PNG and PDF images, native JSON.' },
        { title: 'Local and offline', text: 'Installable web app that works without a network. Interface in French and English.' },
      ],
    },
    audience: {
      title: 'Who is it for?',
      items: [
        { title: 'Teachers', text: 'Prepare exercises, mark, present: a modern replacement for SFCEdit, with nothing to install in the classroom.' },
        { title: 'Students', text: 'An editor that guides you and explains errors, so you learn the standard by building.' },
        { title: 'Automation engineers', text: 'Document your sequences and export them as PLCopen XML for your programming environments.' },
      ],
    },
    plans: {
      title: 'Start without an account, continue when you want',
      lead: 'The trial is instant. The free account unlocks online and collaborative work.',
      items: [
        {
          id: 'trial', name: 'Trial', tag: 'No account',
          text: 'To discover the editor in two minutes.',
          points: [
            `Up to ${L.grafcets} GRAFCETs per project`,
            `Up to ${L.steps} steps per GRAFCET`,
            'Full validation and simulation',
            'Native JSON, SVG and PNG images, PDF export',
            'Projects kept in your browser',
          ],
          cta: 'Try it now', href: '/app/',
        },
        {
          id: 'free', name: 'Free account', tag: 'Recommended',
          text: 'To work seriously and with others.',
          points: [
            'No trial limits: as many GRAFCETs and steps as you need',
            `Up to ${P} online projects, available on all your devices`,
            'SFCEdit and PLCopen XML export, ZIP archive',
          ],
          cta: 'Create an account', href: '/app/#/register',
        },
        {
          id: 'paid', name: 'Classroom and school', tag: 'Coming soon',
          text: 'For teachers and schools. Ideas under consideration, yearly flat fee per class or per school (prices to come):',
          points: ['Real-time co-editing, roles and invitations', 'Class spaces and student accounts created in bulk', 'Assignment hand-in and marking', 'Sign-in through the school’s SSO', 'Guaranteed hosting and support'],
        },
      ],
      foot: 'The content of the paid plan is not settled: editing and the free features described above will stay free.',
      waitlist: {
        title: 'Get notified when it opens', email: 'Email address', kind: 'You are',
        kinds: { teacher: 'A teacher', school: 'A school', other: 'Other' },
        consent: 'I agree to be contacted at this address, only about this plan opening. Kept 24 months at most; deleted on simple request.',
        submit: 'Notify me', ok: 'Thanks, noted. You will receive nothing but the announcement of the opening.',
        invalid: 'Check the email address and tick the consent box.', error: 'The service is unavailable right now. Please try again later.', rate: 'Too many requests. Please try again later.',
      },
    },
    faq: {
      title: 'Frequently asked questions',
      items: [
        { q: 'Is it really free?', a: 'Yes: the no-account trial and the free account have no time limit. A paid plan will come later for classes and schools.' },
        { q: 'Where are my projects stored?', a: 'Without an account, only in your browser: nothing is sent to a server. With an account, your online projects are saved on the server; you can export them or delete your account at any time.' },
        { q: 'Can I reuse my SFCEdit files?', a: 'Yes, the editor imports and exports SFCEdit XML (export needs an account). Older files are migrated when opened, and a report lists anything that could not be kept as is.' },
        { q: 'What happens when I reach the trial limits?', a: 'Nothing is lost or deleted: the editor only refuses to add beyond the limit and offers you to create an account.' },
        { q: 'Is the code open?', a: 'Yes, under the Mozilla Public License 2.0.' },
      ],
    },
    final: { title: 'Ready to draw your first GRAFCET?', text: 'Open the editor: an example is already loaded for you to explore.' },
    footer: { license: 'Code under MPL-2.0 licence', legal: 'Legal notice', privacy: 'Privacy', terms: 'Terms of use' },
  },
};
