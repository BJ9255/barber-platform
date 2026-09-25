import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isAdmin, unauthorized } from '@/lib/auth';
import { parseSubscription, sendPush } from '@/lib/push';

export const dynamic = 'force-dynamic';

// Le coiffeur active les notifications sur son téléphone
export async function POST(request: Request) {
    if (!(await isAdmin())) return unauthorized();

    const { subscription } = await request.json().catch(() => ({}));
    const sub = parseSubscription(subscription);
    if (!sub) {
        return NextResponse.json({ error: 'Abonnement invalide' }, { status: 400 });
    }

    try {
        // slotId est vide pour le coiffeur : Postgres ne considère pas deux NULL comme égaux,
        // donc on évite les doublons à la main plutôt qu'avec la contrainte unique.
        const existing = await prisma.pushSubscription.findFirst({ where: { endpoint: sub.endpoint, role: 'admin' } });
        const saved = existing
            ? await prisma.pushSubscription.update({ where: { id: existing.id }, data: { p256dh: sub.p256dh, auth: sub.auth } })
            : await prisma.pushSubscription.create({ data: { ...sub, role: 'admin' } });

        await sendPush([saved], {
            title: 'Notifications activées',
            body: 'Tu seras prévenu à chaque réservation et annulation.',
            url: '/admin',
        });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error saving admin subscription:', error);
        return NextResponse.json({ error: 'Failed to subscribe' }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    if (!(await isAdmin())) return unauthorized();

    const { endpoint } = await request.json().catch(() => ({}));
    if (typeof endpoint !== 'string') {
        return NextResponse.json({ error: 'Requête invalide' }, { status: 400 });
    }
    await prisma.pushSubscription.deleteMany({ where: { endpoint, role: 'admin' } });
    return NextResponse.json({ success: true });
}
