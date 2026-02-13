import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { startOfWeek, endOfWeek } from 'date-fns';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');

    let startDate = new Date();
    if (dateParam) {
        startDate = new Date(dateParam);
    }

    const scope = searchParams.get('scope');

    let whereClause = {};

    if (scope === 'future') {
        whereClause = {
            startTime: {
                gte: new Date(),
            },
        };
    } else {
        // Default: Weekly view
        const start = startOfWeek(startDate, { weekStartsOn: 1 }); // Monday start
        const end = endOfWeek(startDate, { weekStartsOn: 1 });
        whereClause = {
            startTime: {
                gte: start,
                lte: end,
            },
        };
    }

    try {
        const slots = await prisma.slot.findMany({
            where: whereClause,
            orderBy: {
                startTime: 'asc',
            },
        });

        return NextResponse.json(slots);
    } catch (error) {
        console.error('Error fetching slots:', error);
        return NextResponse.json({ error: 'Failed to fetch slots' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { startTime } = body;

        const slot = await prisma.slot.create({
            data: {
                startTime: new Date(startTime),
                isBooked: false,
            },
        });

        return NextResponse.json(slot);
    } catch (error) {
        console.error('Error creating slot:', error);
        return NextResponse.json({ error: 'Failed to create slot' }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Missing id' }, { status: 400 });
        }

        await prisma.slot.delete({
            where: { id },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting slot:', error);
        return NextResponse.json({ error: 'Failed to delete slot' }, { status: 500 });
    }
}
