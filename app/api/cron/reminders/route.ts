import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { formatParis, sendPush } from '@/lib/push';

export const dynamic = 'force-dynamic';

// Lancée chaque matin par Vercel Cron (voir vercel.json) : rappel aux clients qui ont un RDV dans les 24 h.
// Vercel envoie automatiquement « Authorization: Bearer <CRON_SECRET> » : personne d'autre ne peut la déclencher.
export async function GET(request: Request) {
    const secret = process.env.CRON_SECRET;
    if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
        return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const subs = await prisma.pushSubscription.findMany({
        where: {
            role: 'client',
            remindedAt: null,
            slot: { isBooked: true, startTime: { gt: now, lte: in24h } },
        },
        include: { slot: { select: { startTime: true } } },
    });

    const todayParis = formatParis(now, { dateStyle: 'short' });
    await Promise.all(subs.map(async sub => {
        const start = sub.slot!.startTime;
        const day = formatParis(start, { dateStyle: 'short' }) === todayParis ? "aujourd'hui" : 'demain';
        await sendPush([sub], {
            title: 'Rappel · Lagrobarber',
            body: `Ta coupe, c'est ${day} à ${formatParis(start, { hour: '2-digit', minute: '2-digit' })}. À tout à l'heure !`,
            url: '/mes-rdv',
        });
    }));

    if (subs.length > 0) {
        await prisma.pushSubscription.updateMany({
            where: { id: { in: subs.map(s => s.id) } },
            data: { remindedAt: now },
        });
    }
    // Ménage : les abonnements des RDV passés ne servent plus
    await prisma.pushSubscription.deleteMany({ where: { role: 'client', slot: { startTime: { lt: now } } } });

    return NextResponse.json({ sent: subs.length });
}
