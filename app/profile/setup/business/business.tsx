'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function BusinessSetup() {
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async () => {
    setLoading(true)

    // Get current logged-in user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError) {
      setLoading(false)
      return alert(userError.message)
    }
    if (!user) {
      setLoading(false)
      return alert('Not logged in')
    }

    // Insert business profile
    const { data, error } = await supabase
      .from('business_profiles')
      .insert([{
        user_id: user.id,
        name,
        address
      }])

    setLoading(false)

    if (error) alert(error.message)
    else {
      alert('Business profile saved!')
      router.push('/dashboard/business') // redirect after setup
    }
  }

  return (
    <div className="flex flex-col gap-4 max-w-sm p-4">
      <input
        placeholder="Business Name"
        value={name}
        onChange={e => setName(e.target.value)}
        className="border p-2 rounded"
      />
      <input
        placeholder="Address"
        value={address}
        onChange={e => setAddress(e.target.value)}
        className="border p-2 rounded"
      />
      <button
        onClick={handleSubmit}
        className="bg-green-500 text-white p-2 rounded hover:bg-green-600"
        disabled={loading}
      >
        {loading ? 'Saving...' : 'Save Profile'}
      </button>
    </div>
  )
}