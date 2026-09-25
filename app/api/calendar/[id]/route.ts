import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const DURATION_MINUTES = 30;

// Format des dates iCalendar, en UTC : 20260925T143000Z
const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

// Fichier .ics : un clic sur iPhone ou Android propose d'ajouter le RDV au calendrier.
// Il ne contient que l'heure (déjà publique via /api/slots), aucune donnée client.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const slot = await prisma.slot.findUnique({ where: { id }, select: { id: true, startTime: true } });
    if (!slot) return new Response('Rendez-vous introuvable', { status: 404 });

    const end = new Date(slot.startTime.getTime() + DURATION_MINUTES * 60 * 1000);
    const ics = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Lagrobarber//Reservation//FR',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'BEGIN:VEVENT',
        `UID:${slot.id}@lagrobarber`,
        `DTSTAMP:${icsDate(new Date())}`,
        `DTSTART:${icsDate(slot.startTime)}`,
        `DTEND:${icsDate(end)}`,
        'SUMMARY:Coupe chez Lagrobarber',
        'DESCRIPTION:Pour gérer ou annuler ton rendez-vous : https://barber-rdv-baptiste.vercel.app/mes-rdv',
        'BEGIN:VALARM',
        'TRIGGER:-PT1H',
        'ACTION:DISPLAY',
        'DESCRIPTION:Coupe chez Lagrobarber dans 1 heure',
        'END:VALARM',
        'END:VEVENT',
        'END:VCALENDAR',
    ].join('\r\n');

    return new Response(ics, {
        headers: {
            'Content-Type': 'text/calendar; charset=utf-8',
            'Content-Disposition': 'inline; filename="rdv-lagrobarber.ics"',
        },
    });
}
