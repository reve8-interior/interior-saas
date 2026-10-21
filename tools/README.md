# tools

## sync-snapshot.sh

Pushes the tracked files of a ref to a separate GitHub repo as **one new commit** (full history stays here). Used to deploy from the snapshot repo by tag.

### Setup

1. Create a dedicated SSH key (no passphrase):
   ```bash
   ssh-keygen -t ed25519 -C "interior@reve8.com" -f ~/.ssh/id_reve8_interior -N ""
   ```
2. Add `~/.ssh/id_reve8_interior.pub` to the snapshot repo: Settings > Deploy keys > Add deploy key, with **Allow write access** ticked.
3. Verify access:
   ```bash
   ssh -i ~/.ssh/id_reve8_interior -o IdentitiesOnly=yes -T git@github.com
   ```
4. Create the settings file and fill in every value (all required, no defaults):
   ```bash
   cp tools/snapshot.env.example tools/snapshot.env
   ```

| Variable | Meaning |
| --- | --- |
| `SNAPSHOT_SSH_KEY` | Path to the private key (path only) |
| `SNAPSHOT_REMOTE_URL` | Snapshot repo, e.g. `git@github.com:<account>/<repo>.git` |
| `SNAPSHOT_AUTHOR_NAME` | Commit author name |
| `SNAPSHOT_AUTHOR_EMAIL` | Commit author email |

`tools/snapshot.env` is gitignored. The script exits with an error if any variable or the key file is missing.

### Commands

Run from anywhere in the repo, using Git Bash on Windows.

```bash
# Release: one commit + same tag on the snapshot repo
tools/sync-snapshot.sh deploy                 # newest b-prod-* / f-prod-* tag (by creation date)
tools/sync-snapshot.sh deploy b-prod-0.6.0    # backend release
tools/sync-snapshot.sh deploy f-prod-0.7.0    # frontend release

# Plain update: commit only, no tag
tools/sync-snapshot.sh update                 # from main
tools/sync-snapshot.sh update <branch|tag|sha>
```

### Release flow

```bash
git tag b-prod-0.7.0                       # tag must look like b-prod-X.Y.Z or f-prod-X.Y.Z
git push origin b-prod-0.7.0               # deploy via GitHub Actions in this repo
tools/sync-snapshot.sh deploy b-prod-0.7.0 # mirror the release to the snapshot repo
```

### Behaviour

- `b-prod-*` reads release notes from `backend/CHANGELOG`; `f-prod-*` from `frontend/CHANGELOG`. The matching version entry becomes the commit body.
- `deploy` refuses if the tag already exists on the snapshot repo, and creates an empty commit if no files changed, so every tag has its own commit.
- `update` does nothing if there are no changes since the last snapshot; it re-pushes a pending commit if an earlier push failed.
- Only tracked files are exported; untracked and ignored files never leave the machine.
- The working copy for pushes lives in `.git/snapshot-repo` and never touches your main working tree.
