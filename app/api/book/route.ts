import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

const PHONE_REGEX = /^\+?[0-9 .-]{8,20}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const slotId = typeof body.slotId === 'string' ? body.slotId : '';
        const clientName = typeof body.clientName === 'string' ? body.clientName.trim() : '';
        const clientPhone = typeof body.clientPhone === 'string' ? body.clientPhone.trim() : '';
        const clientEmail = typeof body.clientEmail === 'string' ? body.clientEmail.trim() : '';

        if (!slotId || !clientName || !clientPhone) {
            return NextResponse.json({ error: 'Nom et téléphone obligatoires' }, { status: 400 });
        }
        if (clientName.length > 100) {
            return NextResponse.json({ error: 'Nom trop long' }, { status: 400 });
        }
        if (!PHONE_REGEX.test(clientPhone)) {
            return NextResponse.json({ error: 'Numéro de téléphone invalide' }, { status: 400 });
        }
        if (clientEmail && (clientEmail.length > 200 || !EMAIL_REGEX.test(clientEmail))) {
            return NextResponse.json({ error: 'Email invalide' }, { status: 400 });
        }

        // Réservation atomique : la mise à jour ne passe que si le créneau est encore libre
        // et dans le futur, ce qui empêche deux clients de réserver le même créneau.
        const { count } = await prisma.slot.updateMany({
            where: { id: slotId, isBooked: false, startTime: { gt: new Date() } },
            data: {
                isBooked: true,
                clientName,
                clientPhone,
                clientEmail: clientEmail || null,
            },
        });

        if (count === 0) {
            const slot = await prisma.slot.findUnique({ where: { id: slotId } });
            if (!slot) {
                return NextResponse.json({ error: 'Créneau introuvable' }, { status: 404 });
            }
            if (slot.isBooked) {
                return NextResponse.json({ error: 'Ce créneau vient d\'être réservé' }, { status: 409 });
            }
            return NextResponse.json({ error: 'Ce créneau est déjà passé' }, { status: 409 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error booking slot:', error);
        return NextResponse.json({ error: 'Failed to book slot' }, { status: 500 });
    }
}
