# Plugin installation

Kuudo can be installed as a whole suite or as individual portable Agent Skills. Choose one installation mode for each client to avoid duplicate skill discovery.

## Whole suite in Claude Code

Install from GitHub in one step (Claude Code 2.1.275 or later):

```text
/plugin install kuudo-skills --marketplace KuudoAI/skills
```

For local development, load the repository directly:

```bash
claude --plugin-dir /absolute/path/to/skills
claude plugin validate /absolute/path/to/skills --strict
```

To exercise the local marketplace instead:

```bash
claude plugin marketplace add /absolute/path/to/skills --scope local
claude plugin install kuudo-skills@kuudo-skills-dev --scope local
```

To install from GitHub instead of a local copy, `claude plugin marketplace add KuudoAI/skills --scope local` replaces the local path; the install command is the same.

### Without a marketplace

The repository root is also a complete plugin (`.claude-plugin/plugin.json`), so Claude Code can load it without adding the marketplace. These routes do not update automatically; download or pull again to get a new version.

- **One session, straight from GitHub.** Point `--plugin-url` at a release archive (pinned) or the `main` branch archive (latest):

  <!-- x-release-please-start-version -->
  ```bash
  claude --plugin-url https://github.com/KuudoAI/skills/archive/refs/tags/v0.10.0.zip
  claude --plugin-url https://github.com/KuudoAI/skills/archive/refs/heads/main.zip
  ```
  <!-- x-release-please-end -->

- **One session, from a local copy.** `claude --plugin-dir` accepts a clone, an unzipped folder, or the `.zip` itself.
- **Every session.** Unzip or copy the repository to `~/.claude/skills/kuudo-skills/`, keeping `.claude-plugin/plugin.json` at that folder's root. Claude Code loads it at startup as `kuudo-skills@skills-dir`, unless an administrator has blocked skills-directory plugins.

Each route loads all skills and the `using-kuudo` startup hook. Use only one of them, and not alongside a marketplace install, so each skill is discovered once. See [Share a plugin without a marketplace](https://code.claude.com/docs/en/plugins/publish#share-a-plugin-without-a-marketplace).

## Whole suite in Claude Desktop and claude.ai

The repository is also a plugin marketplace that the Claude Desktop app and claude.ai can add directly:

1. Open **Customize > Plugins** in the Desktop app or at [claude.ai](https://claude.ai/customize/plugins).
2. Choose **Add > Add marketplace** and enter `KuudoAI/skills`.
3. Install the `kuudo-skills` plugin from that marketplace.

The plugin is saved to your Claude account, so it is available in chat on web, desktop, and mobile, in Cowork, and in Claude Code without a second install. New versions reach your account after they are released; for a marketplace added from GitHub you can also turn on **Sync automatically**. Organization owners can restrict which marketplaces members may add.

What loads differs by surface. Skills load everywhere. Chat ignores plugin hooks, so the `using-kuudo` startup instructions are not injected there; `using-kuudo` is still available as a skill, and you can name it or any other skill in your request. Cowork and Claude Code run the hook.

Without adding the marketplace, you can instead upload the suite as a plugin file. Download [`kuudo-skills.zip`](https://github.com/KuudoAI/skills/releases/latest/download/kuudo-skills.zip) from the latest release, then choose **Customize > Plugins > Add > Upload plugin** and select it. To update, upload the next release's `kuudo-skills.zip` under the same file name: Claude replaces an upload whose file name matches, and a renamed file becomes a second copy. The archive holds only the plugin (manifest, hook, skills, and notices) and contains no symbolic links, which Claude rejects.

An account-installed plugin appears in Claude Code as `kuudo-skills@synced`. If you also installed the suite through the Claude Code CLI on the same machine, remove one installation so each skill is discovered once.

See Anthropic's [plugin overview](https://claude.com/docs/plugins/overview) and [platform support](https://claude.com/docs/plugins/platform-support) for current limits and surface behavior.

## Whole suite in Codex

Register the repository as a local marketplace, then add the plugin:

```bash
codex plugin marketplace add /absolute/path/to/skills
codex plugin add kuudo-skills@kuudo-skills-dev
```

To install from GitHub instead of a local copy, `codex plugin marketplace add KuudoAI/skills` replaces the local path; the add command is the same. These commands were checked against `codex-cli 0.154.0`; use `codex plugin --help` and `codex plugin marketplace --help` to recheck the command surface on a different version.

## Whole suite in Gemini CLI

Install the repository as a Gemini CLI extension from GitHub:

```bash
gemini extensions install https://github.com/KuudoAI/skills
```

For local development, link a local copy instead, so edits apply without reinstalling:

```bash
gemini extensions link /absolute/path/to/skills
```

`gemini-extension.json` at the repository root makes the repository an extension, and Gemini CLI discovers the suite's skills from `skills/`. Like Codex, Gemini CLI uses native skill discovery without the suite's startup instructions. Gemini CLI also reads `hooks/hooks.json`, but it matches `SessionStart` triggers by exact name, so the Claude Code hook's combined matcher keeps that hook from running there.

## One portable skill

An Agent Skills-compatible installer can install one package without the plugin bootstrap:

```bash
npx skills add KuudoAI/skills --skill <skill-name>
npx skills add https://github.com/KuudoAI/skills/tree/main/skills/<skill-name>
```

`npx skills add KuudoAI/skills --all` installs all discoverable portable skills, but it is not the plugin bootstrap mechanism. Choose either plugin installation or portable installation for a given client.

### One skill in Claude Desktop and claude.ai

Claude also accepts a single skill as a ZIP upload:

1. Download the skill's archive from the latest release, for example [`amazon-profitability-calculator.zip`](https://github.com/KuudoAI/skills/releases/latest/download/amazon-profitability-calculator.zip); every skill is published as `<skill-name>.zip`. To build one yourself, zip the skill's folder so the folder itself is the ZIP root (`amazon-profitability-calculator/SKILL.md`), not loose files, and keep the folder name unchanged; it must match the skill's `name`.
2. Open **Customize > Skills**, choose **+ > Create skill > Upload a skill**, and select the ZIP.
3. Enable the skill. Skills require **Code execution and file creation** under **Settings > Capabilities**; on Team and Enterprise plans an owner controls this.

Anthropic's upload guide lists a 200-character maximum for the skill description, and most Kuudo descriptions are longer. Prefer the marketplace above for the full suite; use ZIP upload for a single skill you want to try on its own. See [How to create custom skills](https://support.claude.com/en/articles/12512198-how-to-create-custom-skills) and [Use skills in Claude](https://support.claude.com/en/articles/12512180-using-skills-in-claude).
