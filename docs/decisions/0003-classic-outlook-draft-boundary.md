# ADR-0003: Classic Outlook Draft Automation Boundary

- Status: Accepted
- Date: 2026-08-04

## Context

The first release must turn the canonical dashboard report into a visible draft in Windows classic Outlook. It must work offline, preserve the user's normal Outlook signature when possible, never send mail, and retain useful fallbacks when COM automation or PowerShell is unavailable under corporate policy.

The browser cannot directly use the Outlook Object Model. The loopback Node application therefore needs a narrowly scoped local bridge. That bridge handles untrusted Chinese report content, so command construction and HTML insertion are security boundaries rather than ordinary process-invocation details.

## Decision

### 1. Adapter and HTTP boundary

Outlook automation is isolated behind a `MailDraftAdapter`. Production code receives a subject, a server-generated HTML fragment, and optionally bounded PNG/JPEG/GIF bytes resolved by the server from validated internal media assets. It does not accept recipients, client-authored attachment paths, general attachments, arbitrary script paths, commands, remote images, or raw client-supplied HTML.

Creating a draft is an explicit `POST` action. The browser adds a non-simple action header and the server remains loopback-only with CORS disabled. This is an initial same-origin guard; the release-hardening phase will replace or reinforce it with the application's per-install capability token.

The API returns only a bounded result category such as displayed, unsupported platform, classic Outlook unavailable, PowerShell unavailable, timeout, or automation blocked. It never returns report content, temporary paths, or raw PowerShell diagnostics to the browser.

### 2. PowerShell process invocation

The Windows adapter invokes the committed script with `shell: false` and a fixed Windows PowerShell executable under `SystemRoot`. It uses `-NoLogo`, `-NoProfile`, `-STA`, and `-File`; it does not use `-Command`, `Invoke-Expression`, an execution-policy bypass, or string-built shell commands.

Subject and HTML never appear in command-line arguments. Node writes a bounded UTF-8 JSON request into a unique user-temporary directory and passes only that file path as one argument. Validated internal inline images are written into the same directory with generated filenames; their count, per-image size, aggregate size, content ID, declared MIME type, and file signature are bounded before materialization. The script reads and validates the JSON as data and rejects any image path outside that request directory. Node deletes the entire temporary directory in `finally`, limits captured output, and terminates a bridge invocation that exceeds the configured timeout.

The committed script performs no network access and exposes only two modes:

- `Probe`: confirm that the classic Outlook COM ProgID is registered without creating a mail item.
- `CreateDraft`: create one `olMailItem`, populate subject/body, and display its inspector.

### 3. Signature-preserving draft creation

The script creates an HTML mail item, assigns the subject, and calls `Display(false)` before inserting report HTML. Displaying the inspector allows classic Outlook to initialize its normal compose editor and default signature.

The script then reads the initialized `HTMLBody` and inserts the server-generated report fragment immediately after the existing opening `<body>` tag. If no body tag exists, it prepends the fragment. This preserves the remaining body, including the default signature, instead of replacing it with a separately generated full HTML document.

Signature preservation is best-effort because it remains controlled by the user's Outlook configuration and corporate add-ins. The Windows acceptance test must verify the actual configured signature and any add-in behavior.

### 4. Hard no-send guarantee

No production interface accepts recipients. The PowerShell script contains no calls to `Recipients.Add`, `To`, `CC`, `BCC`, `Send`, `Submit`, or equivalent APIs. It also does not call `Save`; it opens a compose inspector and leaves save, discard, recipients, editing, and send actions to the user and Outlook.

Automated tests scan the shipped script for forbidden member calls in addition to testing the TypeScript adapter contract. Release review includes the same check. The implementation may display only a newly created mail item; it never operates on an existing message.

### 5. HTML and subject safety

The canonical report model remains the sole source of data. The Outlook renderer produces a fragment with table layout, inline styles, conservative fonts, no scripts, no external stylesheets, no remote images, and escaped text. Image sources are server-generated `cid:` references paired only with validated internal assets. URL values are text in the first release rather than executable links.

The subject is normalized to one line, has control characters removed, and is length-bounded. The JSON request has a fixed schema and size limit. Generated HTML is treated as untrusted data all the way through process invocation; it is never evaluated as PowerShell.

### 6. Fallback order

The user retains two fallbacks independent of Outlook automation:

1. Copy both `text/html` and `text/plain` representations through the browser Clipboard API after a direct user gesture.
2. Download a complete UTF-8 `.html` report that can be opened or pasted manually.

If clipboard permission or browser policy blocks rich copy, the UI keeps the HTML download available. On non-Windows development machines, HTML generation, download, clipboard behavior, adapter validation, and failure mapping remain testable; only the final COM behavior is a Windows manual gate.

## Consequences

- Report content cannot become PowerShell source code or alter process arguments.
- A dashboard image can enter Outlook only as bounded, signature-matching internal bytes addressed by a generated CID; arbitrary filesystem attachments remain outside the adapter contract.
- The bridge has a small, reviewable surface and a mechanically enforceable no-send rule.
- Existing Outlook signatures are preserved more reliably than assigning a replacement full `HTMLBody` before the inspector is initialized.
- Creating a draft remains dependent on Windows classic Outlook, Windows PowerShell, user profile health, and corporate automation policy.
- Availability probing can confirm registration but cannot guarantee that a later COM call will not be blocked; create failures must still map to actionable fallbacks.
- Windows acceptance testing is mandatory before Phase 6 is declared complete.

## Rejected alternatives

### Microsoft Graph or external mail service

Rejected for the first release because it requires cloud identity, consent, network access, and tenant policy work that conflicts with the local-first requirement.

### `mailto:` links

Rejected because they cannot reliably carry report-quality HTML tables, preserve layout, or provide a robust signature workflow.

### Passing HTML through `powershell.exe -Command`

Rejected because quoting is fragile and turns report content into a command-injection boundary.

### Replacing `HTMLBody` before `Display`

Rejected because it can prevent or overwrite the normal default-signature initialization.

### Automating Save or Send

Rejected because the user must retain final control and because automatic sending is explicitly out of scope.

## Verification

- Unit-test Outlook fragment escaping, plain-text output, subject normalization, request-size limits, CID and image-signature limits, process arguments, timeouts, exit-code mapping, and temporary-file cleanup.
- Scan the committed PowerShell script for forbidden send/recipient/save operations and dynamic command execution.
- Integration-test API success/failure mapping with a fake adapter on macOS/Linux.
- On the target Windows machine, verify classic Outlook detection, signature retention, Chinese and long-text rendering, multiple independent tables, inline PNG/JPEG/GIF images, status highlighting, and visible compose-window behavior.
