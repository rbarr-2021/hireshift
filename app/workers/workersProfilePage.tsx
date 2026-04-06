'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function WorkerProfilePage() {
  const params = useParams() // get [id] from URL
  const router = useRouter()
  const workerId = params.id as string

  const [worker, setWorker] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [bookingDate, setBookingDate] = useState('')
  const [bookingTime, setBookingTime] = useState('')
  const [bookingNotes, setBookingNotes] = useState('')
  const [bookingLoading, setBookingLoading] = useState(false)

  // Fetch worker profile
  const fetchWorker = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('worker_profiles')
      .select('*')
      .eq('user_id', workerId)
      .single()

    if (error) alert(error.message)
    else setWorker(data)

    setLoading(false)
  }

  useEffect(() => {
    if (workerId) fetchWorker()
  }, [workerId])

  // Booking function
  const handleBooking = async () => {
    setBookingLoading(true)

    // Get current logged-in business user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      setBookingLoading(false)
      return alert('Please log in as a business to book this worker.')
    }

    // Insert booking into bookings table
    const { data, error } = await supabase
      .from('bookings')
      .insert([{
        worker_id: workerId,
        business_id: user.id,
        date: bookingDate,
        time: bookingTime,
        notes: bookingNotes,
        status: 'pending' // for admin / worker approval
      }])

    setBookingLoading(false)

    if (error) alert(error.message)
    else {
      alert('Booking request sent!')
      setBookingDate('')
      setBookingTime('')
      setBookingNotes('')
    }
  }

  if (loading) return <p>Loading worker...</p>
  if (!worker) return <p>Worker not found</p>

  return (
    <div className="p-4 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-2">{worker.name}</h1>
      <p className="mb-2"><strong>Bio:</strong> {worker.bio}</p>
      <p className="mb-2"><strong>Hourly Rate:</strong> £{worker.hourly_rate}/hr</p>
      <p className="mb-2"><strong>Skills:</strong> {worker.skills.join(', ')}</p>
      <p className="mb-2"><strong>Location:</strong> {worker.location}</p>
      <p className="mb-4"><strong>Rating:</strong> {worker.rating}</p>

      <h2 className="text-xl font-bold mb-2">Book This Worker</h2>
      <div className="flex flex-col gap-2">
        <input
          type="date"
          value={bookingDate}
          onChange={e => setBookingDate(e.target.value)}
          className="border p-2 rounded"
        />
        <input
          type="time"
          value={bookingTime}
          onChange={e => setBookingTime(e.target.value)}
          className="border p-2 rounded"
        />
        <textarea
          placeholder="Notes"
          value={bookingNotes}
          onChange={e => setBookingNotes(e.target.value)}
          className="border p-2 rounded"
        />
        <button
          onClick={handleBooking}
          className="bg-blue-500 text-white p-2 rounded hover:bg-blue-600"
          disabled={bookingLoading}
        >
          {bookingLoading ? 'Booking...' : 'Book Now'}
        </button>
      </div>
    </div>
  )
}