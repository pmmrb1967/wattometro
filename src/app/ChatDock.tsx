// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * "Pergunta ao Wattómetro" on every page (except Definições): a button in the
 * bottom right corner opens the chat in a panel (the whole screen on phones).
 * The conversation stays while the user moves between pages; the panel and its
 * data are only loaded on the first opening. "/perguntar" opens it on Início.
 */
import { useRef, useState } from 'react';
import { Outlet, useLocation, useOutletContext } from 'react-router';
import { t } from '../i18n/pt-PT';
import { chatPageOf } from './chat-page';
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
          onKeyDown={(event) => {
            if (event.key === 'Escape') close();
          }}
        >
          <ChatPanel page={page ?? 'home'} open={shown} onClose={close} />
        </section>
      )}
    </>
  );
}
