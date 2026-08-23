#!/usr/bin/env python3
"""
Best-effort structural check for JSX files in an environment with no
JSX compiler available (no network access to install Vite/Babel/esbuild).

This does NOT replace a real compile — it can't catch type errors, undefined
variables, or semantic bugs. It catches the gross structural errors that are
otherwise invisible without tooling: unclosed tags, mismatched braces/parens,
unterminated strings. Every .jsx file in the project is run through this,
and the results are reported honestly rather than claimed as a full
compilation pass.

KNOWN FALSE POSITIVES (confirmed while building this project, not
theoretical): this checker can't distinguish JSX text content from JS code,
so two patterns trigger false "unterminated string" / brace-mismatch
warnings that are not real bugs:
  1. Arrow functions (`=>`) inside JSX attribute expressions — the `>` in
     `=>` looks like a tag close to the tag-matching regex. Worked around by
     masking `=>` before tag matching, but paren/brace counting can still
     be thrown off in edge cases.
  2. Apostrophes inside JSX text content (e.g. "What's on", "isn't built")
     — read as opening a JS string literal, since plain text and string
     literals look identical to a regex with no real parse tree. NOT
     worked around; when this checker flags a file, manually verify by
     reading it before assuming it's a real error.
"""
import re
import sys

def check_file(path):
    with open(path) as f:
        content = f.read()

    issues = []

    # Brace/paren/bracket balance (string- and comment-aware, roughly).
    depth = {'(': 0, '{': 0, '[': 0}
    pairs = {')': '(', '}': '{', ']': '['}
    in_string = None
    in_comment = None
    i = 0
    while i < len(content):
        c = content[i]
        nxt = content[i+1] if i + 1 < len(content) else ''

        if in_comment == 'line':
            if c == '\n':
                in_comment = None
        elif in_comment == 'block':
            if c == '*' and nxt == '/':
                in_comment = None
                i += 1
        elif in_string:
            if c == '\\':
                i += 1
            elif c == in_string:
                in_string = None
        else:
            if c == '/' and nxt == '/':
                in_comment = 'line'
                i += 1
            elif c == '/' and nxt == '*':
                in_comment = 'block'
                i += 1
            elif c in ('"', "'", '`'):
                in_string = c
            elif c in depth:
                depth[c] += 1
            elif c in pairs:
                depth[pairs[c]] -= 1
                if depth[pairs[c]] < 0:
                    issues.append(f"Unmatched closing '{c}' near char {i}")
        i += 1

    for bracket, count in depth.items():
        if count != 0:
            issues.append(f"Unbalanced '{bracket}': off by {count}")

    if in_string:
        issues.append(f"Unterminated string starting with {in_string!r}")

    # JSX tag balance (rough — ignores self-closing detection edge cases
    # inside expressions, but catches the common mistakes). Arrow function
    # `=>` tokens are masked first since their `>` otherwise reads as a
    # false tag-close to this regex.
    tag_scan_content = content.replace('=>', '--')
    tags_opened = re.findall(r'<([A-Za-z][A-Za-z0-9.]*)(?:\s[^>]*)?(?<!/)>', tag_scan_content)
    tags_self_closed = re.findall(r'<([A-Za-z][A-Za-z0-9.]*)(?:\s[^>]*)?/>', tag_scan_content)
    tags_closed = re.findall(r'</([A-Za-z][A-Za-z0-9.]*)>', tag_scan_content)

    from collections import Counter
    opened_count = Counter(tags_opened) - Counter(tags_self_closed)
    closed_count = Counter(tags_closed)
    for tag in set(list(opened_count.keys()) + list(closed_count.keys())):
        diff = opened_count.get(tag, 0) - closed_count.get(tag, 0)
        if diff != 0:
            issues.append(f"JSX tag <{tag}> open/close mismatch (diff={diff})")

    return issues


if __name__ == '__main__':
    all_clean = True
    for path in sys.argv[1:]:
        issues = check_file(path)
        if issues:
            all_clean = False
            print(f"ISSUES in {path}:")
            for issue in issues:
                print(f"   - {issue}")
        else:
            print(f"OK   {path} (structural check only — not a real compile)")
    sys.exit(0 if all_clean else 1)
