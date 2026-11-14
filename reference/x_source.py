"""
x_source.py — Budget-safe ingestion of official Kuwaiti government posts from the X API.

Pricing it is designed around (X pay-per-use, check the Developer Console for current rates):
  * Post read  ~ $0.005 per post returned
  * User read  ~ $0.010 per user returned
  * The same resource read again in the same UTC day is billed once.

Cost-saving choices in this module:
  1. Usernames are resolved to IDs ONCE (one batched call) and cached in state.json.
  2. `since_id` is stored per account, so each poll only returns posts we haven't seen.
  3. No `author_id` expansion: that would return (and bill) a user object on every call.
  4. Retweets and replies are excluded, so we only pay for original announcements.
  5. A local BudgetGuard estimates spend and refuses calls that would go over your cap.
  6. If there is no token or the budget is used up, it falls back to fixtures.json,
     so the demo never breaks in front of the judges.

Usage:
    export X_BEARER_TOKEN=...          # from console.x.com
    python x_source.py                 # one on-demand poll, prints new posts
"""

from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import dataclass, field
from pathlib import Path

import requests

log = logging.getLogger("x_source")

API = "https://api.x.com/2"
POST_READ_USD = 0.005
USER_READ_USD = 0.010

# ---------------------------------------------------------------------------
# Configuration — edit these for your demo
# ---------------------------------------------------------------------------

# Official accounts to follow. Verify each handle in the X app (grey check mark)
# before adding it. Keep the list short during the hackathon.
OFFICIAL_ACCOUNTS: list[str] = [
    # "example_ministry_handle",
]

MAX_BUDGET_USD = float(os.getenv("X_MAX_BUDGET_USD", "3.00"))  # hard local cap
FIRST_RUN_POSTS_PER_ACCOUNT = 10   # backfill size when an account has no since_id
POLL_POSTS_PER_ACCOUNT = 20        # upper bound per account on later polls
STATE_FILE = Path(os.getenv("X_STATE_FILE", "state.json"))
FIXTURE_FILE = Path(os.getenv("X_FIXTURE_FILE", "fixtures.json"))


# ---------------------------------------------------------------------------
# Common shape returned by every source
# ---------------------------------------------------------------------------

def make_item(post_id: str, account: str, date: str, text: str,
              lang: str | None, images: list[str], links: list[str]) -> dict:
    return {
        "id": post_id,
        "account": account,
        "date": date,
        "text": text,
        "lang": lang,
        "images": images,       # send these to OCR / a vision model
        "links": links,         # fetch these pages for the full announcement
        "url": f"https://x.com/{account}/status/{post_id}",
    }


class TweetSource:
    def fetch_new(self) -> list[dict]:
        raise NotImplementedError


# ---------------------------------------------------------------------------
# Persistent state + budget guard
# ---------------------------------------------------------------------------

@dataclass
class State:
    user_ids: dict[str, str] = field(default_factory=dict)   # username -> id
    since_ids: dict[str, str] = field(default_factory=dict)  # username -> newest id
    spent_usd: float = 0.0

    @classmethod
    def load(cls, path: Path) -> "State":
        if path.exists():
            return cls(**json.loads(path.read_text(encoding="utf-8")))
        return cls()

    def save(self, path: Path) -> None:
        path.write_text(json.dumps(self.__dict__, indent=2, ensure_ascii=False),
                        encoding="utf-8")


class BudgetExceeded(RuntimeError):
    pass


class BudgetGuard:
    """Local spend estimate. The real source of truth is the Developer Console,
    so also set a spending limit there."""

    def __init__(self, state: State, cap_usd: float):
        self.state = state
        self.cap = cap_usd

    @property
    def remaining(self) -> float:
        return max(0.0, self.cap - self.state.spent_usd)

    def max_affordable(self, unit_cost: float) -> int:
        return int(self.remaining // unit_cost)

    def charge(self, count: int, unit_cost: float) -> None:
        self.state.spent_usd = round(self.state.spent_usd + count * unit_cost, 4)


# ---------------------------------------------------------------------------
# Live X API source
# ---------------------------------------------------------------------------

class XApiSource(TweetSource):
    def __init__(self, bearer_token: str, accounts: list[str],
                 state: State, budget: BudgetGuard):
        self.accounts = [a.lstrip("@") for a in accounts]
        self.state = state
        self.budget = budget
        self.http = requests.Session()
        self.http.headers["Authorization"] = f"Bearer {bearer_token}"

    # -- low-level request with rate-limit handling --
    def _get(self, path: str, params: dict) -> dict:
        resp = self.http.get(f"{API}{path}", params=params, timeout=20)
        if resp.status_code == 429:
            reset = int(resp.headers.get("x-rate-limit-reset", time.time() + 60))
            raise RuntimeError(f"Rate limited until {time.ctime(reset)}")
        resp.raise_for_status()
        return resp.json()

    # -- one batched lookup, cached forever --
    def _resolve_user_ids(self) -> None:
        missing = [a for a in self.accounts if a not in self.state.user_ids]
        if not missing:
            return
        if self.budget.max_affordable(USER_READ_USD) < len(missing):
            raise BudgetExceeded("Not enough budget to resolve account IDs")
        for i in range(0, len(missing), 100):  # endpoint accepts up to 100 names
            chunk = missing[i:i + 100]
            data = self._get("/users/by", {"usernames": ",".join(chunk)})
            users = data.get("data", [])
            self.budget.charge(len(users), USER_READ_USD)
            for u in users:
                self.state.user_ids[u["username"]] = u["id"]
            for err in data.get("errors", []):
                log.warning("Could not resolve %s: %s", err.get("value"), err.get("detail"))

    def _fetch_account(self, username: str) -> list[dict]:
        user_id = self.state.user_ids.get(username)
        if not user_id:
            return []

        since_id = self.state.since_ids.get(username)
        wanted = POLL_POSTS_PER_ACCOUNT if since_id else FIRST_RUN_POSTS_PER_ACCOUNT
        affordable = self.budget.max_affordable(POST_READ_USD)
        limit = min(wanted, affordable)
        if limit < 5:  # the endpoint's minimum max_results is 5
            raise BudgetExceeded("Post-read budget used up")

        params = {
            "max_results": max(5, min(limit, 100)),
            "exclude": "retweets,replies",
            "tweet.fields": "created_at,lang,entities,attachments",
            "expansions": "attachments.media_keys",
            "media.fields": "url,preview_image_url,type",
        }
        if since_id:
            params["since_id"] = since_id

        data = self._get(f"/users/{user_id}/tweets", params)
        posts = data.get("data", [])
        self.budget.charge(len(posts), POST_READ_USD)
        if not posts:
            return []

        media = {m["media_key"]: m for m in data.get("includes", {}).get("media", [])}
        items = []
        for p in posts:
            keys = p.get("attachments", {}).get("media_keys", [])
            images = [media[k].get("url") or media[k].get("preview_image_url")
                      for k in keys if k in media]
            links = [u.get("unwound_url") or u.get("expanded_url")
                     for u in p.get("entities", {}).get("urls", [])
                     if "x.com" not in (u.get("expanded_url") or "")
                     and "twitter.com" not in (u.get("expanded_url") or "")]
            items.append(make_item(p["id"], username, p.get("created_at", ""),
                                   p.get("text", ""), p.get("lang"),
                                   [i for i in images if i], [l for l in links if l]))

        # Posts come newest first; remember the newest so next poll skips everything older.
        self.state.since_ids[username] = data.get("meta", {}).get("newest_id", posts[0]["id"])
        return items

    def fetch_new(self) -> list[dict]:
        self._resolve_user_ids()
        items: list[dict] = []
        for username in self.accounts:
            try:
                items.extend(self._fetch_account(username))
            except BudgetExceeded:
                log.warning("Budget cap reached; stopping this poll.")
                break
            except Exception as exc:  # one bad account shouldn't stop the poll
                log.error("Failed to fetch %s: %s", username, exc)
        return items


# ---------------------------------------------------------------------------
# Offline fallback for the demo
# ---------------------------------------------------------------------------

class FixtureSource(TweetSource):
    """Reads hand-collected posts from fixtures.json (same item shape as above)."""

    def __init__(self, path: Path):
        self.path = path

    def fetch_new(self) -> list[dict]:
        if not self.path.exists():
            return []
        return json.loads(self.path.read_text(encoding="utf-8"))


# ---------------------------------------------------------------------------
# Entry point used by the rest of the app
# ---------------------------------------------------------------------------

def poll_once() -> tuple[list[dict], str]:
    """Run one poll. Returns (items, source_name). Call this from a 'Check for
    new announcements' button or an admin endpoint, not from a tight loop."""
    state = State.load(STATE_FILE)
    budget = BudgetGuard(state, MAX_BUDGET_USD)
    token = os.getenv("X_BEARER_TOKEN")

    if token and OFFICIAL_ACCOUNTS and budget.remaining > 0:
        source: TweetSource = XApiSource(token, OFFICIAL_ACCOUNTS, state, budget)
        name = "x_api"
    else:
        source, name = FixtureSource(FIXTURE_FILE), "fixtures"

    try:
        items = source.fetch_new()
    finally:
        state.save(STATE_FILE)

    log.info("Source=%s new_items=%d est_spent=$%.3f remaining=$%.3f",
             name, len(items), state.spent_usd, budget.remaining)
    return items, name


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    new_items, used = poll_once()
    print(json.dumps(new_items, indent=2, ensure_ascii=False))
