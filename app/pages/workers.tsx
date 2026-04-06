'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

export default function WorkersPage() {
  const [workers, setWorkers] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({
    name: '',
    bio: '',
    skills: '',
    hourly_rate_min: '',
    hourly_rate_max: '',
    location: '',
    rating_min: ''
  })

  // Fetch workers based on filters
  const fetchWorkers = async () => {
    setLoading(true)

    let query = supabase.from('worker_profiles').select('*')

    // Name filter
    if (filters.name)
      query = query.ilike('name', `%${filters.name}%`)

    // Bio filter
    if (filters.bio)
      query = query.ilike('bio', `%${filters.bio}%`)

    // Skills filter (match any skill in comma-separated input)
    if (filters.skills) {
      const skillsArray = filters.skills.split(',').map(s => s.trim().toLowerCase())
      skillsArray.forEach(skill => {
        query = query.contains('skills', [skill])
      })
    }

    // Hourly rate filter
    if (filters.hourly_rate_min)
      query = query.gte('hourly_rate', Number(filters.hourly_rate_min))
    if (filters.hourly_rate_max)
      query = query.lte('hourly_rate', Number(filters.hourly_rate_max))

    // Location filter
    if (filters.location)
      query = query.ilike('location', `%${filters.location}%`)

    // Rating filter
    if (filters.rating_min)
      query = query.gte('rating', Number(filters.rating_min))

    const { data, error } = await query

    if (error) alert(error.message)
    else setWorkers(data || [])

    setLoading(false)
  }

  // Fetch on initial load
  useEffect(() => {
    fetchWorkers()
  }, [])

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Find Workers</h1>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-2 mb-4">
        <input
          placeholder="Name"
          value={filters.name}
          onChange={e => setFilters({ ...filters, name: e.target.value })}
          className="border p-2 rounded flex-1"
        />
        <input
          placeholder="Bio"
          value={filters.bio}
          onChange={e => setFilters({ ...filters, bio: e.target.value })}
          className="border p-2 rounded flex-1"
        />
        <input
          placeholder="Skills (comma separated)"
          value={filters.skills}
          onChange={e => setFilters({ ...filters, skills: e.target.value })}
          className="border p-2 rounded flex-1"
        />
        <input
          placeholder="Location"
          value={filters.location}
          onChange={e => setFilters({ ...filters, location: e.target.value })}
          className="border p-2 rounded flex-1"
        />
      </div>

      <div className="flex flex-col md:flex-row gap-2 mb-4">
        <input
          type="number"
          placeholder="Min Rate"
          value={filters.hourly_rate_min}
          onChange={e => setFilters({ ...filters, hourly_rate_min: e.target.value })}
          className="border p-2 rounded"
        />
        <input
          type="number"
          placeholder="Max Rate"
          value={filters.hourly_rate_max}
          onChange={e => setFilters({ ...filters, hourly_rate_max: e.target.value })}
          className="border p-2 rounded"
        />
        <input
          type="number"
          placeholder="Min Rating"
          value={filters.rating_min}
          onChange={e => setFilters({ ...filters, rating_min: e.target.value })}
          className="border p-2 rounded"
        />
        <button
          onClick={fetchWorkers}
          className="bg-blue-500 text-white p-2 rounded hover:bg-blue-600"
        >
          Search
        </button>
      </div>

      {/* Workers List */}
      {loading ? (
        <p>Loading...</p>
      ) : workers.length === 0 ? (
        <p>No workers found.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {workers.map(worker => (
            <Link
              key={worker.user_id}
              href={`/workers/${worker.user_id}`}
              className="border p-4 rounded hover:shadow"
            >
              <h2 className="font-bold">{worker.name}</h2>
              <p>{worker.bio}</p>
              <p>Skills: {worker.skills.join(', ')}</p>
              <p>Rate: £{worker.hourly_rate}/hr</p>
              <p>Location: {worker.location}</p>
              <p>Rating: {worker.rating}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}