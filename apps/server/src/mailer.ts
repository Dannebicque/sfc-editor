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
