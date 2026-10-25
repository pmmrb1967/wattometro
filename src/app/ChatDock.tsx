// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * "Pergunta ao Wattómetro" on every page (except Definições): a button in the
 * bottom right corner opens the chat in a panel (the whole screen on phones).
 * The conversation stays while the user moves between pages; the panel and its
 * data are only loaded on the first opening. "/perguntar" opens it on Início.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Outlet, useLocation, useOutletContext } from 'react-router';
import { t } from '../i18n/pt-PT';
import { chatPageOf } from './chat-page';
import {
  CHAT_MAX_WIDTH,
  CHAT_MIN_WIDTH,
  chatWidthAt,
  clampChatWidth,
  loadChatWidth,
  saveChatWidth,
} from './chat-width';
import { CHAT_TITLE_ID, ChatPanel } from './ChatPanel';
import { NavIcon } from './NavIcon';
import type { SessionContext } from './session';

/** The route around the signed-in pages: passes the session on and adds the chat. */
export function WithChat() {
  const session = useOutletContext<SessionContext>();
  return (
    <>
      <Outlet context={session} />
      <ChatDock />
    </>
  );
}

function ChatDock() {
  const { pathname } = useLocation();
  const page = chatPageOf(pathname);
  // Opened at once on an old link to the page it replaced ("/perguntar" then goes to Início).
  const [open, setOpen] = useState(() => pathname.startsWith('/perguntar'));
  const [opened, setOpened] = useState(open);
  const button = useRef<HTMLButtonElement>(null);
  const [width, setWidth] = useState(loadChatWidth);
  const resize = (next: number) => {
    const clamped = clampChatWidth(next, window.innerWidth);
    setWidth(clamped);
    return clamped;
  };

  const show = () => {
    setOpen(true);
    setOpened(true);
  };
  const close = () => {
    setOpen(false);
    // After the button is shown again.
    window.setTimeout(() => button.current?.focus(), 0);
  };

  // Off the page (Definições) the panel stays mounted but hidden: the conversation survives.
  const shown = open && page !== null;
  useEffect(() => {
    document.documentElement.classList.toggle('chat-open', shown);
    return () => document.documentElement.classList.remove('chat-open');
  }, [shown]);
  return (
    <>
      {page && <div className="chat-spacer" aria-hidden="true" />}
      {page && !open && (
        <button
          ref={button}
          type="button"
          className="chat-launcher"
          onClick={show}
          aria-haspopup="dialog"
        >
          <NavIcon section="ask" />
          <span>{t.ask.open}</span>
        </button>
      )}
      {opened && (
        <section
          className="chat-panel"
          role="dialog"
          aria-labelledby={CHAT_TITLE_ID}
          hidden={!shown}
          style={{ '--chat-width': `${width}px` } as CSSProperties}
          onKeyDown={(event) => {
            if (event.key === 'Escape') close();
          }}
        >
          {/* Wide screens: drag the left edge (or use the arrow keys on it) to change the width. */}
          <div
            className="chat-resize"
            role="separator"
            aria-orientation="vertical"
            aria-label={t.ask.resize}
            aria-valuenow={width}
            aria-valuemin={CHAT_MIN_WIDTH}
            aria-valuemax={CHAT_MAX_WIDTH}
            tabIndex={0}
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
              setWidth(chatWidthAt(event.clientX, window.innerWidth));
            }}
            onPointerUp={() => saveChatWidth(width)}
            onKeyDown={(event) => {
              const step = event.key === 'ArrowLeft' ? 40 : event.key === 'ArrowRight' ? -40 : 0;
              if (step === 0) return;
              event.preventDefault();
              saveChatWidth(resize(width + step));
            }}
          />
          <ChatPanel page={page ?? 'home'} open={shown} onClose={close} />
        </section>
      )}
    </>
  );
}
