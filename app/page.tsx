'use client';

import { useState, useEffect } from 'react';
import { format, startOfWeek, addDays, isSameDay, addWeeks, subWeeks } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

type Slot = {
  id: string;
  startTime: string;
  isBooked: boolean;
  clientName?: string;
};

export default function BookingPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [clientName, setClientName] = useState('');
  const [bookingLoading, setBookingLoading] = useState(false);

  // Fetch slots when date changes
  useEffect(() => {
    fetchSlots();
  }, [currentDate]);

  const fetchSlots = async () => {
    setLoading(true);
    try {
      // Pass the start of the week as the date param to be consistent
      const start = startOfWeek(currentDate, { weekStartsOn: 1 });
      const res = await fetch(`/api/slots?date=${start.toISOString()}`);
      if (res.ok) {
        const data = await res.json();
        setSlots(data);
      }
    } catch (error) {
      console.error('Failed to fetch slots', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePrevWeek = () => setCurrentDate(subWeeks(currentDate, 1));
  const handleNextWeek = () => setCurrentDate(addWeeks(currentDate, 1));

  const handleBookSlot = async () => {
    if (!selectedSlot || !clientName.trim()) return;

    setBookingLoading(true);
    try {
      const res = await fetch('/api/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slotId: selectedSlot.id,
          clientName: clientName,
        }),
      });

      if (res.ok) {
        alert('Réservation confirmée !');
        setSelectedSlot(null);
        setClientName('');
        fetchSlots(); // Refresh
      } else {
        const err = await res.json();
        alert(`Erreur: ${err.error}`);
      }
    } catch (error) {
      console.error('Booking failed', error);
      alert('Une erreur est survenue.');
    } finally {
      setBookingLoading(false);
    }
  };

  const startOfCurrentWeek = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 6 }).map((_, i) => addDays(startOfCurrentWeek, i)); // Mon-Sat

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8 font-sans text-gray-900">
      <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-lg overflow-hidden">

        {/* Header */}
        <div className="bg-black text-white p-6 text-center">
          <h1 className="text-2xl font-bold">Réserver une coupe</h1>
          <p className="text-gray-400 text-sm mt-1">Choisissez votre créneau</p>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <button onClick={handlePrevWeek} className="p-2 hover:bg-gray-100 rounded-full transition">
            <ChevronLeft size={24} />
          </button>
          <span className="font-semibold text-lg capitalize">
            {format(startOfCurrentWeek, 'MMMM yyyy', { locale: fr })}
          </span>
          <button onClick={handleNextWeek} className="p-2 hover:bg-gray-100 rounded-full transition">
            <ChevronRight size={24} />
          </button>
        </div>

        {/* Calendar Grid */}
        <div className="p-4 overflow-x-auto">
          {loading ? (
            <div className="flex justify-center p-12">
              <Loader2 className="animate-spin text-gray-400" size={32} />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {weekDays.map((day) => {
                const daySlots = slots.filter(s => isSameDay(new Date(s.startTime), day));
                return (
                  <div key={day.toString()} className="border border-gray-100 rounded-lg p-4 bg-gray-50/50">
                    <h3 className="font-medium text-center mb-3 capitalize text-gray-700">
                      {format(day, 'EEEE d', { locale: fr })}
                    </h3>
                    <div className="space-y-2">
                      {daySlots.length === 0 ? (
                        <div className="text-center text-gray-400 text-xs py-2 italic">Aucun créneau</div>
                      ) : (
                        daySlots.map(slot => (
                          <button
                            key={slot.id}
                            disabled={slot.isBooked}
                            onClick={() => setSelectedSlot(slot)}
                            className={`w-full py-2 px-3 rounded-md text-sm font-medium transition-all ${slot.isBooked
                                ? 'bg-gray-200 text-gray-400 cursor-not-allowed decoration-slice'
                                : 'bg-white border border-gray-200 hover:border-black hover:shadow-md active:scale-95 text-black'
                              }`}
                          >
                            {format(new Date(slot.startTime), 'HH:mm')}
                            {slot.isBooked && <span className="ml-2 text-xs">(Pris)</span>}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Booking Modal */}
      {selectedSlot && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm animate-in fade-in zoom-in duration-200">
            <h2 className="text-xl font-bold mb-4">Confirmer la réservation</h2>
            <div className="mb-4">
              <p className="text-gray-600">
                Créneau : <span className="font-semibold text-black">
                  {format(new Date(selectedSlot.startTime), "EEEE d MMMM 'à' HH:mm", { locale: fr })}
                </span>
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Votre Prénom</label>
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Ex: Thomas"
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-black focus:border-transparent outline-none transition"
                  autoFocus
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setSelectedSlot(null)}
                  className="flex-1 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition"
                >
                  Annuler
                </button>
                <button
                  onClick={handleBookSlot}
                  disabled={!clientName.trim() || bookingLoading}
                  className="flex-1 py-2 bg-black text-white rounded-lg font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition flex justify-center items-center gap-2"
                >
                  {bookingLoading && <Loader2 className="animate-spin" size={16} />}
                  Réserver
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
