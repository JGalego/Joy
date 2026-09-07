Output assets/copilot.gif

Require copilot
Require node

Set Shell bash
Set Width 1200
Set Height 760
Set FontSize 17
Set TypingSpeed 7ms
Set Framerate 24
Set PlaybackSpeed 1.15
Set Theme "Catppuccin Mocha"
Set Padding 28
Set Margin 24
Set MarginFill "#0969da"
Set BorderRadius 16
Set WindowBar Rings
Set CursorBlink false
Set WaitTimeout 60s

# Authenticate Copilot and trust the checkout once before recording.
Hide
Type `unset TERM_PROGRAM TERM_PROGRAM_VERSION; export COPILOT_MULTIPLEXER=none`
Enter
Type `stty -echo; clear; copilot --plugin-dir . --banner --no-remote --no-auto-update --disable-builtin-mcps --available-tools= --effort low --session-id "$(node -p 'crypto.randomUUID()')"; stty echo`
Enter
Wait+Screen@60s /Loading: .*plugin/
Show
Wait+Screen@60s /open sidebar/

Sleep 3s
Type "Use the /joy skill in learn mode. I'm debugging a binary search that skips the final candidate. Keep the diagnosis and fix mine; pair on the loop invariant; delegate one minimal Vitest case. Do not inspect or edit files, and do not reveal the fix. Reply in at most 12 lines: Keep, Pair, Delegate, one hint, then a three-line TypeScript test."
Sleep 500ms
Enter
Wait+Screen@60s /Delegate:/
Sleep 5s
