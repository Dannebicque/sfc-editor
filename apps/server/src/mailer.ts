export interface Mail { to: string; subject: string; text: string }
export interface Mailer { send(m: Mail): Promise<void> }

/** Développement : écrit le mail sur la sortie standard (contient des liens à usage unique : ne pas l'utiliser en production). */
export class ConsoleMailer implements Mailer {
  async send(m: Mail): Promise<void> { console.log(`\n--- mail à ${m.to} ---\n${m.subject}\n\n${m.text}\n---`); }
}

/** Tests : garde les mails en mémoire. */
export class MemoryMailer implements Mailer {
  sent: Mail[] = [];
  async send(m: Mail): Promise<void> { this.sent.push(m); }
  last(to?: string): Mail | undefined { return [...this.sent].reverse().find((m) => !to || m.to === to); }
}

type Locale = 'fr' | 'en';
const T = {
  verify: { fr: ['Confirmez votre adresse email', 'Bonjour {name},\n\nPour confirmer votre adresse, ouvrez ce lien (valable 24 h) :\n{url}\n\nSi vous n\'avez pas créé de compte, ignorez ce message.'],
            en: ['Confirm your email address', 'Hello {name},\n\nTo confirm your address, open this link (valid for 24 h):\n{url}\n\nIf you did not create an account, ignore this message.'] },
  exists: { fr: ['Vous avez déjà un compte', 'Bonjour,\n\nQuelqu\'un a tenté de créer un compte avec cette adresse, mais un compte existe déjà. Connectez-vous, ou réinitialisez votre mot de passe :\n{url}\n\nSi ce n\'était pas vous, ignorez ce message.'],
            en: ['You already have an account', 'Hello,\n\nSomeone tried to create an account with this address, but one already exists. Sign in, or reset your password:\n{url}\n\nIf this was not you, ignore this message.'] },
  reset: { fr: ['Réinitialisation du mot de passe', 'Bonjour {name},\n\nPour choisir un nouveau mot de passe, ouvrez ce lien (valable 1 h) :\n{url}\n\nSi vous n\'avez rien demandé, ignorez ce message : votre mot de passe reste inchangé.'],
           en: ['Password reset', 'Hello {name},\n\nTo choose a new password, open this link (valid for 1 h):\n{url}\n\nIf you did not ask for this, ignore this message: your password is unchanged.'] },
  invite: { fr: ['{who} vous invite sur un GRAFCET', 'Bonjour,\n\n{who} vous invite à collaborer sur « {project} » (rôle : {role}).\nConnectez-vous (ou créez un compte avec cette adresse) puis ouvrez :\n{url}'],
            en: ['{who} invites you to a GRAFCET', 'Hello,\n\n{who} invites you to collaborate on "{project}" (role: {role}).\nSign in (or create an account with this address), then open:\n{url}'] },
  inactive: { fr: ['Votre compte sera supprimé faute d\'activité', 'Bonjour {name},\n\nVous ne vous êtes pas connecté·e depuis longtemps. Sans connexion de votre part avant le {date}, votre compte et vos projets en ligne seront supprimés définitivement.\nPour le conserver, connectez-vous simplement :\n{url}\n\nPour garder une copie de vos projets, exportez-les avant cette date.'],
              en: ['Your account will be deleted due to inactivity', 'Hello {name},\n\nYou have not signed in for a long time. Unless you sign in before {date}, your account and online projects will be permanently deleted.\nTo keep it, simply sign in:\n{url}\n\nTo keep a copy of your projects, export them before that date.'] },
  classWelcome: { fr: ['{who} vous a créé un compte pour la classe « {class} »', 'Bonjour {name},\n\n{who} vous a inscrit·e à la classe « {class} » sur l\'éditeur GRAFCET. Pour activer votre compte et choisir votre mot de passe, ouvrez ce lien (valable 14 jours) :\n{url}\n\nSi vous ne connaissez pas cette personne, ignorez ce message : sans activation, le compte reste inutilisable.'],
                  en: ['{who} created an account for you in the class "{class}"', 'Hello {name},\n\n{who} enrolled you in the class "{class}" on the GRAFCET editor. To activate your account and choose your password, open this link (valid for 14 days):\n{url}\n\nIf you do not know this person, ignore this message: without activation the account stays unusable.'] },
  classInvite: { fr: ['{who} vous invite dans la classe « {class} »', 'Bonjour,\n\n{who} vous invite à rejoindre la classe « {class} ». Connectez-vous avec cette adresse, puis acceptez l\'invitation :\n{url}\n\nSi vous ne connaissez pas cette personne, ignorez ce message.'],
                 en: ['{who} invites you to the class "{class}"', 'Hello,\n\n{who} invites you to join the class "{class}". Sign in with this address, then accept the invitation:\n{url}\n\nIf you do not know this person, ignore this message.'] },
} as const;

export type MailKind = keyof typeof T;

/** Compose un mail à partir d'un modèle ; les valeurs sont insérées telles quelles (texte brut, jamais du HTML). */
export function compose(kind: MailKind, locale: string, to: string, vars: Record<string, string>): Mail {
  const [subject, text] = T[kind][(locale === 'en' ? 'en' : 'fr') as Locale];
  const fill = (s: string): string => s.replace(/\{(\w+)\}/g, (_, k: string) => (vars[k] ?? '').replace(/[\r\n]+/g, ' '));
  return { to, subject: fill(subject), text: fill(text) };
}

/** Production : SMTP (nodemailer). `url` : `smtps://utilisateur:motdepasse@hote:465`. */
export async function smtpMailer(url: string, from: string): Promise<Mailer> {
  const { createTransport } = await import('nodemailer');
  const transport = createTransport(url);
  return { send: async (m) => { await transport.sendMail({ from, to: m.to, subject: m.subject, text: m.text }); } };
}
