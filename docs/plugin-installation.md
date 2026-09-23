# Plugin installation

Kuudo can be installed as a whole suite or as individual portable Agent Skills. Choose one installation mode for each client to avoid duplicate skill discovery.

## Whole suite in Claude Code

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

## Whole suite in Codex

Register the repository as a local marketplace, then add the plugin:

```bash
codex plugin marketplace add /absolute/path/to/skills
codex plugin add kuudo-skills@kuudo-skills-dev
```

To install from GitHub instead of a local copy, `codex plugin marketplace add KuudoAI/skills` replaces the local path; the add command is the same. These commands were checked against `codex-cli 0.154.0`; use `codex plugin --help` and `codex plugin marketplace --help` to recheck the command surface on a different version.

## One portable skill

An Agent Skills-compatible installer can install one package without the plugin bootstrap:

```bash
npx skills add KuudoAI/skills --skill <skill-name>
npx skills add https://github.com/KuudoAI/skills/tree/main/skills/<skill-name>
```

`npx skills add KuudoAI/skills --all` installs all discoverable portable skills, but it is not the plugin bootstrap mechanism. Choose either plugin installation or portable installation for a given client.
