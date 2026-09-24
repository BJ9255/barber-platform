import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isAdmin, unauthorized } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Tous les créneaux à venir, avec les coordonnées des clients
export async function GET() {
    if (!(await isAdmin())) return unauthorized();

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    try {
        const slots = await prisma.slot.findMany({
            where: { startTime: { gte: todayStart } },
            orderBy: { startTime: 'asc' },
        });
        return NextResponse.json(slots);
    } catch (error) {
        console.error('Error fetching slots:', error);
        return NextResponse.json({ error: 'Failed to fetch slots' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    if (!(await isAdmin())) return unauthorized();

    try {
        const { startTime } = await request.json();
        const date = new Date(startTime);

        if (!startTime || isNaN(date.getTime())) {
            return NextResponse.json({ error: 'Date manquante ou invalide' }, { status: 400 });
        }

        const slot = await prisma.slot.create({
            data: { startTime: date, isBooked: false },
        });

        return NextResponse.json(slot);
    } catch (error) {
        console.error('Error creating slot:', error);
        return NextResponse.json({ error: 'Failed to create slot' }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    if (!(await isAdmin())) return unauthorized();

    const id = new URL(request.url).searchParams.get('id');
    if (!id) {
        return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }

    try {
        await prisma.slot.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting slot:', error);
        return NextResponse.json({ error: 'Failed to delete slot' }, { status: 500 });
    }
}
