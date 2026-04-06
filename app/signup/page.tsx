'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function Signup() {
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const getStrength = (password: string) => {
    if (password.length < 6)
      return { label: 'Weak', color: 'bg-red-400', width: '33%' }
    if (/^(?=.*[A-Z])(?=.*\d)/.test(password))
      return { label: 'Strong', color: 'bg-green-500', width: '100%' }
    return { label: 'Medium', color: 'bg-yellow-400', width: '66%' }
  }

  const strength = getStrength(password)

  const handleSignup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setMessage(null)

    if (password !== confirmPassword) {
      setMessage('Passwords do not match')
      return
    }

    setLoading(true)

    const { error } = await supabase.auth.signUp({
      email,
      password,
    })

    setLoading(false)

    if (error) {
      if (error.message.includes('rate limit')) {
        setMessage('Too many attempts. Please wait and try again.')
      } else {
        setMessage(error.message)
      }
    } else {
      // ✅ Important: works for both new + existing users
      setMessage('Check your email to continue.')

      // ✅ Redirect to role selection
      setTimeout(() => {
        router.push('/role-select')
      }, 1000)
    }
  }

  const handleResetPassword = async () => {
    if (!email) {
      setMessage('Enter your email first')
      return
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'http://localhost:3000/update-password',
    })

    if (error) setMessage(error.message)
    else setMessage('Password reset email sent!')
  }

  const isValid =
    email.length > 0 &&
    password.length >= 6 &&
    password === confirmPassword

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 px-4">
      <form
        onSubmit={handleSignup}
        className="w-full max-w-sm bg-white p-8 rounded-2xl shadow-xl flex flex-col gap-5"
      >
        <h1 className="text-2xl font-semibold text-center text-gray-800">
          Create Account
        </h1>

        {message && (
          <p className="text-sm text-center text-gray-600">{message}</p>
        )}

        {/* Email */}
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="input"
          required
        />

        {/* Password */}
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input pr-16"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="toggle-btn"
          >
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>

        {/* Strength */}
        {password && (
          <div className="flex flex-col gap-1">
            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full ${strength.color} transition-all duration-300`}
                style={{ width: strength.width }}
              />
            </div>
            <p className="text-xs text-gray-500">{strength.label} password</p>
          </div>
        )}

        {/* Confirm */}
        <input
          type={showPassword ? 'text' : 'password'}
          placeholder="Confirm Password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="input"
          required
        />

        {confirmPassword && password !== confirmPassword && (
          <p className="text-xs text-red-400">Passwords do not match</p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading || !isValid}
          className="primary-btn"
        >
          {loading ? 'Signing up...' : 'Sign Up'}
        </button>

        {/* Reset */}
        <button
          type="button"
          onClick={handleResetPassword}
          className="link-btn"
        >
          Forgot password?
        </button>
      </form>
    </div>
  )
}