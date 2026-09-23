// The window globals the chat's shipped bytes define and read, and the turn
// vocabulary they share, declared so `checkJs` (`tsconfig.checkjs.json`) can
// check those files where they lie. Nothing here exists at runtime: the engine
// assigns the window property itself, and the aliases are type-only — the
// declaration they point at is `lib/chat-turn.mjs`.
//
// SPDX-License-Identifier: CC0-1.0

declare global {
  interface Window {
    /**
     * The client-side dialogue engine, assigned by the bundle the host page
     * serves (`scripts/chat-runtime.js`). The vendored React shell calls it
     * through its `useDialogue` hook; there is no server to call. See
     * `scripts/chat-engine.mjs`.
     */
    __flockChatEngine?: {
      turn(request: ChatRequest): Promise<ChatResponse>;
      /** Forget the session and return the fresh opening turn. */
      reset(): Promise<ChatResponse>;
    };
  }

  /** One client turn: the shell sends it, the client engine answers it. */
  type ChatRequest = import('./chat-turn.mjs').ChatRequest;
  /** One typed piece of a reply. */
  type ChatBlock = import('./chat-turn.mjs').ChatBlock;
  /** One pending choice. */
  type ChatOption = import('./chat-turn.mjs').ChatOption;
  /** One turn of the conversation. */
  type ChatTurn = import('./chat-turn.mjs').ChatTurn;
  /** The whole body of one turn. */
  type ChatResponse = import('./chat-turn.mjs').ChatResponse;

  /**
   * The dialogue runtime option type the client engine names without writing an
   * `import(…)` into the bundle.
   */
  type YarnOption = import('yarnspinner-typescript').DialogueOption;
}

export {};
