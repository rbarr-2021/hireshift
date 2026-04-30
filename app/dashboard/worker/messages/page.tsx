"use client";

import { MessageCenter } from "@/components/messages/message-center";

export default function WorkerMessagesPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="section-label">Messages</p>
        <h1 className="mt-3 text-2xl font-semibold text-stone-900 sm:text-3xl">
          Worker inbox
        </h1>
      </div>
      <MessageCenter accountType="worker" />
    </div>
  );
}
