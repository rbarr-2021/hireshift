'use client'

import Link from 'next/link'

export default function HomePage() {
  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">HireShift MVP</h1>

      <div className="flex flex-col gap-3">
        <Link href="/signup" className="text-blue-500 hover:underline">
          Signup Page
        </Link>
        <Link href="/login" className="text-blue-500 hover:underline">
          Login Page
        </Link>
        <Link href="/profile/setup/worker" className="text-blue-500 hover:underline">
          Worker Setup
        </Link>
        <Link href="/profile/setup/business/business" className="text-blue-500 hover:underline">
          Business Setup
        </Link>
        <Link href="/workers/workersProfilePage" className="text-blue-500 hover:underline">
          Workers List
        </Link>
        <p className="text-gray-500 text-sm">
          Individual worker profile pages will work after selecting a worker from the list.
        </p>
      </div>
    </div>
  )
}