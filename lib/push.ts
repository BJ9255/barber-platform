import webpush from 'web-push';
import prisma from '@/lib/prisma';

type Subscription = { id: string; endpoint: string; p256dh: string; auth: string };
export type PushPayload = { title: string; body: string; url?: string };

let configured = false;

// Les notifications sont facultatives : sans clés VAPID, le site fonctionne, simplement sans push.
function configure() {
    if (configured) return true;
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    if (!publicKey || !privateKey) return false;
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:contact@lagrobarber.fr', publicKey, privateKey);
    configured = true;
    return true;
}

// Un abonnement envoyé par le navigateur, revérifié côté serveur
export function parseSubscription(input: unknown) {
    const sub = input as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
    const endpoint = sub?.endpoint;
    const p256dh = sub?.keys?.p256dh;
    const auth = sub?.keys?.auth;
    if (typeof endpoint !== 'string' || typeof p256dh !== 'string' || typeof auth !== 'string') return null;
    if (!endpoint.startsWith('https://') || endpoint.length > 1000 || p256dh.length > 200 || auth.length > 100) return null;
    return { endpoint, p256dh, auth };
}

export async function sendPush(subs: Subscription[], payload: PushPayload) {
    if (!configure() || subs.length === 0) return;
    await Promise.all(subs.map(async sub => {
        try {
            await webpush.sendNotification(
                { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                JSON.stringify(payload),
                { TTL: 60 * 60 * 12 },
            );
        } catch (error) {
            // 404 / 410 : le téléphone s'est désabonné ou l'app a été supprimée
            const status = (error as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) {
                await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
            } else {
                console.error('Push failed:', error);
            }
        }
    }));
}

export async function notifyBarber(payload: PushPayload) {
    const subs = await prisma.pushSubscription.findMany({ where: { role: 'admin' } });
    await sendPush(subs, payload);
}

// Le serveur tourne en UTC : on affiche toujours l'heure de Paris dans les notifications
export function formatParis(date: Date, options: Intl.DateTimeFormatOptions) {
    return new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', ...options }).format(date);
}
