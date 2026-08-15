# dsh-toc-tail

A conversation outline rail with rewind for the DeepSeek Harness web interface. Every user request becomes one tick in a vertical timeline at the conversation column's right edge; the directory panel can rewind to any user request, withdrawing it back to the composer.

## Usage

Each user request compresses into a horizontal tick. Tick width scales with the message length, and the longest request defines the scale. Hover or focus a tick to open a rounded directory panel listing every user request with its summary and a rewind button.

```text
tick column:  ───   ───────   ──   (one tick per user request)
```

- Click a row's summary area to jump to that message.
- Click the rewind button on a row to open the confirm menu.
- In the confirm menu, pick **Restore code** and/or **Summarize** (multi-select), then **Confirm** or **Cancel**.

### Rewind

Rewinding to a user request withdraws that message as if it was never sent: the message text is prefilled back into the composer, and the conversation is folded up to the previous request's assistant reply. Everything from the withdrawn message onward is collapsed.

- **No options selected** — folds to the selected position only.
- **Summarize** — the folded span is summarized by the model and the report replaces it as context.
- **Restore code** — the workspace files are restored to their snapshot at that request (snapshots are taken automatically before every user request).

The folded conversation disappears from the web view, and the fold marker card shows the summary (or a fold notice) with the number of collapsed messages.

## Install or Update

Install from npm:

```sh
dsh plugin --profile web add dsh-toc-tail
```

Or install from the GitHub release tarball:

```sh
dsh plugin --profile web add https://github.com/PaRr0tBoY/dsh-toc-tail/archive/refs/tags/v0.1.0.tar.gz
```

Use the same command to update an existing installation. Restart `dsh web` after installation so the Host and browser client load the new version.

## Theme

The rail, directory panel, and rewind cards follow the DeepSeek Harness theme automatically: colors ride the theme tokens projected onto the document (`--dsw-*`), so switching light/dark themes recolors the whole plugin instantly with no configuration.

## Behavior Notes

- The rail appears once the conversation has at least three user requests.
- The tick of the request whose paragraph is in the viewport stays highlighted; an assistant reply keeps its request's tick highlighted until the next request scrolls into view.
- Rewound requests lose their ticks and their flow rows are hidden.
- The rail is vertically centered against the viewport and sits at the conversation column's right edge, keeping the screen's small edge gap.

## Development

```sh
pnpm install
pnpm run verify
```

The development setup expects the Harness checkout available through the peer dependencies. Built files under `lib/` are committed so profile installation does not require package build scripts.

## License

MIT
