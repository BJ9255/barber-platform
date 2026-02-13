import { PrismaClient } from '@prisma/client';
import { addDays, startOfHour, setHours, setMinutes } from 'date-fns';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
    console.log('Seeding database...');

    // Clear existing slots if any (optional, be careful in prod)
    // await prisma.slot.deleteMany();

    const today = new Date();
    const slots = [];

    // Generate slots for the next 7 days
    for (let i = 1; i <= 7; i++) {
        const day = addDays(today, i);

        // Only weekdays? Or simplify and just do all days for now.
        // Let's do Mon-Fri + Saturday. 0 is Sunday.
        if (day.getDay() === 0) continue; // Skip Sunday

        // Slots from 9 AM to 6 PM (18:00)
        for (let hour = 9; hour < 18; hour++) {
            // 1 hour slots
            const startTime = setMinutes(setHours(day, hour), 0);

            // Randomly mark some as booked to test UI
            const isBooked = Math.random() < 0.2;

            slots.push({
                startTime: startTime,
                isBooked: isBooked,
                clientName: isBooked ? 'Test Client' : null,
            });
        }
    }

    for (const slot of slots) {
        await prisma.slot.create({
            data: slot,
        });
    }

    console.log(`Seeded ${slots.length} slots.`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
