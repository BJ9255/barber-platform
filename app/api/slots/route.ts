import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { startOfWeek, endOfWeek } from 'date-fns';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Route publique : créneaux de la semaine, sans aucune donnée client.
// La création / suppression de créneaux se fait via /api/admin/slots.
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);

    // Prochain créneau libre, affiché en haut de la page d'accueil
    if (searchParams.get('scope') === 'next') {
        try {
            const next = await prisma.slot.findFirst({
                where: { isBooked: false, startTime: { gt: new Date() } },
                orderBy: { startTime: 'asc' },
                select: { id: true, startTime: true, isBooked: true },
            });
            return NextResponse.json(next);
        } catch (error) {
            console.error('Error fetching next slot:', error);
            return NextResponse.json({ error: 'Failed to fetch slots' }, { status: 500 });
        }
    }

    const dateParam = searchParams.get('date');
    const startDate = dateParam ? new Date(dateParam) : new Date();

    if (isNaN(startDate.getTime())) {
        return NextResponse.json({ error: 'Date invalide' }, { status: 400 });
    }

    const start = startOfWeek(startDate, { weekStartsOn: 1 });
    const end = endOfWeek(startDate, { weekStartsOn: 1 });

    try {
        const slots = await prisma.slot.findMany({
            where: { startTime: { gte: start, lte: end } },
            orderBy: { startTime: 'asc' },
            select: { id: true, startTime: true, isBooked: true },
        });

        return NextResponse.json(slots);
    } catch (error) {
        console.error('Error fetching slots:', error);
        return NextResponse.json({ error: 'Failed to fetch slots' }, { status: 500 });
    }
}
