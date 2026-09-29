'use client';

// The disclosure: the one place the piece drops the mask.
//
// A non-modal popover anchored to the `?` in the capsule header, drawn as the
// reference widget's tooltip: a laminate bubble with a dink, landing from below
// the button. It carries two pages, tabs across the top. **Settings** is first
// and default — it is the accessibility surface, where a viewer quiets the
// voice, and its one lever is the settings' whole declaration (`lib/settings`).
// The pacing levers are gone: the typing and the voice's pitch belong to the
// speaking character (`lib/chat-characters.mjs`, `lib/pacing.ts`), and a control
// that moves nothing is worse than no control at all. **About** is second: the
// plain
// sentence, the marks' provenance, the pointer to the real Flock, and the
// privacy policy.
//
// It is non-modal on purpose — the piece has no state to protect — light-dismisses
// on an outside pointer, closes on Esc, and traps no focus. A dev-served page
// (only) also carries a "Start over" control on Settings, beside the settings
// reset — the one session reset, a
// debug fixture builders use to drop the persisted session; a built page never
// renders it. Starting over clears the conversation and never the settings (ADR
// 0006). The bypass path is deliberately absent: it lives in the share kit,
// because a viewer who meets the interstitial never reaches this page. The
// wording is declared once in `lib/share.ts`; `test/copy.test.ts` locks it. The
// prose is Denton — Flock's serif, the disclosure's own voice — while everything
// the viewer can operate inside it stays in the chrome's Book
// (`docs/brand.md`).
//
// SPDX-License-Identifier: CC0-1.0
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useSettings } from '@/hooks/use-settings';
import { DISCLOSURE_SENTENCE } from '@/lib/share';
import { resetSettings, SETTING_CONTROLS, updateSettings, type SettingControl, type Settings } from '@/lib/settings';

export { DISCLOSURE_SENTENCE };

/** One lever's label, its live value, and the slider that sets it. */
function SettingRow({ control }: { control: SettingControl }) {
  const settings = useSettings();
  const id = useId();
  const value = settings[control.key];
  const rounded = Number(value.toFixed(2));
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-baseline justify-between gap-2">
        <label className="text-sm" htmlFor={id}>
          {control.label}
        </label>
        <span className="text-xs tabular-nums">
          {control.unit ? `${rounded} ${control.unit}` : rounded}
        </span>
      </span>
      <input
        className="accent-capsule-content h-1.5 w-full cursor-pointer"
        data-testid={`setting-${control.key}`}
        id={id}
        max={control.max}
        min={control.min}
        onChange={(event) => updateSettings({ [control.key]: Number(event.target.value) } as Partial<Settings>)}
        step={control.step}
        type="range"
        value={value}
      />
      <span className="text-xs leading-snug">{control.hint}</span>
    </div>
  );
}

function SettingsPage({ onReset, debug }: { onReset?: () => void; debug: boolean }) {
  return (
    <div className="flex max-h-[55vh] flex-col gap-3 overflow-y-auto pr-3" data-testid="disclosure-settings">
      {SETTING_CONTROLS.map((control) => (
        <SettingRow control={control} key={control.key} />
      ))}
      <button
        className="mt-1 cursor-pointer self-start text-sm underline underline-offset-2"
        data-testid="settings-reset"
        onClick={resetSettings}
        type="button"
      >
        Reset to defaults
      </button>
      {/* The dev-only session reset rides here beside the settings reset: both
          are resets, and only the conversation is dropped — the settings above
          survive it (ADR 0006). */}
      {onReset && debug ? (
        <button
          className="cursor-pointer self-start text-sm underline underline-offset-2"
          data-testid="reset-button"
          onClick={() => onReset()}
          type="button"
        >
          Start over
        </button>
      ) : null}
    </div>
  );
}

function AboutPage() {
  return (
    <div className="flex flex-col gap-3" data-testid="disclosure-about">
      <p>{DISCLOSURE_SENTENCE}</p>
      <p>
        The Flock wordmark, typefaces and palette reproduce Flock Safety&rsquo;s own, which are Flock Group
        Inc&rsquo;s marks and licensed typefaces; no rights are claimed by this project.
      </p>
      <p>
        The real company is at{' '}
        <a
          className="underline underline-offset-2"
          href="https://www.flocksafety.com/"
          rel="noreferrer noopener"
          target="_blank"
        >
          flocksafety.com
        </a>
        .
      </p>
      <p>
        <a className="underline underline-offset-2" href="/legal/privacy-policy">
          Privacy
        </a>
      </p>
    </div>
  );
}

export function Disclosure({ onReset }: { onReset?: () => void }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<'settings' | 'about'>('settings');
  // The reset affordance is a debug fixture, not a viewer control: it exists so
  // builders can drop the persisted session and start the piece over. It shows
  // only when the dev server serves the page (`NODE_ENV=development`, inlined by
  // Next into the client bundle), so a built page never carries it and the
  // public surface stays chip-driven (the Chat mimic contract).
  const [debug] = useState(() => process.env.NODE_ENV === 'development');
  const root = useRef<HTMLDivElement>(null);
  const toggleId = useId();
  const panelId = useId();
  const settingsTabId = useId();
  const aboutTabId = useId();

  /** Close and return to the first page, so the accessibility levers are what a
   * reopened popover shows however it was dismissed. */
  const close = useCallback(() => {
    setOpen(false);
    setPage('settings');
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    const onPointer = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) close();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [close, open]);

  const tabClass = (active: boolean) =>
    `font-chrome cursor-pointer text-sm text-capsule-content underline-offset-2 ${active ? 'underline' : ''}`;

  // The two pages, in order, as one list: the tabs and the panel both read it, so
  // a new page is one entry rather than a new branch in three places.
  const pages = [
    {
      id: settingsTabId,
      key: 'settings' as const,
      label: 'Settings',
      panel: (
        <SettingsPage
          debug={debug}
          onReset={
            onReset
              ? () => {
                  close();
                  onReset();
                }
              : undefined
          }
        />
      ),
      testId: 'disclosure-tab-settings',
    },
    {
      id: aboutTabId,
      key: 'about' as const,
      label: 'About',
      panel: <AboutPage />,
      testId: 'disclosure-tab-about',
    },
  ];
  const activePage = pages.find((entry) => entry.key === page) ?? pages[0];

  return (
    <div className="relative" ref={root}>
      <button
        aria-expanded={open}
        aria-label="What is this?"
        className="font-chrome flex h-7 w-7 cursor-pointer items-center justify-center rounded-pill border border-edge text-sm text-capsule-content transition-[background-color,transform] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-ground active:scale-[0.96]"
        data-testid="disclosure-toggle"
        id={toggleId}
        onClick={() => (open ? close() : setOpen(true))}
        type="button"
      >
        ?
      </button>
      {open ? (
        <div
          aria-labelledby={toggleId}
          className="tooltip p-4 text-base leading-normal"
          data-testid="disclosure-popover"
          role="dialog"
        >
          <div aria-label="Settings and about" className="flex gap-4" role="tablist">
            {pages.map((entry) => (
              <button
                aria-controls={panelId}
                aria-selected={entry.key === page}
                className={tabClass(entry.key === page)}
                data-testid={entry.testId}
                id={entry.id}
                key={entry.key}
                onClick={() => setPage(entry.key)}
                role="tab"
                type="button"
              >
                {entry.label}
              </button>
            ))}
          </div>
          <div
            aria-labelledby={activePage.id}
            className="mt-3"
            id={panelId}
            role="tabpanel"
            tabIndex={-1}
          >
            {activePage.panel}
          </div>
        </div>
      ) : null}
    </div>
  );
}
