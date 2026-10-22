import { getDb } from "@/db/client";
import { chatsOf } from "@/features/account/queries";
import { requireCustomerPage } from "@/lib/auth/guards";
import { account } from "@/lib/i18n";

export const metadata = { title: account.nav.chats };
export const instant = false;

const t = account.chatsPage;

/** Chats (12 §2): past website conversations, read-only until the assistant (Phase 9). */
export default async function ChatsPage() {
  const user = await requireCustomerPage();
  const chats = await chatsOf(await getDb(), user.id);
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-h1">{t.title}</h1>
      {chats.length === 0 ? (
        <p className="text-text-muted">{t.none}</p>
      ) : (
        <>
          <p className="text-[14px] text-text-muted">{t.later}</p>
          <ul className="flex flex-col gap-4">
            {chats.map((c) => (
              <li
                key={c.id}
                className="flex flex-col gap-2 rounded-[20px] bg-surface p-5 shadow-soft"
              >
                <p className="text-[13.5px] text-text-muted">
                  {(c.lastMessageAt ?? c.createdAt).toLocaleString("en-GB", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
                <ol className="flex flex-col gap-2">
                  {c.messages.map((m, i) => (
                    <li key={i} className="text-[14.5px]">
                      <span className="font-semibold text-ink">
                        {m.sender === "customer" ? t.you : t.us}:{" "}
                      </span>
                      {m.body}
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
