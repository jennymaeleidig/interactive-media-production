# Persist the viewer's settings, beside the session

The `?` popover now carries a Settings page: the levers a viewer may tune — the voice's
volume, pitch, spread, and speed, and the piece's typing, thinking, and pause paces. A
preference is only worth offering if it survives a reload, especially the volume lever, which
is the accessibility affordance. So settings persist in the viewer's own browser under
`localStorage['flock-chat-settings']`, a key of their own.

This revises a consequence of [0005](0005-ask-the-viewer-for-nothing.md), not its rule. That
record's rule — the piece asks nothing and no request's target or payload is derived from
viewer input — still holds: settings are never sent anywhere, and no request reads them. What
0005 named as "the single persistence point" was the session; a preference is the viewer's own
device state, not data about them. Two local keys now exist, and this record is the one that
admits the second.

## Amended by 0007

[0007](0007-the-character-owns-the-feel.md) narrows this record to the volume preference: the
piece's typing pace belongs to the speaking character and the voice's pitch to the character too,
so `lib/settings` declares one control and the key becomes `flock-chat-settings-v2`. The rule
above is unchanged; the lever list and the `flock-chat-settings` key below are superseded.

## Consequences

- `localStorage` holds two keys: `flock-chat-state` (the session, owned by the engine) and
  `flock-chat-settings` (the preferences, owned by `lib/settings`).
- **Start over** clears the conversation alone. The reset drops the session key; it never
  touches the settings key, so a viewer's tuning survives a restart.
- A new lever takes three small edits: a field on `Settings`, a default value in `DEFAULT_SETTINGS`,
  and one entry in `SETTING_CONTROLS` (`lib/settings`). The Settings page renders from that
  declaration and the value persists automatically; `lib/pacing` stays the defaults declaration.
- The store degrades the same way the session does: writes go through `resilientStore`, so a
  browser that refuses storage still tunes the piece for the visit, it just cannot keep it.
- 0005's "single persistence point" consequence is superseded by this record; 0005 is otherwise
  unchanged.
