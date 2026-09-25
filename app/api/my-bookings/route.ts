import { after, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { hashManageToken, isValidTokenFormat } from '@/lib/booking-token';
import { formatParis, notifyBarber } from '@/lib/push';

export const dynamic = 'force-dynamic';

// Les codes circulent dans le corps des requêtes (POST / DELETE), jamais dans l'URL,
// pour ne pas finir dans l'historique ou les journaux du serveur.

// Liste des RDV correspondant aux codes gardés sur le téléphone
export async function POST(request: Request) {
    const { tokens } = await request.json().catch(() => ({}));
    if (!Array.isArray(tokens) || tokens.length > 50) {
        return NextResponse.json({ error: 'Requête invalide' }, { status: 400 });
    }
    const valid = tokens.filter(isValidTokenFormat);
    const byHash = new Map(valid.map(t => [hashManageToken(t), t]));

    try {
        const slots = await prisma.slot.findMany({
            where: { manageTokenHash: { in: [...byHash.keys()] } },
            orderBy: { startTime: 'asc' },
            select: { id: true, startTime: true, clientName: true, manageTokenHash: true },
        });
        return NextResponse.json(slots.map(({ manageTokenHash, ...slot }) => ({
            ...slot,
            token: byHash.get(manageTokenHash!),
        })));
    } catch (error) {
        console.error('Error fetching bookings:', error);
        return NextResponse.json({ error: 'Failed to fetch bookings' }, { status: 500 });
    }
}

// Annulation par le client : le créneau redevient libre et ses coordonnées sont effacées
export async function DELETE(request: Request) {
    const { token } = await request.json().catch(() => ({}));
    if (!isValidTokenFormat(token)) {
        return NextResponse.json({ error: 'Code invalide' }, { status: 400 });
    }
    const hash = hashManageToken(token);

    try {
        const slot = await prisma.slot.findUnique({
            where: { manageTokenHash: hash },
            select: { id: true, startTime: true, clientName: true },
        });
        if (!slot) {
            return NextResponse.json({ error: 'Rendez-vous introuvable' }, { status: 404 });
        }

        // Même principe que la réservation : une seule requête, conditionnée, donc sans race condition
        const { count } = await prisma.slot.updateMany({
            where: { id: slot.id, manageTokenHash: hash, startTime: { gt: new Date() } },
            data: { isBooked: false, clientName: null, clientPhone: null, clientEmail: null, manageTokenHash: null },
        });
        if (count === 0) {
            return NextResponse.json({ error: 'Ce rendez-vous est déjà passé' }, { status: 409 });
        }

        await prisma.pushSubscription.deleteMany({ where: { slotId: slot.id, role: 'client' } });

        after(() => notifyBarber({
            title: 'Rendez-vous annulé',
            body: `${slot.clientName} a annulé · ${formatParis(slot.startTime, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}`,
            url: '/admin',
        }));

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error cancelling booking:', error);
        return NextResponse.json({ error: 'Failed to cancel booking' }, { status: 500 });
    }
}
