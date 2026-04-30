"use client";

import Link from "next/link";
import { MessageCenter } from "@/components/messages/message-center";

export default function AdminMessagesPage() {
  return (
    <div className="min-h-screen bg-black px-4 py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="section-label">Admin messages</p>
            <h1 className="mt-3 text-2xl font-semibold text-stone-900 sm:text-3xl">
              Message box
            </h1>
          </div>
          <Link href="/admin" className="secondary-btn w-full px-6 sm:w-auto">
            Back to admin
          </Link>
        </div>
        <MessageCenter accountType="admin" />
      </div>
    </div>
  );
}
