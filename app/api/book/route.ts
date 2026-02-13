import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { slotId, clientName } = body;

        if (!slotId || !clientName) {
            return NextResponse.json({ error: 'Missing slotId or clientName' }, { status: 400 });
        }

        // Check if slot exists and is available
        const slot = await prisma.slot.findUnique({
            where: { id: slotId },
        });

        if (!slot) {
            return NextResponse.json({ error: 'Slot not found' }, { status: 404 });
        }

        if (slot.isBooked) {
            return NextResponse.json({ error: 'Slot already booked' }, { status: 409 });
        }

        // Book the slot
        const updatedSlot = await prisma.slot.update({
            where: { id: slotId },
            data: {
                isBooked: true,
                clientName: clientName,
            },
        });

        return NextResponse.json(updatedSlot);
    } catch (error) {
        console.error('Error booking slot:', error);
        return NextResponse.json({ error: 'Failed to book slot' }, { status: 500 });
    }
}
