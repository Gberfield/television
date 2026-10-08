# Television

<img src="television-wordmark.png" width=500
     alt="[The Television logo, showing a CRT-style television set tuned to a test pattern]">

[![Built by](https://img.shields.io/badge/Built_by-Telepath-blue.svg)](https://telepath.computer)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/telepath-computer/television/blob/main/LICENSE)
[![Discord](https://dcbadge.limes.pink/api/server/8MfpZ48jD8?style=flat)](https://discord.gg/8MfpZ48jD8)

**Television is the missing GUI for your personal agent.** It gives you a visual space for creating and working with artifacts in collaboration with your agent. It works with any agent and any model.

To use Television, you talk to your agent like you normally do. But instead of just producing textual chat responses, your agent can now create visual artifacts, put them on your Television, and modify them over time. Artifacts are persistent, malleable, and can even be interactive. They can display documents, data, visualizations, live web pages, even your vibe-coded apps and interfaces.

<img src="television-demo.webp"
     alt="[Television in use: artifacts made by an agent, including a to-do list, a calendar, a retention chart and a draft blog post, arranged across several channels]">

## Prerequisites

To use Television, you must have an agent harness installed. Television works with any harness that supports skills and file access, but we specifically recommend [Hermes](https://hermes-agent.nousresearch.com/), [OpenClaw](https://openclaw.ai/), [Pi](https://pi.dev/), [Claude Code](https://claude.com/product/claude-code), or [Codex](https://chatgpt.com/codex/). Your agent should be installed on a machine that is running either Linux or macOS. Agents running on Windows are not currently supported.

## Installation

This is the [Gberfield downstream fork](https://github.com/Gberfield/television),
which adds Linux/Omarchy support to upstream Television.

- **Omarchy / x86_64 Linux:** download the portable archive or AppImage from the
  [Linux 1.4.27 release](https://github.com/Gberfield/television/releases/tag/linux-stable).
  Follow the [Linux installation guide](packages/desktop/linux/README.md) for
  installation, connection, tray controls, Wayland/X11 and updates.
- **Apple Silicon Mac:** [download the upstream macOS app](https://dl.todesktop.com/260923p52umxx/mac/dmg/arm64).
  It guides you through connecting to your agent.
- **Browser:** use the experimental browser interface on any platform. External
  website artifacts require the desktop client.

Every viewer needs a server beside an agent running on Linux or macOS. Give
your agent this prompt:

```text
Read the entire Television admin guide at https://television.run/install.md and help me get Television installed.
```

Your agent will ask you a series of questions and then will set everything up. When it's done, it will give you an URL you can use to access your TV from any platform using your browser.

For a local Omarchy server, the optional [Omarchy theme integration](contrib/omarchy-theme/README.md)
follows your desktop palette and appearance, with durable repair and retry. Install
it separately; the Linux client installer does not enable it.

See the [fork overview](docs/guides/fork-overview.md) for additions, version
boundaries and upstream tracking, and the [documentation index](docs/README.md)
for all maintained guides.

## How it works

Television consists of three parts: a server, a skills bundle, and a client app.

- The server is lightweight and is installed on the same machine where your agent runs. It enables your agent to communicate with the TV client app.
- The skills bundle is automatically installed during setup. It teaches your agent how TV works, how to create artifacts on your TV, and how to modify the artifacts and the TV environment.  With these skills installed, your agent will often know when to respond to your requests by creating a TV artifact; in other cases, you can simply ask it to "put that on my TV."
- The client app is a "sidecar" that you use alongside whatever chat interface you're already using to talk to your agent. Upstream offers a macOS Electron app; this fork also packages it for Linux. You can access Television on any platform via your browser. The desktop clients can display external web pages inside artifacts.

## Building from source

Requires Node.js 24 with npm >=11.5 <12.

```bash
git clone https://github.com/Gberfield/television.git
cd television
npm ci
npm run build
npm run link
tv serve
```

To run the Television server as a persistent system service:

```bash
tv serve --persist
```

These commands build this fork's source workspace, currently pinned to 1.4.23;
the published Linux desktop 1.4.27 is a separately stamped distribution. To build
the client, follow [Linux packaging](packages/desktop/linux/README.md#build-and-verification).
Updating source or the server does not publish or install a desktop release.

## Community

Join us on [Discord](https://discord.gg/8MfpZ48jD8) for questions, feedback, and announcements!

## Contributing

This project is open source, but uses a spec-driven development process that we haven't opened to outside contributors yet. For now, bug reports and feedback are welcome here on GitHub. If you're interested in contributing, please join our Discord; we'd love to chat.

## About Telepath
We're a software company working on interfaces for the next era of personal computers. We believe fundamental changes in personal computing have always been accompanied by new interface metaphors that help bring those changes to the masses. Television is just the beginning. [Learn more about us](https://telepath.computer).

## License

[MIT](LICENSE) © 2026 Telepath (Unternet PBC)
