# Third-Party Notices

pi-flint vendors portions of third-party open-source software. The notices below
cover the code that has been copied into this repository.

## opencode

- Project: `anomalyco/opencode` (published on npm as `@opencode-ai/*`)
- Source: https://github.com/anomalyco/opencode
- Commit: `907b3bc518fa48e90e8ec24dd327d13eee71c36c`
- License: MIT

The following vendored trees originate from that commit:

- `src/tui/**` — a wholesale copy of `packages/tui/src` (the opencode terminal
  user interface). All subpaths, including `theme/assets/*.json`, are preserved.
- `src/shims/opencode-ui/audio/*.mp3` — copied verbatim from
  `packages/ui/src/assets/audio`.

The published npm packages `@opencode-ai/sdk` and `@opencode-ai/plugin`
(version `1.18.34`, MIT) are consumed as normal dependencies.

The MIT license text of the upstream project is reproduced below.

---

MIT License

Copyright (c) 2025 opencode

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
