'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

type Availability = {
  [day: string]: { start: string; end: string } | null
}

const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export default function WorkerSetup() {
  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [rate, setRate] = useState<number | ''>('')
  const [skills, setSkills] = useState<string[]>([])
  const [skillInput, setSkillInput] = useState('')
  const [counties, setCounties] = useState<string[]>([])
  const [countyInput, setCountyInput] = useState('')
  const [location, setLocation] = useState('')
  const [availability, setAvailability] = useState<Availability>({})
  const [profilePic, setProfilePic] = useState<File | null>(null)
  const [profilePicUrl, setProfilePicUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [bioChars, setBioChars] = useState(0)

  // --- Skills handlers ---
  const handleAddSkill = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && skillInput.trim()) {
      e.preventDefault()
      if (!skills.includes(skillInput.trim())) setSkills([...skills, skillInput.trim()])
      setSkillInput('')
    }
  }
  const handleRemoveSkill = (skill: string) => setSkills(skills.filter(s => s !== skill))

  // --- Counties handlers ---
  const handleAddCounty = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && countyInput.trim()) {
      e.preventDefault()
      if (!counties.includes(countyInput.trim())) setCounties([...counties, countyInput.trim()])
      setCountyInput('')
    }
  }
  const handleRemoveCounty = (county: string) => setCounties(counties.filter(c => c !== county))

  // --- Location handler ---
  const handleUseLocation = async () => {
    if (!navigator.geolocation) return alert('Geolocation not supported')
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const { latitude, longitude } = pos.coords
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
          )
          const data = await res.json()
          const city =
            data.address.city ||
            data.address.town ||
            data.address.village ||
            data.address.state
          if (city) setLocation(city)
          else setLocation('')
        } catch {
          alert('Could not get city name')
        }
      },
      err => alert('Could not get location: ' + err.message)
    )
  }

  // --- Profile picture upload ---
  const handleProfilePic = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setProfilePic(e.target.files[0])
      setProfilePicUrl(URL.createObjectURL(e.target.files[0]))
    }
  }

  // --- Availability handler ---
  const handleAvailabilityChange = (day: string, field: 'start' | 'end', value: string) => {
    setAvailability({
      ...availability,
      [day]: { ...(availability[day] || { start: '', end: '' }), [field]: value },
    })
  }

  // --- Submit ---
  const handleSubmit = async () => {
    if (!name || !bio || !rate || skills.length === 0 || counties.length === 0 || !location) {
      return alert('Please fill all required fields')
    }
    setLoading(true)
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      setLoading(false)
      return alert(userError?.message || 'Not logged in')
    }

    // Optional: upload profile picture to Supabase Storage
    let picUrl = profilePicUrl
    if (profilePic) {
      const fileName = `${user.id}-${profilePic.name}`
      const { error: uploadError } = await supabase.storage.from('profile-pics').upload(fileName, profilePic, { upsert: true })
      if (uploadError) {
        setLoading(false)
        return alert('Profile picture upload failed: ' + uploadError.message)
      }
      picUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/profile-pics/${fileName}`
    }

    const { error } = await supabase.from('worker_profiles').insert([{
      user_id: user.id,
      name,
      bio,
      hourly_rate: rate,
      location,
      skills,
      counties,
      availability,
      profile_pic: picUrl,
      rating: 0
    }])

    setLoading(false)
    if (error) alert(error.message)
    else alert('Profile saved!')
  }

// --- Helper functions
const isFilled = (value: any) => {
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object' && value !== null) return Object.keys(value).some(day => value[day]?.start && value[day]?.end)
  return !!value
}

// --- Profile completion %
const fields = [name, bio, rate, skills, counties, location, availability, profilePic]
const filledCount = fields.filter(isFilled).length
const completion = Math.min(100, Math.floor((filledCount / fields.length) * 100))

  return (
    <div className="flex flex-col gap-4 max-w-md p-6 mx-auto">
      <h1 className="text-2xl font-semibold mb-2">Worker Setup</h1>

      {/* Progress bar */}
      <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
        <div className="bg-green-500 h-2 rounded-full" style={{ width: `${completion}%` }} />
      </div>

      {/* Name */}
      <input
        placeholder="Full Name"
        value={name}
        onChange={e => setName(e.target.value)}
        className="border rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
      />

      {/* Bio */}
      <textarea
        placeholder="Short Bio"
        value={bio}
        onChange={e => { setBio(e.target.value); setBioChars(e.target.value.length) }}
        className="border rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
        rows={3}
      />
      <div className="text-right text-sm text-gray-500">{bioChars}/250</div>

      {/* Hourly Rate */}
      <div className="flex items-center border rounded-xl p-3 focus-within:ring-2 focus-within:ring-blue-400">
        <span className="mr-2 text-gray-600">$</span>
        <input
          type="number"
          placeholder="Hourly Rate"
          value={rate}
          onChange={e => setRate(Number(e.target.value))}
          className="w-full outline-none"
          min={0}
          step={0.5}
        />
      </div>

      {/* Skills */}
      <div className="flex flex-wrap gap-2">
        {skills.map(skill => (
          <div key={skill} className="flex items-center bg-blue-100 text-blue-800 rounded-full px-3 py-1 text-sm">
            {skill}
            <button type="button" onClick={() => handleRemoveSkill(skill)} className="ml-1 font-bold">&times;</button>
          </div>
        ))}
      </div>
      <input
        placeholder="Add Skill (press Enter)"
        value={skillInput}
        onChange={e => setSkillInput(e.target.value)}
        onKeyDown={handleAddSkill}
        className="border rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
      />

      {/* Counties */}
      <div className="flex flex-wrap gap-2">
        {counties.map(county => (
          <div key={county} className="flex items-center bg-purple-100 text-purple-800 rounded-full px-3 py-1 text-sm">
            {county}
            <button type="button" onClick={() => handleRemoveCounty(county)} className="ml-1 font-bold">&times;</button>
          </div>
        ))}
      </div>
      <input
        placeholder="Add County (press Enter)"
        value={countyInput}
        onChange={e => setCountyInput(e.target.value)}
        onKeyDown={handleAddCounty}
        className="border rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-purple-400"
      />

      {/* Availability */}
      <div>
        <h2 className="font-semibold mb-1">Availability</h2>
        {daysOfWeek.map(day => (
          <div key={day} className="flex gap-2 mb-2 items-center">
            <span className="w-20">{day}</span>
            <input
              type="time"
              value={availability[day]?.start || ''}
              onChange={e => handleAvailabilityChange(day, 'start', e.target.value)}
              className="border rounded-xl p-1 w-full"
            />
            <span>-</span>
            <input
              type="time"
              value={availability[day]?.end || ''}
              onChange={e => handleAvailabilityChange(day, 'end', e.target.value)}
              className="border rounded-xl p-1 w-full"
            />
          </div>
        ))}
      </div>

      {/* Profile picture */}
      <div>
        <h2 className="font-semibold mb-1">Profile Picture</h2>
        <input type="file" accept="image/*" onChange={handleProfilePic} />
        {profilePicUrl && <img src={profilePicUrl} alt="Preview" className="mt-2 w-24 h-24 rounded-full object-cover" />}
      </div>

      {/* Location */}
      <div className="flex gap-2">
        <input
          placeholder="City/Town"
          value={location}
          onChange={e => setLocation(e.target.value)}
          className="flex-1 border rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <button
          onClick={handleUseLocation}
          type="button"
          className="bg-blue-500 text-white px-4 rounded-xl hover:bg-blue-600"
        >
          Use My Location
        </button>
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        className="bg-green-500 text-white p-3 rounded-xl hover:bg-green-600 font-semibold"
        disabled={loading}
      >
        {loading ? 'Saving...' : 'Save Profile'}
      </button>
    </div>
  )
}