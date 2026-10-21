#!/usr/bin/env bash
# Push the tracked files of a ref to the snapshot repo as ONE new commit, authored and pushed
# as the snapshot account. Full history stays in the main repo.
#
# Usage:
#   tools/sync-snapshot.sh deploy [tag]   release: commit + same tag (b-prod-X.Y.Z or f-prod-X.Y.Z;
#                                         defaults to the most recently created such tag)
#   tools/sync-snapshot.sh update [ref]   plain update: commit only, no tag (ref defaults to main)
# Settings (all required, no defaults) are read from the
# gitignored tools/snapshot.env; copy tools/snapshot.env.example to create it.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"

ENV_FILE="$ROOT/tools/snapshot.env"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

# No defaults: every setting must come from tools/snapshot.env.
for var in SNAPSHOT_REMOTE_URL SNAPSHOT_SSH_KEY SNAPSHOT_AUTHOR_NAME SNAPSHOT_AUTHOR_EMAIL; do
  if [[ -z "${!var:-}" ]]; then
    echo "$var is not set. Add it to tools/snapshot.env (see tools/snapshot.env.example)." >&2
    exit 1
  fi
done
if [[ ! -f "$SNAPSHOT_SSH_KEY" ]]; then
  echo "SNAPSHOT_SSH_KEY points to a missing file: $SNAPSHOT_SSH_KEY" >&2
  exit 1
fi

REMOTE_URL="$SNAPSHOT_REMOTE_URL"
AUTHOR_NAME="$SNAPSHOT_AUTHOR_NAME"
AUTHOR_EMAIL="$SNAPSHOT_AUTHOR_EMAIL"
BRANCH="main"
# Release tags are <prefix>-<version>; the prefix selects which changelog documents the release.
TAG_PATTERNS=('b-prod-*' 'f-prod-*')
TAG_REGEX='^(b|f)-prod-[0-9]+\.[0-9]+\.[0-9]+$'
WORK="$ROOT/.git/snapshot-repo"

usage() {
  echo "Usage: $0 deploy [tag] | update [ref]" >&2
  exit 1
}

# Separate throwaway repo inside .git, so the main working tree is never touched.
prepare_work_repo() {
  export GIT_SSH_COMMAND="ssh -i $SNAPSHOT_SSH_KEY -o IdentitiesOnly=yes"
  export GIT_AUTHOR_NAME="$AUTHOR_NAME" GIT_AUTHOR_EMAIL="$AUTHOR_EMAIL"
  export GIT_COMMITTER_NAME="$AUTHOR_NAME" GIT_COMMITTER_EMAIL="$AUTHOR_EMAIL"

  if [[ ! -d "$WORK/.git" ]]; then
    git init -q -b "$BRANCH" "$WORK"
    git -C "$WORK" remote add snapshot "$REMOTE_URL"
  fi
  git -C "$WORK" remote set-url snapshot "$REMOTE_URL"
}

# Continue from what the snapshot repo already has, then replace its files with the tracked files
# of $1 (untracked/ignored files are never exported) and stage everything.
stage_ref() {
  local ref="$1"
  if git -C "$WORK" fetch -q snapshot "$BRANCH" 2>/dev/null; then
    git -C "$WORK" reset -q --hard FETCH_HEAD
  fi
  find "$WORK" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
  git -C "$ROOT" archive "$ref" | tar -x -C "$WORK"
  git -C "$WORK" add -A
}

# Changelog file of a tag: backend/CHANGELOG for b-prod-*, frontend/CHANGELOG for f-prod-*.
changelog_path() {
  case "$1" in
    b-prod-*) echo "backend/CHANGELOG" ;;
    f-prod-*) echo "frontend/CHANGELOG" ;;
  esac
}

# Changelog entry of version $2 as read from ref $1: from "<version>" to the next version heading.
# CR and a leading BOM are stripped so the first heading still matches.
changelog_entry() {
  git -C "$ROOT" show "$1:$(changelog_path "$1")" 2>/dev/null \
    | sed -e '1s/^\xEF\xBB\xBF//' -e 's/\r$//' \
    | awk -v v="$2" '$0 == v {on=1; next} on && /^[0-9]+\.[0-9]+\.[0-9]+$/ {exit} on' \
    | sed -e :a -e '/^\n*$/{$d;N;ba' -e '}' || true
}

deploy() {
  local tag="${1:-$(git -C "$ROOT" tag --list "${TAG_PATTERNS[@]}" --sort=-creatordate | head -n 1)}"
  if [[ -z "$tag" ]] || ! git -C "$ROOT" rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
    echo "Tag '${tag:-<none>}' not found. Create it first, e.g. git tag b-prod-0.7.0" >&2
    exit 1
  fi
  if [[ ! "$tag" =~ $TAG_REGEX ]]; then
    echo "Tag '$tag' must look like b-prod-X.Y.Z or f-prod-X.Y.Z." >&2
    exit 1
  fi
  local version="${tag##*-}"

  prepare_work_repo
  if git -C "$WORK" ls-remote --exit-code --tags snapshot "refs/tags/$tag" >/dev/null 2>&1; then
    echo "Tag $tag already exists on the snapshot repo. Nothing pushed." >&2
    exit 1
  fi

  stage_ref "$tag"
  local notes
  notes="$(changelog_entry "$tag" "$version")"
  # --allow-empty: every release tag gets its own commit even if no files changed.
  git -C "$WORK" commit -q --allow-empty -m "Release $tag" -m "${notes:-No changelog entry found.}"
  git -C "$WORK" tag -a "$tag" -m "Release $tag"
  git -C "$WORK" push snapshot "$BRANCH" "refs/tags/$tag"
  echo "Deployed $tag ($(git -C "$WORK" rev-parse --short HEAD)) to $REMOTE_URL"
}

update() {
  local ref="${1:-main}"
  if ! git -C "$ROOT" rev-parse -q --verify "$ref^{commit}" >/dev/null; then
    echo "Ref '$ref' not found." >&2
    exit 1
  fi

  prepare_work_repo
  stage_ref "$ref"
  if git -C "$WORK" diff --cached --quiet; then
    # A commit made by an earlier run whose push failed is still waiting locally: push it now.
    local remote_head
    remote_head="$(git -C "$WORK" ls-remote snapshot "refs/heads/$BRANCH" | cut -f1)"
    if git -C "$WORK" rev-parse -q --verify HEAD >/dev/null && [[ "$remote_head" != "$(git -C "$WORK" rev-parse HEAD)" ]]; then
      git -C "$WORK" push snapshot "$BRANCH"
      echo "Pushed the pending snapshot commit to $REMOTE_URL"
    else
      echo "No changes since the last snapshot."
    fi
    exit 0
  fi

  local short
  short="$(git -C "$ROOT" rev-parse --short "$ref")"
  git -C "$WORK" commit -q -m "Update $(date +%F) ($short)"
  git -C "$WORK" push snapshot "$BRANCH"
  echo "Updated $REMOTE_URL from $ref ($short)"
}

case "${1:-}" in
  deploy) deploy "${2:-}" ;;
  update) update "${2:-}" ;;
  *) usage ;;
esac
