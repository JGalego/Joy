Output assets/case-study.gif

Require claude

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
Set MarginFill "#d95f45"
Set BorderRadius 16
Set WindowBar Rings
Set CursorBlink false
Set WaitTimeout 120s

Hide
Type `unset CLAUDE_CODE_SSE_PORT TERM_PROGRAM TERM_PROGRAM_VERSION; export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`
Enter
Type 'stty -echo; clear; claude --plugin-dir . --setting-sources project --no-chrome --effort medium --permission-mode dontAsk --allowedTools "Read,Glob,Grep,Bash(python3 -m unittest discover -s examples/webhook_worker/tests -v)" --disallowedTools "Edit,Write,NotebookEdit,WebFetch,WebSearch,Task"; stty echo'
Enter
Wait+Screen@60s /Sonnet 5/
Show

Sleep 3s
Type "/joy:joy craft Review the crash-safe webhook worker in examples/webhook_worker. Keep the at-least-once guarantee, retry policy, and claim transition developer-owned. Pair on the send-before-ack crash invariant. Delegate verification: inspect only that fixture and run exactly python3 -m unittest discover -s examples/webhook_worker/tests -v; do not edit files. End with concise headings Keep, Pair, Delegate, Invariant, Verification, and say what remained untouched."
Sleep 500ms
Enter
Wait+Screen@120s /Ran 3 tests/
Sleep 5s
