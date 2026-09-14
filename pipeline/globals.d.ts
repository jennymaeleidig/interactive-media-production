// The globals the injected layers define on the window, and the type vocabulary
// they read, declared so `checkJs` (`tsconfig.checkjs.json`) can check those
// files where they lie. Nothing here exists at runtime: the layers assign the
// window properties themselves, and the aliases are type-only — the declaration
// they point at is `pipeline/chat-turn.mjs`, and these aliases exist so a frozen
// layer can name it without writing an `import(…)` into its own bytes, which the
// outbound rule must read as code.
//
// SPDX-License-Identifier: CC0-1.0

declare global {
  interface Window {
    /** The Chat mimic's mount guard — the widget injects itself once per page. */
    __flockChat?: boolean;
    /**
     * The client-side dialogue engine, assigned by the bundle the widget ships
     * after (`pipeline/chat-runtime.js`). The widget calls it instead of the
     * message API; see `pipeline/chat-engine.mjs`.
     */
    __flockChatEngine?: { turn(request: ChatRequest): Promise<ChatResponse> };
    /** The story-hook seam the Parody layer will drive (`story-hook.js`). */
    flockParody?: { apply(patches: { selector: string }[]): void };
  }

  /** One client turn: the widget sends it, the client engine answers it. */
  type ChatRequest = import('./chat-turn.mjs').ChatRequest;
  /** One conversation message, as the widget renders it. */
  type ChatLine = import('./chat-turn.mjs').ChatLine;
  /** One pending choice. */
  type ChatOption = import('./chat-turn.mjs').ChatOption;
  /** One turn of the message API. */
  type ChatTurn = import('./chat-turn.mjs').ChatTurn;
  /** The whole body of one message-API response. */
  type ChatResponse = import('./chat-turn.mjs').ChatResponse;

  /**
   * The dialogue runtime types the client engine names without writing an
   * `import(…)` into bytes the outbound rule reads as code.
   */
  type YarnOption = import('yarnspinner-typescript').DialogueOption;
}

export {};
