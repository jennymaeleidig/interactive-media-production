// The window globals the chat's shipped bytes define and read, and the turn
// vocabulary they share, declared so `checkJs` (`tsconfig.checkjs.json`) can
// check those files where they lie. Nothing here exists at runtime: the widget
// assigns the window properties itself, and the aliases are type-only — the
// declaration they point at is `pipeline/chat-turn.mjs`.
//
// SPDX-License-Identifier: CC0-1.0

declare global {
  interface Window {
    /** The widget's mount guard — it injects itself once per page. */
    __flockChat?: boolean;
    /**
     * The client-side dialogue engine, assigned by the bundle the widget ships
     * after (`pipeline/chat-runtime.js`). The widget calls it; there is no
     * server to call. See `pipeline/chat-engine.mjs`.
     */
    __flockChatEngine?: { turn(request: ChatRequest): Promise<ChatResponse> };
  }

  /** One client turn: the widget sends it, the client engine answers it. */
  type ChatRequest = import('./chat-turn.mjs').ChatRequest;
  /** One conversation message, as the widget renders it. */
  type ChatLine = import('./chat-turn.mjs').ChatLine;
  /** One pending choice. */
  type ChatOption = import('./chat-turn.mjs').ChatOption;
  /** One turn of the conversation. */
  type ChatTurn = import('./chat-turn.mjs').ChatTurn;
  /** The whole body of one turn. */
  type ChatResponse = import('./chat-turn.mjs').ChatResponse;

  /**
   * The dialogue runtime type the client engine names without writing an
   * `import(…)` into bytes the no-network rule reads as code.
   */
  type YarnOption = import('yarnspinner-typescript').DialogueOption;
}

export {};
