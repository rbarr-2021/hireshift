'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function RoleSelect() {
  const [role, setRole] = useState<'worker' | 'business' | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleContinue = async () => {
    if (!role) return alert('Please select a role')
    setLoading(true)

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      setLoading(false)
      return alert(userError?.message || 'Not logged in')
    }

    // Optional: store role in a profile table
    const { error } = await supabase
      .from('profiles')
      .upsert({ user_id: user.id, role })
    
    setLoading(false)
    if (error) return alert(error.message)

    // Redirect to role-specific page
    if (role === 'business') router.push('/business-setup')
    else router.push('/workers-setup') // or dashboard if no extra setup
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <h1 className="text-2xl font-semibold mb-4">Select Your Role</h1>
      <div className="flex flex-col gap-4">
        <button
          onClick={() => setRole('worker')}
          className={`border p-3 rounded ${
            role === 'worker' ? 'bg-blue-500 text-white' : 'bg-white text-black'
          } hover:bg-blue-400 hover:text-white transition`}
        >
          Worker
        </button>
        <button
          onClick={() => setRole('business')}
          className={`border p-3 rounded ${
            role === 'business' ? 'bg-green-500 text-white' : 'bg-white text-black'
          } hover:bg-green-400 hover:text-white transition`}
        >
          Business
        </button>
        <button
          onClick={handleContinue}
          className="primary-btn mt-4"
          disabled={loading || !role}
        >
          {loading ? 'Continuing...' : 'Continue'}
        </button>
      </div>
    </div>
  )
}