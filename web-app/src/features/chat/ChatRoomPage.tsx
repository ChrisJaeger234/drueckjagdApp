import { Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, Clock, SendHorizontal, Trash2 } from "lucide-react";
import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { FormError } from "../../components/form";
import { Page } from "../../components/ui";
import { mapError } from "../../lib/errors";
import { useOnline } from "../../lib/useOnline";
import { useUser } from "../auth/AuthContext";
import { useMyGroup } from "../groups/useGroups";
import {
  dayLabel,
  MAX_MESSAGE_LENGTH,
  newMessage,
  sortMessages,
  timeLabel,
  type ChatMessage,
} from "./chatModel";
import { useChatMessages, useDeleteMessage, useSendMessage } from "./useChat";

export function ChatRoomPage() {
  const { groupId } = useParams({ from: "/shell/chat/$groupId" });
  const user = useUser();
  const online = useOnline();
  const { data: mine } = useMyGroup(groupId);
  const { data: messages = [], error, isPending } = useChatMessages(groupId);
  const send = useSendMessage();
  const remove = useDeleteMessage(groupId);
  const [text, setText] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const list = sortMessages(messages);
  const lastId = list[list.length - 1]?.id;

  // Zur neuesten Nachricht springen (beim Öffnen und bei neuen Nachrichten).
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [lastId]);

  function submit(e?: FormEvent) {
    e?.preventDefault();
    const content = text.trim();
    if (!content) return;
    send.mutate({ groupId, input: newMessage(content) });
    setText("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Am Rechner sendet Enter, Umschalt+Enter macht eine neue Zeile. Am iPhone bleibt Enter ein Zeilenumbruch.
    if (
      e.key === "Enter" &&
      !e.shiftKey &&
      !e.nativeEvent.isComposing &&
      window.matchMedia("(pointer: fine)").matches
    )
      submit();
  }

  return (
    <Page
      title={mine?.group.name ?? "Chat"}
      actions={
        <Link
          to="/chat"
          className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary"
        >
          <ArrowLeft aria-hidden className="size-4" /> Chats
        </Link>
      }
    >
      {error && <FormError message={mapError(error).message} />}
      {/* Mindesthöhe, damit das Eingabefeld auch bei wenigen Nachrichten unten über der Navigation sitzt. */}
      <div className="flex min-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-240px)] flex-col justify-end md:min-h-[calc(100dvh-180px)]">
        {isPending ? (
          <p className="text-sm text-muted">Nachrichten werden geladen …</p>
        ) : list.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">
            Noch keine Nachrichten. Schreib die erste, z. B. den Treffpunkt.
          </p>
        ) : (
          <ol className="grid gap-2" aria-label="Nachrichten">
            {list.map((m, i) => {
              const day = dayLabel(m.createdAt);
              const showDay =
                i === 0 || dayLabel(list[i - 1]!.createdAt) !== day;
              return (
                <Fragment key={m.id}>
                  {showDay && (
                    <li
                      aria-hidden
                      className="py-1 text-center text-xs font-medium text-muted"
                    >
                      {day}
                    </li>
                  )}
                  <Bubble
                    message={m}
                    own={m.senderId === user.id}
                    showName={
                      m.senderId !== user.id &&
                      (i === 0 ||
                        list[i - 1]!.senderId !== m.senderId ||
                        showDay)
                    }
                    confirming={confirmId === m.id}
                    onAskDelete={() =>
                      setConfirmId(confirmId === m.id ? null : m.id)
                    }
                    onDelete={() => {
                      setConfirmId(null);
                      remove.mutate(m.id);
                    }}
                  />
                </Fragment>
              );
            })}
          </ol>
        )}
        <div ref={endRef} />
      </div>
      <FormError
        message={remove.error ? mapError(remove.error).message : null}
      />

      <form
        onSubmit={submit}
        className="sticky bottom-[calc(env(safe-area-inset-bottom)+72px)] z-10 -mx-4 flex items-end gap-2 border-t border-line bg-bg/95 px-4 py-2 backdrop-blur md:bottom-0"
      >
        <label htmlFor="chat-input" className="sr-only">
          Nachricht
        </label>
        <textarea
          id="chat-input"
          rows={1}
          value={text}
          maxLength={MAX_MESSAGE_LENGTH}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={
            online
              ? "Nachricht"
              : "Nachricht (wird gesendet, sobald Netz da ist)"
          }
          className="max-h-40 min-h-11 flex-1 resize-none rounded-xl border border-line bg-surface px-3 py-2.5 text-text outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          aria-label="Senden"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-on-primary disabled:opacity-50"
        >
          <SendHorizontal aria-hidden className="size-5" />
        </button>
      </form>
    </Page>
  );
}

function Bubble({
  message: m,
  own,
  showName,
  confirming,
  onAskDelete,
  onDelete,
}: {
  message: ChatMessage;
  own: boolean;
  showName: boolean;
  confirming: boolean;
  onAskDelete: () => void;
  onDelete: () => void;
}) {
  return (
    <li className={`flex flex-col ${own ? "items-end" : "items-start"}`}>
      {showName && (
        <span className="px-1 text-xs font-medium text-muted">
          {m.senderName ?? "Ehemaliges Mitglied"}
        </span>
      )}
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 ${own ? "rounded-br-md bg-primary text-on-primary" : "rounded-bl-md border border-line bg-surface"}`}
      >
        <p className="whitespace-pre-wrap break-words">{m.content}</p>
        <p
          className={`mt-0.5 flex items-center justify-end gap-1 text-[11px] ${own ? "text-on-primary/80" : "text-muted"}`}
        >
          {m.pending ? (
            <>
              <Clock aria-hidden className="size-3" /> Wartet auf Netz
            </>
          ) : (
            timeLabel(m.createdAt)
          )}
          {own && !m.pending && (
            <button
              type="button"
              onClick={onAskDelete}
              aria-label="Nachricht löschen"
              className="ml-1 inline-flex size-6 items-center justify-center rounded"
            >
              <Trash2 aria-hidden className="size-3.5" />
            </button>
          )}
        </p>
      </div>
      {confirming && (
        <div
          role="alertdialog"
          aria-label="Nachricht löschen?"
          className="mt-1 flex items-center gap-2 text-sm"
        >
          <span>Für alle löschen?</span>
          <button
            type="button"
            onClick={onDelete}
            className="min-h-9 rounded-lg bg-danger px-3 font-medium text-white"
          >
            Löschen
          </button>
          <button
            type="button"
            onClick={onAskDelete}
            className="min-h-9 rounded-lg border border-line px-3"
          >
            Abbrechen
          </button>
        </div>
      )}
    </li>
  );
}
