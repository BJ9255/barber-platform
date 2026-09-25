import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { hashManageToken, isValidTokenFormat } from '@/lib/booking-token';
import { parseSubscription } from '@/lib/push';

// Le client demande un rappel pour un RDV : il prouve que c'est le sien avec son code secret
export async function POST(request: Request) {
    const { subscription, token } = await request.json().catch(() => ({}));
    const sub = parseSubscription(subscription);
    if (!sub || !isValidTokenFormat(token)) {
        return NextResponse.json({ error: 'Requête invalide' }, { status: 400 });
    }

    try {
        const slot = await prisma.slot.findFirst({
            where: { manageTokenHash: hashManageToken(token), startTime: { gt: new Date() } },
            select: { id: true },
        });
        if (!slot) {
            return NextResponse.json({ error: 'Rendez-vous introuvable' }, { status: 404 });
        }

        await prisma.pushSubscription.upsert({
            where: { endpoint_role_slotId: { endpoint: sub.endpoint, role: 'client', slotId: slot.id } },
            create: { ...sub, role: 'client', slotId: slot.id },
            update: { p256dh: sub.p256dh, auth: sub.auth },
        });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error saving subscription:', error);
        return NextResponse.json({ error: 'Failed to subscribe' }, { status: 500 });
    }
}
